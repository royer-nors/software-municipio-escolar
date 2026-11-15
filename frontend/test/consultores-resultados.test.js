import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loginConsultor, obtenerResultadosConsultor, listarConsultores, guardarConsultor } from "../src/api/consultores-resultados.js";
const fetchOriginal = globalThis.fetch;
afterEach(() => { globalThis.fetch = fetchOriginal; });
test("login de consulta usa su ruta propia, sin sesión administrativa ni almacenamiento", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/consultores/login"));
    assert.equal(opciones.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(opciones.body), { usuario: "consulta1", password: "ClaveTemporal!" });
    return Response.json({ token: "solo-consulta", consultor: { rol: "CONSULTOR_RESULTADOS" } });
  };
  assert.equal((await loginConsultor("consulta1", "ClaveTemporal!")).token, "solo-consulta");
});
test("espera sin conteos se propaga con el mensaje exacto y nunca usa resultados administrativos", async () => {
  const mensaje = "Los resultados estarán disponibles cuando finalice la elección";
  let solicitudes = 0;
  globalThis.fetch = async (url, opciones) => {
    solicitudes++; assert.ok(url.endsWith("/consultores/resultados"));
    assert.equal(opciones.headers.Authorization, "Bearer consulta"); assert.equal(opciones.cache, "no-store");
    return Response.json({ mensaje, codigo: "RESULTADOS_NO_PUBLICADOS" }, { status: 403 });
  };
  await assert.rejects(obtenerResultadosConsultor("consulta"), e => e.message === mensaje && e.status === 403);
  assert.equal(solicitudes, 1);
});
test("gestión de los dos consultores usa JWT administrativo y cabecera CSRF", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.equal(opciones.headers.Authorization, "Bearer admin");
    if (opciones.method === "GET") return Response.json({ consultores: [{ id: 1 }, { id: 2 }] });
    assert.ok(url.endsWith("/administracion/2")); assert.equal(opciones.method, "PUT"); assert.equal(opciones.headers["X-Consultor-CSRF"], "1");
    return Response.json({ consultor: { id: 2 } });
  };
  assert.equal((await listarConsultores("admin")).length, 2);
  assert.equal((await guardarConsultor("admin", 2, { usuario: "dos", activo: false })).consultor.id, 2);
});
test("una respuesta de login con rol administrativo se rechaza y una gestión incierta no se reintenta", async () => {
  globalThis.fetch = async () => Response.json({ token: "admin", consultor: { rol: "administrador" } });
  await assert.rejects(loginConsultor("uno", "password"), /verificar/);
  let solicitudes = 0; globalThis.fetch = async () => { solicitudes++; throw new TypeError("red"); };
  await assert.rejects(guardarConsultor("admin", 1, { usuario: "uno", activo: true }), /No se reintentó/);
  assert.equal(solicitudes, 1);
});
