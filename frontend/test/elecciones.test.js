import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { crearPayloadVoto, posicion, validarResultados, coloresPorNombre } from "../src/utils/elecciones.js";
import { registrarVoto, loginEstudiante, obtenerResultados, obtenerListas, obtenerConfiguracion, ErrorApi } from "../src/api/estudiantes.js";

// Intercepta fetch en memoria: estas pruebas nunca acceden a red ni PostgreSQL.
const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });
const resultado = () => ({
  generadoEn: "2026-11-10T12:00:00.000Z",
  resumen: { estudiantesHabilitados: 12, votosEmitidos: 10, votosValidos: 8, votosEnBlanco: 2, votosNulos: 0, noVotaron: 2, participacion: 83.3 },
  listas: [{ nombre: "Lista A", votos: 4, porcentaje: 50, posicion: 1 }, { nombre: "Lista B", votos: 4, porcentaje: 50, posicion: 1 }],
});
function respuesta(status, body) { return { ok: status >= 200 && status < 300, status, async json() { return body; } }; }

test("conserva el ID de la lista y solo un blanco explícito produce null", () => {
  assert.deepEqual(crearPayloadVoto({ tipo: "lista", id: 42, nombre: "Lista A" }), { listaId: 42 });
  assert.deepEqual(crearPayloadVoto({ tipo: "blanco" }), { listaId: null });
  for (const seleccion of [null, {}, { tipo: "lista", nombre: "A" }, { tipo: "lista", id: null }, { tipo: "lista", id: "42" }, { tipo: "lista", id: 0 }, { tipo: "lista", id: 1.5 }, { tipo: "lista", id: 2147483648 }]) {
    assert.throws(() => crearPayloadVoto(seleccion));
  }
});
test("envía una sola petición con listaId y Bearer sin identidad del votante", async () => {
  const llamadas = [];
  globalThis.fetch = async (url, options) => { llamadas.push({ url, options }); return respuesta(201, { sesionFinalizada: true }); };
  await registrarVoto("sesion-prueba", { tipo: "lista", id: 42, nombre: "A", dni: "01234567" });
  assert.equal(llamadas.length, 1);
  assert.ok(llamadas[0].url.endsWith("/api/votos"));
  assert.equal(llamadas[0].options.headers.Authorization, "Bearer sesion-prueba");
  assert.deepEqual(JSON.parse(llamadas[0].options.body), { listaId: 42 });
});
test("rechaza selección incompleta antes de llamar a fetch", async () => {
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error("No debe ejecutarse"); };
  await assert.rejects(registrarVoto("token", { tipo: "lista", nombre: "A" }));
  assert.equal(llamadas, 0);
});
test("no reintenta el voto cuando la respuesta de red es incierta", async () => {
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error("Conexión interrumpida"); };
  await assert.rejects(registrarVoto("token", { tipo: "blanco" }), e => e instanceof ErrorApi && e.incierto);
  assert.equal(llamadas, 1);
});
test("no anuncia éxito ante rechazos, errores o respuestas inválidas", async () => {
  for (const status of [400, 401, 409, 429, 500, 503]) {
    globalThis.fetch = async () => respuesta(status, { mensaje: "Solicitud rechazada" });
    await assert.rejects(registrarVoto("token", { tipo: "blanco" }), e => e.status === status && e.incierto === (status >= 500));
  }
  for (const [status, body] of [[200, { sesionFinalizada: true }], [201, {}]]) {
    globalThis.fetch = async () => respuesta(status, body);
    await assert.rejects(registrarVoto("token", { tipo: "blanco" }), e => e.incierto);
  }
  globalThis.fetch = async () => ({ ok: true, status: 201, async json() { throw new Error("JSON incompleto"); } });
  await assert.rejects(registrarVoto("token", { tipo: "blanco" }), e => e.incierto);
});
test("el acceso por DNI usa el endpoint real y valida la sesión recibida", async () => {
  const estudiante = { id: 1, nombre: "Prueba aislada", dni: "01234567" };
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/auth/estudiante"));
    assert.deepEqual(JSON.parse(opciones.body), { dni: estudiante.dni });
    return respuesta(200, { estudiante, token: "sesion", habilitadoParaVotar: true });
  };
  assert.equal((await loginEstudiante(estudiante.dni)).estudiante.dni, estudiante.dni);
  await assert.rejects(loginEstudiante(12345678), e => e.status === 400);
  globalThis.fetch = async () => respuesta(200, { estudiante, token: "sesion" });
  await assert.rejects(loginEstudiante(estudiante.dni), e => e.status === 502);
});
test("lee resultados desde resumen y conserva posiciones empatadas", async () => {
  const datos = resultado();
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/resultados"));
    assert.equal(opciones.headers.Authorization, "Bearer admin");
    return respuesta(200, datos);
  };
  const actual = await obtenerResultados("admin");
  assert.equal(actual.resumen.votosEmitidos, 10);
  assert.deepEqual(actual.listas.map(l => l.posicion), [1, 1]);
  assert.equal(posicion(null), "Sin posición");
});
test("los resultados vacíos conservan ceros reales y no asignan un ganador", () => {
  const datos = resultado();
  for (const k of Object.keys(datos.resumen)) datos.resumen[k] = 0;
  datos.listas = [{ nombre: "Lista A", votos: 0, porcentaje: 0, posicion: null }];
  assert.equal(validarResultados(datos).listas[0].posicion, null);
});
test("rechaza resultados incompletos o inconsistentes sin inventar ceros", () => {
  assert.throws(() => validarResultados({ ...resultado(), resumen: undefined }));
  const incompleto = resultado(); delete incompleto.resumen.participacion;
  assert.throws(() => validarResultados(incompleto));
  const contradictorio = resultado(); contradictorio.resumen.votosValidos = 7;
  assert.throws(() => validarResultados(contradictorio));
});
test("los colores son estables cuando cambia el orden de resultados", () => {
  const listas = resultado().listas;
  assert.deepEqual(coloresPorNombre(listas), coloresPorNombre([...listas].reverse()));
});
test("lee listas y configuración, y rechaza una configuración desconocida", async () => {
  globalThis.fetch = async url => url.endsWith("/listas")
    ? respuesta(200, { listas: [{ id: 7, nombre: "Lista A", candidatos: [] }] })
    : respuesta(200, { votacionAbierta: false, votoBlancoHabilitado: false });
  assert.equal((await obtenerListas("sesion"))[0].id, 7);
  assert.equal((await obtenerConfiguracion()).votacionAbierta, false);
  globalThis.fetch = async () => respuesta(200, {});
  await assert.rejects(obtenerConfiguracion(), e => e.status === 502);
});
