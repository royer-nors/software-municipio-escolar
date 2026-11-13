const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { configurarRed } = require("../config/red");
const { createApp } = require("../app");

test("la configuración conserva localhost y permite host y puerto LAN sin fijar cantidad de equipos", () => {
  assert.deepEqual(configurarRed(), {
    host: "127.0.0.1", port: 3000,
    origenes: ["http://localhost:5173", "http://127.0.0.1:5173"], permitirOrigenNull: false,
  });
  const red = configurarRed({ HOST: "0.0.0.0", PORT: "3001", CORS_ORIGINS: "http://servidor-escolar:5173, https://elecciones.escuela", CORS_ALLOW_NULL_ORIGIN: "true" });
  assert.equal(red.host, "0.0.0.0");
  assert.equal(red.port, 3001);
  assert.equal(red.origenes.length, 2);
  assert.equal(red.permitirOrigenNull, true);
  for (const PORT of ["", "0", "65536", "3001abc", "1.5"]) assert.throws(() => configurarRed({ PORT }), /PORT/);
  for (const CORS_ORIGINS of ["*", "null", "http://*.escuela", "http://escuela/ruta", "http://escuela/", "file://app"]) {
    assert.throws(() => configurarRed({ CORS_ORIGINS }), /CORS_ORIGINS/);
  }
  assert.throws(() => configurarRed({ HOST: "" }), /HOST/);
  assert.throws(() => configurarRed({ CORS_ALLOW_NULL_ORIGIN: "1" }), /CORS_ALLOW_NULL_ORIGIN/);
});

test("LAN: CORS exacto, preflight JWT, rechazo de orígenes y acceso local sin consultar PostgreSQL", async t => {
  const pool = { query() { throw new Error("Esta prueba no debe consultar PostgreSQL"); } };
  const red = configurarRed({ HOST: "0.0.0.0", CORS_ORIGINS: "http://servidor-escolar:5173,http://localhost:5173" });
  const server = createApp({ pool, jwtSecret: "secreto-aislado-configuracion-lan-no-produccion", red }).listen(0, red.host);
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/estado`)).status, 200);
  for (const origin of red.origenes) {
    const respuesta = await fetch(`${base}/api/estado`, { headers: { Origin: origin } });
    assert.equal(respuesta.status, 200);
    assert.equal(respuesta.headers.get("access-control-allow-origin"), origin);
  }
  const preflight = await fetch(`${base}/api/votos`, { method: "OPTIONS", headers: {
    Origin: red.origenes[0], "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type",
  } });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("access-control-allow-headers"), /Authorization/);
  assert.match(preflight.headers.get("access-control-allow-methods"), /POST/);
  for (const origin of ["http://otro-equipo:5173", "http://localhost:5174", "http://servidor-escolar:5173.ejemplo", "null"]) {
    const respuesta = await fetch(`${base}/api/estado`, { headers: { Origin: origin } });
    assert.equal(respuesta.status, 403);
    assert.equal(respuesta.headers.get("access-control-allow-origin"), null);
  }
  assert.equal((await fetch(`${base}/api/resultados`, { headers: { Origin: red.origenes[0] } })).status, 401);
});

test("Electron con origen null requiere habilitación explícita y conserva JWT", async t => {
  const server = createApp({
    pool: { query() { throw new Error("No debe consultar PostgreSQL"); } },
    jwtSecret: "secreto-aislado-electron-lan-no-produccion",
    red: configurarRed({ CORS_ORIGINS: "", CORS_ALLOW_NULL_ORIGIN: "true" }),
  }).listen(0, "127.0.0.1");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const respuesta = await fetch(`${base}/api/estado`, { headers: { Origin: "null" } });
  assert.equal(respuesta.status, 200);
  assert.equal(respuesta.headers.get("access-control-allow-origin"), "null");
  assert.equal((await fetch(`${base}/api/resultados`, { headers: { Origin: "null" } })).status, 401);
});
