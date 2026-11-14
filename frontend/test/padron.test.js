import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { previsualizarPadron, importarPadron, registrarEstudiante, validarArchivoPadron, MAX_EXCEL_BYTES, ErrorPadron } from "../src/api/padron.js";

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
const idVista = '12345678-1234-1234-1234-123456789abc';
const cantidades = { agregados: 2, actualizados: 0, eliminados: 0, sinCambios: 0 };
test("la vista previa env?a archivo, grado y modo con JWT y CSRF sin fijar boundary", async () => {
  let llamadas = 0;
  globalThis.fetch = async (url, opciones) => {
    llamadas++; assert.ok(url.endsWith('/api/padron/previsualizar'));
    assert.equal(opciones.headers.Authorization, 'Bearer admin'); assert.equal(opciones.headers['X-Padron-CSRF'], '1'); assert.equal(opciones.headers['Content-Type'], undefined);
    assert.deepEqual([...opciones.body.keys()], ['archivo', 'grado', 'modo']); assert.equal(opciones.body.get('grado'), '3'); assert.equal(opciones.body.get('modo'), 'agregar');
    return responder(200, { vistaPreviaId: idVista, grado: 3, modo: 'agregar', estudiantes: [], eliminados: [], cantidades });
  };
  assert.equal((await previsualizarPadron(excel(), 3, 'agregar', 'admin')).vistaPreviaId, idVista); assert.equal(llamadas, 1);
});
test("la confirmaci?n solo env?a la vista previa y consentimiento, sin archivo ni grado falsificable", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith('/api/padron/importar')); assert.equal(opciones.headers['X-Padron-CSRF'], '1'); assert.equal(opciones.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(opciones.body), { vistaPreviaId: idVista, confirmar: true });
    return responder(200, { grado: 3, total: 2, cantidades });
  };
  assert.equal((await importarPadron(idVista, 'admin')).total, 2);
});
test("archivo, grado, modo, sesi?n o vista previa inv?lidos no env?an solicitudes", async () => {
  let llamadas = 0; globalThis.fetch = async () => { llamadas++; throw new Error('No llamar'); };
  await assert.rejects(previsualizarPadron(new File(['x'], 'otro.csv'), 3, 'agregar', 'admin'));
  for (const grado of [0, 6, '']) await assert.rejects(previsualizarPadron(excel(), grado, 'agregar', 'admin'));
  await assert.rejects(previsualizarPadron(excel(), 3, 'global', 'admin'));
  await assert.rejects(previsualizarPadron(excel(), 3, 'agregar', ''), e => e.status === 401);
  await assert.rejects(importarPadron('invalida', 'admin')); assert.equal(llamadas, 0);
});
test("preserva los errores de fila de DNI y grado devueltos por el servidor", async () => {
  const errores = [{ fila: 2, campo: 'grado', mensaje: 'No coincide' }, { fila: 3, campo: 'dni', mensaje: 'Otro grado' }];
  globalThis.fetch = async () => responder(422, { mensaje: 'Archivo inv?lido', errores });
  await assert.rejects(previsualizarPadron(excel(), 3, 'agregar', 'admin'), e => e.status === 422 && JSON.stringify(e.errores) === JSON.stringify(errores));
});
test("elecci?n abierta, votos y falta de sesi?n no anuncian ?xito", async () => {
  for (const status of [401, 409, 413]) {
    globalThis.fetch = async () => responder(status, { mensaje: 'Rechazado' });
    await assert.rejects(importarPadron(idVista, 'admin'), e => e.status === status);
  }
});
test("una respuesta incierta no reintenta la confirmaci?n ni anuncia ?xito", async () => {
  let llamadas = 0; globalThis.fetch = async () => { llamadas++; throw new Error('Red'); };
  await assert.rejects(importarPadron(idVista, 'admin'), e => e.incierto); assert.equal(llamadas, 1);
  globalThis.fetch = async () => responder(200, {}); await assert.rejects(importarPadron(idVista, 'admin'), e => e.incierto);
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
