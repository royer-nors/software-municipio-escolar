import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { obtenerResumenAdministrativo } from "../src/api/resumen-administrativo.js";

const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });
const conteo = {
  generadoEn: "2026-11-15T12:00:00.000Z",
  resumen: { estudiantesHabilitados: 12, votosEmitidos: 10, votosValidos: 8, votosEnBlanco: 2, votosNulos: 0, noVotaron: 2, participacion: 83.3 },
  listas: [{ nombre: "Lista A", votos: 8, porcentaje: 100, posicion: 1 }],
};
const configuracion = { votacionAbierta: false, votoBlancoHabilitado: true, estado: "Cerrada", automatica: false };
const respuesta = (status, datos) => ({ ok: status === 200, status, async json() { return datos; } });

test("el panel consulta datos reales por GET y conserva los conteos y estados recibidos", async () => {
  const llamadas = [];
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url, opciones });
    if (url.includes("/resultados")) return respuesta(200, conteo);
    if (url.includes("/computadoras")) return respuesta(200, { computadoras: [], hayMas: false });
    return respuesta(200, configuracion);
  };
  const datos = await obtenerResumenAdministrativo("sesion-local");
  assert.equal(datos.resultados.resumen.estudiantesHabilitados, 12);
  assert.equal(datos.resultados.resumen.votosEmitidos, 10);
  assert.equal(datos.resultados.listas.length, 1);
  assert.equal(datos.configuracion.votacionAbierta, false);
  assert.deepEqual(datos.equipos.computadoras, []);
  assert.deepEqual(datos.errores, []);
  assert.equal(llamadas.length, 3);
  assert.ok(llamadas.every(({ opciones }) => !opciones.method || opciones.method === "GET"));
  assert.ok(llamadas.filter(({ url }) => !url.includes("/configuracion")).every(({ opciones }) => opciones.headers.Authorization === "Bearer sesion-local"));
});

test("un fallo parcial conserva las otras fuentes y no inventa ceros ni un estado cerrado", async () => {
  globalThis.fetch = async url => {
    if (url.includes("/resultados")) return respuesta(503, { mensaje: "Sin conexión" });
    if (url.includes("/computadoras")) return respuesta(200, { computadoras: [], hayMas: false });
    return respuesta(503, { mensaje: "Sin conexión" });
  };
  const datos = await obtenerResumenAdministrativo("sesion-local");
  assert.equal(datos.resultados, null);
  assert.equal(datos.configuracion, null);
  assert.deepEqual(datos.errores, ["resultados", "configuracion"]);
  assert.deepEqual(datos.equipos.computadoras, []);
});

test("las respuestas incompletas se marcan como no disponibles", async () => {
  globalThis.fetch = async () => respuesta(200, {});
  const datos = await obtenerResumenAdministrativo("sesion-local");
  assert.equal(datos.resultados, null);
  assert.equal(datos.configuracion, null);
  assert.equal(datos.equipos, null);
  assert.equal(datos.errores.length, 3);
});

test("cancelar al salir del panel impide publicar un resumen tardío", async () => {
  const controller = new AbortController();
  globalThis.fetch = async url => {
    await Promise.resolve();
    controller.abort();
    if (url.includes("/resultados")) return respuesta(200, conteo);
    if (url.includes("/computadoras")) return respuesta(200, { computadoras: [], hayMas: false });
    return respuesta(200, configuracion);
  };
  await assert.rejects(obtenerResumenAdministrativo("sesion-local", controller.signal), error => error.name === "AbortError");
});
