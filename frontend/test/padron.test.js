import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { importarPadron, registrarEstudiante, validarArchivoPadron, MAX_EXCEL_BYTES, ErrorPadron } from "../src/api/padron.js";

// Solo contratos HTTP con fetch interceptado; no se usa red ni PostgreSQL.
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const excel = () => new File(["contenido exclusivo de prueba de transporte"], "padron.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
const responder = (status, datos) => ({ ok: status >= 200 && status < 300, status, json: async () => datos });

test("acepta únicamente xlsx no vacío y respeta los 5 MiB del backend", () => {
  for (const archivo of [null, { name: "padron.xls", size: 10 }, { name: "padron.csv", size: 10 }, { name: "padron.xlsx", size: 0 }, { name: "padron.xlsx", size: MAX_EXCEL_BYTES + 1 }]) {
    assert.throws(() => validarArchivoPadron(archivo), ErrorPadron);
  }
  assert.doesNotThrow(() => validarArchivoPadron({ name: "PADRON.XLSX", size: MAX_EXCEL_BYTES }));
});
test("la importación usa solo archivo en FormData, Bearer y boundary del navegador", async () => {
  const archivo = excel();
  let llamadas = 0;
  globalThis.fetch = async (url, opciones) => {
    llamadas++;
    assert.ok(url.endsWith("/api/padron/importar"));
    assert.equal(opciones.method, "POST");
    assert.deepEqual(opciones.headers, { Authorization: "Bearer admin-prueba" });
    assert.ok(opciones.body instanceof FormData);
    assert.deepEqual([...opciones.body.keys()], ["archivo"]);
    assert.equal(opciones.body.get("archivo").name, archivo.name);
    return responder(200, { mensaje: "Padrón reemplazado correctamente.", total: 2, reemplazados: 1 });
  };
  assert.equal((await importarPadron(archivo, "admin-prueba")).total, 2);
  assert.equal(llamadas, 1);
});
test("archivo inválido o falta de sesión no envían peticiones", async () => {
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error("No debe ejecutarse"); };
  await assert.rejects(importarPadron(new File(["x"], "otro.csv"), "admin"));
  await assert.rejects(importarPadron(excel(), ""), e => e.status === 401);
  assert.equal(llamadas, 0);
});
test("conserva errores de DNI inválido y duplicado por fila devueltos por backend", async () => {
  const errores = [
    { fila: 2, campo: "dni", mensaje: "Debe tener 8 dígitos." },
    { fila: 3, campo: "dni", mensaje: "El DNI está repetido en el archivo." },
  ];
  globalThis.fetch = async () => responder(422, { mensaje: "No se importó ninguna fila.", errores });
  await assert.rejects(importarPadron(excel(), "admin"), e => e.status === 422 && JSON.stringify(e.errores) === JSON.stringify(errores));
});
test("muestra rechazo por votos previos y sesión inválida sin anunciar éxito", async () => {
  for (const [status, mensaje] of [[409, "No se puede reemplazar el padrón después de que haya comenzado la votación."], [401, "La sesión fue invalidada."], [413, "El archivo supera el límite."]]) {
    globalThis.fetch = async () => responder(status, { mensaje });
    await assert.rejects(importarPadron(excel(), "admin"), e => e.status === status && e.message === mensaje);
  }
});
test("no reintenta una importación con respuesta incierta", async () => {
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error("Conexión perdida"); };
  await assert.rejects(importarPadron(excel(), "admin"), e => e.incierto === true);
  assert.equal(llamadas, 1);
  globalThis.fetch = async () => responder(200, {});
  await assert.rejects(importarPadron(excel(), "admin"), e => e.incierto === true);
});
test("el formulario manual conserva DNI y combina nombres y apellidos para la API", async () => {
  const datos = { dni: "01234567", nombres: " Ana María ", apellidos: " Torres Quispe ", grado: "3°", seccion: "A" };
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/api/estudiantes"));
    assert.equal(opciones.headers.Authorization, "Bearer admin");
    assert.equal(opciones.headers["Content-Type"], "application/json");
    const body = JSON.parse(opciones.body);
    assert.deepEqual(body, { dni: "01234567", nombre: "Ana María Torres Quispe", grado: "3°", seccion: "A" });
    return responder(201, { estudiante: { id: 7, ...body, activo: true, ya_voto: false } });
  };
  assert.equal((await registrarEstudiante(datos, "admin")).id, 7);
});
test("el registro manual valida DNI y muestra los conflictos de duplicados", async () => {
  const datos = { dni: "123", nombres: "Ana", apellidos: "Torres", grado: "3", seccion: "A" };
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; return responder(409, { mensaje: "El DNI ya está registrado." }); };
  await assert.rejects(registrarEstudiante(datos, "admin"), e => e.status === 400);
  assert.equal(llamadas, 0);
  await assert.rejects(registrarEstudiante({ ...datos, dni: "01234567" }, "admin"), e => e.status === 409);
});
