import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { guardarComputadora, listarComputadoras } from "../src/api/computadoras.js";
const original = globalThis.fetch;
const datos = { identificador: "PC-01", nombre: "Aula 3", grado: 3 };
const computadora = { ...datos, id: 1, activo: true, fecha_registro: "2026-11-13T15:00:00.000Z" };
afterEach(() => { globalThis.fetch = original; });

test("lista equipos con JWT, paginación y sin almacenar credenciales de equipo", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/computadoras?limit=50&offset=50"));
    assert.equal(opciones.headers.Authorization, "Bearer admin");
    assert.equal(opciones.cache, "no-store");
    return { ok: true, json: async () => ({ computadoras: [computadora], hayMas: true }) };
  };
  assert.deepEqual(await listarComputadoras("admin", { offset: 50 }), { computadoras: [computadora], hayMas: true });
});

test("registro y edición usan endpoints administrativos y conservan los campos permitidos", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/computadoras"));
    assert.equal(opciones.method, "POST");
    assert.equal(opciones.headers.Authorization, "Bearer admin");
    assert.deepEqual(JSON.parse(opciones.body), datos);
    return { ok: true, json: async () => ({ computadora }) };
  };
  assert.deepEqual(await guardarComputadora(datos, "admin"), computadora);
  const cambios = { nombre: "Biblioteca", grado: 5 };
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/computadoras/1"));
    assert.equal(opciones.method, "PATCH");
    assert.deepEqual(JSON.parse(opciones.body), cambios);
    return { ok: true, json: async () => ({ computadora: { ...computadora, ...cambios } }) };
  };
  assert.equal((await guardarComputadora(cambios, "admin", 1)).grado, 5);
});

test("habilita y deshabilita enviando solamente el booleano activo", async () => {
  for (const activo of [false, true]) {
    globalThis.fetch = async (url, opciones) => {
      assert.ok(url.endsWith("/computadoras/1"));
      assert.deepEqual(JSON.parse(opciones.body), { activo });
      return { ok: true, json: async () => ({ computadora: { ...computadora, activo } }) };
    };
    assert.equal((await guardarComputadora({ activo }, "admin", 1)).activo, activo);
  }
});

test("rechaza datos inválidos, identificador editable y falta de sesión sin enviar solicitudes", async () => {
  globalThis.fetch = () => assert.fail("No debe consultar la red");
  for (const body of [{ ...datos, grado: "3" }, { ...datos, grado: 6 }, { ...datos, nombre: " " }, { ...datos, identificador: "PC 01" }, { ...datos, activo: true }]) {
    await assert.rejects(guardarComputadora(body, "admin"));
  }
  await assert.rejects(guardarComputadora({ identificador: "PC-02" }, "admin", 1));
  await assert.rejects(guardarComputadora({ activo: "false" }, "admin", 1));
  await assert.rejects(guardarComputadora(datos, ""), /sesión/);
  await assert.rejects(listarComputadoras(""), /sesión/);
  await assert.rejects(listarComputadoras("admin", { offset: -1 }), /Paginación/);
});

test("muestra duplicados, acceso denegado y errores sin anunciar éxito", async () => {
  for (const mensaje of ["El identificador ya está registrado.", "La sesión fue invalidada.", "Computadora no encontrada."]) {
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ mensaje }) });
    await assert.rejects(guardarComputadora(datos, "admin"), e => e.message === mensaje);
  }
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ computadora: { ...computadora, id: 2 } }) });
  await assert.rejects(guardarComputadora({ activo: false }, "admin", 1), /verificar/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ computadoras: [{ ...computadora, grado: 99 }], hayMas: false }) });
  await assert.rejects(listarComputadoras("admin"), /no es válida/);
});

test("una respuesta incierta no reintenta registros ni cambios de estado", async () => {
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error("red"); };
  await assert.rejects(guardarComputadora(datos, "admin"), /no se reintentó/);
  assert.equal(llamadas, 1);
  globalThis.fetch = async () => ({ ok: true, json: async () => { throw new Error("JSON inválido"); } });
  await assert.rejects(guardarComputadora({ activo: false }, "admin", 1), /Consulta la lista/);
});
