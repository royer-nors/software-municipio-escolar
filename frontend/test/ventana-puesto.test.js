import { test } from "node:test";
import assert from "node:assert/strict";
import { apiPuesto, loginEstudiante } from "../src/api/estudiantes.js";

test("Electron protege antes de identificar y registra el comprobante antes de mostrar la papeleta", async t => {
  const anterior = globalThis.window, fetchAnterior = globalThis.fetch, eventos = [];
  t.after(() => { globalThis.window = anterior; globalThis.fetch = fetchAnterior; });
  globalThis.window = { puestoVentana: {
    iniciarAutenticacion: async () => { eventos.push("bloquear"); return { ok: true }; },
    registrarSesion: async token => { assert.equal(token, "solo-fixture"); eventos.push("registrar"); return { ok: true }; },
  } };
  globalThis.fetch = async (url, opciones) => {
    eventos.push("peticion"); assert.ok(url.endsWith("/puesto/identificar")); assert.equal(opciones.credentials, "include");
    return Response.json({ token: "solo-fixture", estudiante: { nombre: "Prueba", dni: "01234567" }, habilitadoParaVotar: true });
  };
  await apiPuesto.loginEstudiante("01234567");
  assert.deepEqual(eventos, ["bloquear", "peticion", "registrar"]);
  globalThis.window.puestoVentana.iniciarAutenticacion = async () => ({ ok: false });
  eventos.length = 0;
  await assert.rejects(apiPuesto.loginEstudiante("01234567"), /proteger/); assert.deepEqual(eventos, []);
});
test("web normal sigue funcionando sin puente y una respuesta inválida no registra una sesión", async t => {
  const anterior = globalThis.window, fetchAnterior = globalThis.fetch;
  t.after(() => { globalThis.window = anterior; globalThis.fetch = fetchAnterior; });
  globalThis.window = undefined;
  globalThis.fetch = async () => Response.json({ token: "fixture", estudiante: { nombre: "Prueba", dni: "01234567" }, habilitadoParaVotar: true });
  assert.equal((await apiPuesto.loginEstudiante("01234567")).token, "fixture");
  assert.equal((await loginEstudiante("01234567")).token, "fixture");
  let registros = 0;
  globalThis.window = { puestoVentana: { iniciarAutenticacion: async () => ({ ok: true }), registrarSesion: async () => { registros++; return { ok: true }; } } };
  globalThis.fetch = async () => Response.json({ token: "fixture" });
  await assert.rejects(apiPuesto.loginEstudiante("01234567"), /identificación válida/);
  assert.equal(registros, 0);
});
