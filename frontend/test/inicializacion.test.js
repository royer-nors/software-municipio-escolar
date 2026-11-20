import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { consultarEstadoInstalacion } from "../src/api/inicializacion.js";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
test("sin administrador y con administrador se distinguen únicamente por booleanos válidos", async () => {
  for (const requiereAdministrador of [true, false]) {
    globalThis.fetch = async (url, opciones) => {
      assert.ok(url.endsWith("/api/instalacion/estado"));
      assert.equal(opciones.cache, "no-store");
      assert.ok(opciones.signal);
      assert.equal(opciones.body, undefined);
      return new Response(JSON.stringify({ requiereAdministrador }));
    };
    assert.deepEqual(await consultarEstadoInstalacion(), { requiereAdministrador });
  }
});
test("error de conexión y tiempo agotado nunca se interpretan como instalación configurada", async () => {
  for (const error of [new TypeError("red"), new DOMException("timeout", "TimeoutError")]) {
    globalThis.fetch = async () => { throw error; };
    await assert.rejects(consultarEstadoInstalacion(), /No se pudo conectar/);
  }
});
test("errores HTTP, incluso con un booleano en el cuerpo, bloquean la comprobación", async () => {
  for (const status of [403, 404, 500, 503]) {
    globalThis.fetch = async () => new Response('{"requiereAdministrador":false}', { status });
    await assert.rejects(consultarEstadoInstalacion(), new RegExp(`HTTP ${status}`));
  }
});
test("respuestas vacías, HTML y JSON sin el contrato válido no habilitan el inicio", async () => {
  for (const texto of ["", "<html>error</html>", "null", "[]", "{}", '{"requiereAdministrador":"false"}', '{"requiereAdministrador":0}']) {
    globalThis.fetch = async () => new Response(texto);
    await assert.rejects(consultarEstadoInstalacion(), /respuesta inválida|no confirmó/);
  }
});
test("un reintento vuelve a consultar y puede confirmar cualquiera de los dos estados", async () => {
  for (const requiereAdministrador of [true, false]) {
    let llamadas = 0;
    globalThis.fetch = async () => ++llamadas === 1 ? new Response("", { status: 503 }) : new Response(JSON.stringify({ requiereAdministrador }));
    await assert.rejects(consultarEstadoInstalacion());
    assert.deepEqual(await consultarEstadoInstalacion(), { requiereAdministrador });
    assert.equal(llamadas, 2);
  }
});
test("cancelar la vista no se convierte en una decisión sobre la cuenta", async () => {
  const controller = new AbortController(); controller.abort();
  globalThis.fetch = async () => { throw controller.signal.reason; };
  await assert.rejects(consultarEstadoInstalacion(controller.signal), { name: "AbortError" });
});
