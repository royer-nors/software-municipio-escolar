import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { apiPuesto } from "../src/api/estudiantes.js";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

test("identifica exclusivamente en la ruta de puesto con cookie y CSRF, sin grado ni computadora enviados", async () => {
  globalThis.fetch = async (url, o) => {
    assert.ok(url.endsWith("/puesto/identificar")); assert.equal(o.credentials, "include");
    assert.equal(o.headers["X-Puesto-CSRF"], "1"); assert.deepEqual(JSON.parse(o.body), { dni: "01234567" });
    assert.equal(o.headers.Authorization, undefined);
    return { ok: true, json: async () => ({ token: "sesion-estudiante", estudiante: { nombre: "Ana", dni: "01234567" }, habilitadoParaVotar: true }) };
  };
  assert.equal((await apiPuesto.loginEstudiante("01234567")).token, "sesion-estudiante");
});
test("papeleta y configuración usan rutas protegidas y cookies", async () => {
  globalThis.fetch = async (url, o) => {
    assert.equal(o.credentials, "include");
    if (url.endsWith("/puesto/listas")) {
      assert.equal(o.headers.Authorization, "Bearer estudiante");
      return { ok: true, json: async () => ({ listas: [{ id: 1, nombre: "Lista A", candidatos: [{ id: 1, nombre: "Candidata" }] }] }) };
    }
    assert.ok(url.endsWith("/puesto/configuracion"));
    return { ok: true, json: async () => ({ votacionAbierta: true, votoBlancoHabilitado: false }) };
  };
  assert.equal((await apiPuesto.obtenerListas("estudiante")).length, 1);
  assert.equal((await apiPuesto.obtenerConfiguracion()).votoBlancoHabilitado, false);
});
test("lista y blanco envían únicamente listaId, JWT estudiantil, cookie y CSRF", async () => {
  for (const [seleccion, listaId] of [[{ tipo: "lista", id: 2 }, 2], [{ tipo: "blanco" }, null]]) {
    globalThis.fetch = async (url, o) => {
      assert.ok(url.endsWith("/puesto/votos")); assert.equal(o.method, "POST");
      assert.equal(o.credentials, "include"); assert.equal(o.headers.Authorization, "Bearer estudiante");
      assert.equal(o.headers["X-Puesto-CSRF"], "1"); assert.deepEqual(JSON.parse(o.body), { listaId });
      return { ok: true, status: 201, json: async () => ({ sesionFinalizada: true, mensaje: "Voto registrado correctamente." }) };
    };
    assert.equal((await apiPuesto.registrarVoto("estudiante", seleccion)).sesionFinalizada, true);
  }
});
test("revocación, grado incorrecto y cierre se propagan sin anunciar un voto", async () => {
  for (const [status, codigo] of [[401, "PUESTO_INVALIDO"], [403, undefined], [409, undefined]]) {
    globalThis.fetch = async () => ({ ok: false, status, json: async () => ({ mensaje: "No autorizado para votar", codigo }) });
    await assert.rejects(apiPuesto.registrarVoto("estudiante", { tipo: "blanco" }), e => e.status === status && e.codigo === codigo && !e.incierto);
  }
});
test("un voto incierto no se reintenta y una respuesta incompleta no confirma éxito", async () => {
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error("red"); };
  await assert.rejects(apiPuesto.registrarVoto("estudiante", { tipo: "lista", id: 1 }), e => e.incierto);
  assert.equal(llamadas, 1);
  globalThis.fetch = async () => ({ ok: true, status: 201, json: async () => ({ mensaje: "ok" }) });
  await assert.rejects(apiPuesto.registrarVoto("estudiante", { tipo: "blanco" }), e => e.incierto);
});
