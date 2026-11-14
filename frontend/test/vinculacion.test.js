import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { gestionarVinculacion, consultarPuesto, vincularPuesto } from "../src/api/vinculacion.js";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const codigo = "a".repeat(64);

test("solo el administrador genera autorizaciones temporales o revoca", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/computadoras/1/autorizaciones"));
    assert.equal(opciones.headers.Authorization, "Bearer admin");
    assert.equal(opciones.method, "POST");
    assert.equal(opciones.credentials, undefined);
    assert.equal(opciones.body, "{}");
    return { ok: true, json: async () => ({ codigo, vence_en: "2099-01-01T00:00:00Z" }) };
  };
  assert.equal((await gestionarVinculacion(1, "autorizaciones", "admin")).codigo, codigo);
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/computadoras/1/revocar"));
    assert.equal(opciones.headers.Authorization, "Bearer admin");
    return { ok: true, json: async () => ({ estado: "revocada" }) };
  };
  assert.equal((await gestionarVinculacion(1, "revocar", "admin")).estado, "revocada");
});

test("el puesto presenta solo el código con cookie y cabecera CSRF, sin JWT ni grado", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/puesto/vincular"));
    assert.equal(opciones.credentials, "include");
    assert.equal(opciones.headers["X-Puesto-CSRF"], "1");
    assert.equal(opciones.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(opciones.body), { codigo });
    return { ok: true, json: async () => ({ estado: "vinculada" }) };
  };
  assert.equal((await vincularPuesto(codigo)).estado, "vinculada");
});

test("la consulta usa cookie y representa revocación o vencimiento como estado sin credenciales JS", async () => {
  for (const estado of ["revocada", "vencida", "sin_vincular", "deshabilitada"]) {
    globalThis.fetch = async (url, opciones) => {
      assert.ok(url.endsWith("/puesto/estado"));
      assert.equal(opciones.credentials, "include");
      assert.equal(opciones.headers, undefined);
      return { ok: false, status: 401, json: async () => ({ estado }) };
    };
    assert.equal((await consultarPuesto()).estado, estado);
  }
});

test("identificador público y campos inválidos no se envían como credenciales", async () => {
  globalThis.fetch = () => assert.fail("No debe enviar solicitud");
  await assert.rejects(vincularPuesto("PC-01"));
  await assert.rejects(gestionarVinculacion(1, "autorizaciones", ""));
  await assert.rejects(gestionarVinculacion(1, "eliminar", "admin"));
});

test("códigos incorrectos, vencidos y límites se muestran sin éxito ni reintentos", async () => {
  for (const mensaje of ["Autorización inválida, vencida o utilizada.", "Demasiados intentos.", "Revoca la vinculación anterior."]) {
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ mensaje }) });
    await assert.rejects(vincularPuesto(codigo), e => e.message === mensaje);
  }
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error("red"); };
  await assert.rejects(vincularPuesto(codigo), /Consulta/);
  assert.equal(llamadas, 1);
});

test("respuestas incompletas no autorizan un puesto", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ estado: "vinculada", computadora: { grado: 99 } }) });
  await assert.rejects(consultarPuesto(), /inválido/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ codigo: "PC-01" }) });
  await assert.rejects(gestionarVinculacion(1, "autorizaciones", "admin"), /verificar/);
});
