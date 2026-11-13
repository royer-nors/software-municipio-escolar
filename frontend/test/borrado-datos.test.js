import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import {
  ejecutarBorradoDatos,
  obtenerResumenBorrado,
  reiniciarDatosPrueba,
  simularBorradoDatos,
} from "../src/api/borrado-datos.js";

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });

test("obtiene el resumen con autenticación y valida sus cuatro conteos", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/api/borrado-datos/resumen"));
    assert.equal(opciones.headers.Authorization, "Bearer admin");
    assert.equal(opciones.cache, "no-store");
    return { ok: true, json: async () => ({ estudiantes: 3, listas: 1, candidatos: 2, votos: 0 }) };
  };
  assert.deepEqual(await obtenerResumenBorrado("admin"), { estudiantes: 3, listas: 1, candidatos: 2, votos: 0 });
  await assert.rejects(obtenerResumenBorrado(""), /sesión/);
});

test("envía simulación, eliminación normal y reinicio a sus rutas separadas", async () => {
  const solicitudes = [];
  globalThis.fetch = async (url, opciones) => {
    solicitudes.push({ url, opciones });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  await simularBorradoDatos("admin", "solo_votos");
  await ejecutarBorradoDatos("admin", { operacion: "solo_votos", simulacionId: 7, confirmacion: "BORRAR DATOS DE PRUEBA", password: "clave" });
  await reiniciarDatosPrueba("admin", { simulacionId: 8, confirmacion: "frase", password: "clave", autorizacionAdicional: "código" });

  assert.ok(solicitudes[0].url.endsWith("/api/borrado-datos/simulacion"));
  assert.deepEqual(JSON.parse(solicitudes[0].opciones.body), { operacion: "solo_votos" });
  assert.ok(solicitudes[1].url.endsWith("/api/borrado-datos/ejecutar"));
  assert.ok(solicitudes[2].url.endsWith("/api/borrado-datos/reinicio-excepcional"));
  for (const solicitud of solicitudes) assert.equal(solicitud.opciones.headers.Authorization, "Bearer admin");
});

test("propaga el estado y el mensaje de error que entrega el backend", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 403, json: async () => ({ mensaje: "Deshabilitado en producción." }) });
  await assert.rejects(ejecutarBorradoDatos("admin", {}), error => {
    assert.equal(error.status, 403);
    assert.equal(error.message, "Deshabilitado en producción.");
    return true;
  });
});
