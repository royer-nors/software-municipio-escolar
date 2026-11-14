const { before, beforeEach, afterEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { randomUUID, createHash } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { configurarPuesto } = require("../config/puesto");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");

let db, pool, server, url, admin, schema, realPool;
const origin = "http://localhost:5173";
const secret = "secreto-vinculacion-pruebas-aisladas-no-produccion";
const hash = s => createHash("sha256").update(s).digest("hex");
async function request(ruta, { method = "GET", body, token, cookie, headers = {} } = {}) {
  const r = await fetch(url + ruta, { method,
    headers: { Origin: origin, "Content-Type": "application/json", "X-Puesto-CSRF": "1", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: r.status, body: await r.json(), cookie: r.headers.get("set-cookie"), headers: r.headers };
}
const generar = (id = 1) => request(`/api/computadoras/${id}/autorizaciones`, { method: "POST", body: {}, token: admin });
const revocar = (id = 1) => request(`/api/computadoras/${id}/revocar`, { method: "POST", body: {}, token: admin });
const canjear = (codigo, cookie) => request("/api/puesto/vincular", { method: "POST", body: { codigo }, cookie });
const estado = cookie => request("/api/puesto/estado", { cookie });
const soloCookie = r => r.cookie?.split(";")[0];

before(async () => {
  if (process.env.VINCULACION_PG_REAL === "true") {
    require("dotenv").config({ quiet: true });
    const { Pool } = require("pg");
    const conexion = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: "db_municipio_escolar_pruebas", connectionTimeoutMillis: 5000 };
    realPool = new Pool(conexion);
    assert.equal((await realPool.query("SELECT current_database() AS base")).rows[0].base, "db_municipio_escolar_pruebas");
    schema = "prueba_vinculacion_" + randomUUID().replaceAll("-", "");
    await realPool.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ ...conexion, options: `-c search_path=${schema},pg_catalog -c statement_timeout=15000 -c lock_timeout=10000` });
    assert.equal((await pool.query("SELECT current_schema() AS esquema")).rows[0].esquema, schema);
    db = { query: (sql, values) => pool.query(sql, values), exec: sql => pool.query(sql) };
  } else {
    const { PGlite } = require("@electric-sql/pglite");
    db = await PGlite.create();
    let turno = Promise.resolve();
    pool = { query: (sql, values) => db.query(sql, values), async connect() {
      const anterior = turno; let liberar;
      turno = new Promise(resolve => { liberar = resolve; }); await anterior;
      return { async query(sql, values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values); }, release() { liberar(); } };
    } };
  }
  await migrar(pool);
});
beforeEach(async () => {
  // Exclusivamente instancia en memoria o esquema aleatorio NUEVO de la base de pruebas.
  await db.exec("TRUNCATE vinculaciones_puesto, autorizaciones_puesto, computadoras, administradores RESTART IDENTITY;");
  await db.query("INSERT INTO administradores (usuario,password_hash) VALUES ('admin-fixture','no-es-una-clave-real')");
  await db.query("INSERT INTO computadoras (identificador,nombre,grado) VALUES ('PC-01','Aula A',3),('PC-02','Aula B',3)");
  admin = jwt.sign({ rol: "administrador", usuario: "admin-fixture", version_token: 0 }, secret, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, subject: "1", expiresIn: 3600 });
  server = createApp({ pool, jwtSecret: secret, puesto: configurarPuesto({ PUESTO_COOKIE_SECURE: "false" }) }).listen(0, "127.0.0.1");
  await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
after(async () => {
  if (realPool) {
    if (pool?.end) await pool.end();
    // Solo el esquema generado en esta ejecución, nunca public ni datos previos.
    if (schema && /^prueba_vinculacion_[a-f0-9]{32}$/.test(schema)) await realPool.query(`DROP SCHEMA ${schema} CASCADE`);
    await realPool.end();
  } else if (db) await db.close();
});

test("autorización de un uso y cookie HttpOnly independiente; secretos solo como verificadores", async () => {
  const autorizacion = await generar(); assert.equal(autorizacion.status, 201);
  const codigo = autorizacion.body.codigo;
  assert.match(codigo, /^[a-f0-9]{64}$/);
  const vinculo = await canjear(codigo); assert.equal(vinculo.status, 201);
  assert.match(vinculo.cookie, /HttpOnly/); assert.match(vinculo.cookie, /SameSite=Strict/); assert.match(vinculo.cookie, /Path=\/api\/puesto/);
  assert.equal(vinculo.body.credencial, undefined);
  const cookie = soloCookie(vinculo);
  const datos = (await estado(cookie)).body;
  assert.equal(datos.computadora.grado, 3);
  await db.query("UPDATE computadoras SET grado=5 WHERE id=1");
  assert.equal((await estado(cookie)).body.computadora.grado, 5);
  const fila = (await db.query("SELECT codigo_hash FROM autorizaciones_puesto")).rows[0];
  assert.equal(fila.codigo_hash, hash(codigo));
  const credencialHash = (await db.query("SELECT credencial_hash FROM vinculaciones_puesto")).rows[0].credencial_hash;
  assert.equal(credencialHash, hash(cookie.split("=")[1]));
  assert.equal(JSON.stringify((await request("/api/computadoras", { token: admin })).body).includes(credencialHash), false);
  assert.equal((await canjear(codigo)).status, 401);
});

test("códigos incorrectos, vencidos, revocados y sustituidos no se canjean", async () => {
  assert.equal((await canjear("a".repeat(64))).status, 401);
  assert.equal((await canjear("PC-01")).status, 400);
  let codigo = (await generar()).body.codigo;
  await db.query("UPDATE autorizaciones_puesto SET creada_en=clock_timestamp()-interval '20 minutes', vence_en=clock_timestamp()-interval '1 minute'");
  assert.equal((await canjear(codigo)).status, 401);
  codigo = (await generar()).body.codigo; await revocar();
  assert.equal((await canjear(codigo)).status, 401);
  codigo = (await generar()).body.codigo;
  const siguiente = (await generar()).body.codigo;
  assert.equal((await canjear(codigo)).status, 401);
  assert.equal((await canjear(siguiente)).status, 201);
});

test("canjes simultáneos de un código generan exactamente una vinculación", async () => {
  const codigo = (await generar()).body.codigo;
  const respuestas = await Promise.all([canjear(codigo), canjear(codigo)]);
  assert.deepEqual(respuestas.map(r => r.status).sort(), [201, 401]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM vinculaciones_puesto")).rows[0].n, 1);
});

test("generaciones simultáneas conservan solo una autorización pendiente", async () => {
  const respuestas = await Promise.all([generar(), generar()]);
  assert.ok(respuestas.every(r => r.status === 201));
  const pendiente = (await db.query("SELECT codigo_hash FROM autorizaciones_puesto WHERE revocada_en IS NULL")).rows;
  assert.equal(pendiente.length, 1);
  const vigente = respuestas.find(r => hash(r.body.codigo) === pendiente[0].codigo_hash).body.codigo;
  assert.equal((await canjear(vigente)).status, 201);
});

test("revocación concurrente con canje no deja una credencial válida", async () => {
  const codigo = (await generar()).body.codigo;
  const [canje, revocacion] = await Promise.all([canjear(codigo), revocar()]);
  assert.equal(revocacion.status, 200);
  assert.ok([201, 401].includes(canje.status));
  assert.equal((await estado(soloCookie(canje))).status, 401);
});

test("reemplazar una vinculación requiere revocación explícita y la antigua pierde acceso inmediato", async () => {
  const codigo = (await generar()).body.codigo;
  const cookie = soloCookie(await canjear(codigo));
  assert.equal((await generar()).status, 409);
  assert.equal((await revocar()).status, 200);
  assert.equal((await estado(cookie)).body.estado, "revocada");
  const nuevo = (await generar()).body.codigo;
  assert.equal((await canjear(nuevo)).status, 201);
  assert.equal((await estado(cookie)).status, 401);
});

test("deshabilitar revoca autorizaciones y credenciales sin resucitarlas al rehabilitar", async () => {
  let codigo = (await generar()).body.codigo;
  await db.query("UPDATE computadoras SET activo=FALSE WHERE id=1");
  assert.equal((await generar()).status, 409);
  assert.equal((await canjear(codigo)).status, 401);
  await db.query("UPDATE computadoras SET activo=TRUE WHERE id=1");
  assert.equal((await canjear(codigo)).status, 401);
  codigo = (await generar()).body.codigo;
  const cookie = soloCookie(await canjear(codigo));
  await db.query("UPDATE computadoras SET activo=FALSE WHERE id=1");
  assert.equal((await estado(cookie)).status, 401);
  await db.query("UPDATE computadoras SET activo=TRUE WHERE id=1");
  assert.equal((await estado(cookie)).body.estado, "revocada");
});

test("dos equipos del mismo grado usan credenciales independientes y un navegador no reemplaza una válida", async () => {
  const a = soloCookie(await canjear((await generar(1)).body.codigo));
  const codigoB = (await generar(2)).body.codigo;
  assert.equal((await canjear(codigoB, a)).status, 409);
  const b = soloCookie(await canjear(codigoB));
  assert.notEqual(a, b);
  await revocar(1);
  assert.equal((await estado(a)).status, 401);
  assert.equal((await estado(b)).status, 200);
});

test("vencimiento de credencial y estado administrativo sin secretos", async () => {
  assert.equal((await request("/api/computadoras/1/vinculacion", { token: admin })).body.estado, "sin_vincular");
  const codigo = (await generar()).body.codigo;
  assert.equal((await request("/api/computadoras/1/vinculacion", { token: admin })).body.estado, "pendiente");
  const cookie = soloCookie(await canjear(codigo));
  await db.query("UPDATE vinculaciones_puesto SET vinculada_en=clock_timestamp()-interval '13 hours', vence_en=clock_timestamp()-interval '1 minute'");
  assert.equal((await estado(cookie)).body.estado, "vencida");
  assert.equal((await generar()).status, 409);
  assert.equal((await request("/api/computadoras/1/vinculacion", { token: admin })).body.estado, "vencida");
});

test("visitante, estudiante y cookie de puesto no administran ni autorizan votos", async () => {
  const estudiante = jwt.sign({ rol: "estudiante" }, secret, { issuer: JWT_ISSUER, audience: STUDENT_JWT_AUDIENCE, subject: "1", expiresIn: 900 });
  const cookie = soloCookie(await canjear((await generar()).body.codigo));
  for (const token of [undefined, estudiante, "PC-01"]) {
    for (const [ruta, method] of [["vinculacion", "GET"], ["autorizaciones", "POST"], ["revocar", "POST"]]) {
      assert.equal((await request(`/api/computadoras/1/${ruta}`, { method, token, cookie, ...(method === "POST" ? { body: {} } : {}) })).status, 401);
    }
  }
  assert.equal((await request("/api/votos", { method: "POST", body: { listaId: null }, cookie })).status, 401);
  await db.query("UPDATE administradores SET activo=FALSE WHERE id=1");
  assert.equal((await generar()).status, 401);
});

test("CSRF, Origin, campos extra y cookies falsificadas se rechazan", async () => {
  const codigo = (await generar()).body.codigo;
  for (const headers of [{ Origin: "" }, { Origin: "null" }, { Origin: "http://ajeno:5173" }, { "X-Puesto-CSRF": "" }, { "Content-Type": "text/plain" }]) {
    assert.equal((await request("/api/puesto/vincular", { method: "POST", body: { codigo }, headers })).status, 403);
  }
  assert.equal((await request("/api/puesto/vincular", { method: "POST", body: { codigo, grado: 5 } })).status, 400);
  assert.equal((await estado("sme_puesto=PC-01")).status, 401);
  assert.equal((await estado(`sme_puesto=${"a".repeat(64)}; sme_puesto=${"b".repeat(64)}`)).status, 401);
  assert.equal((await request("/api/computadoras/0/autorizaciones", { method: "POST", token: admin, body: {} })).status, 400);
  assert.equal((await request("/api/computadoras/999/autorizaciones", { method: "POST", token: admin, body: {} })).status, 404);
});

test("límite de intentos de vinculación devuelve 429", async () => {
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  server = createApp({ pool, jwtSecret: secret, puesto: { secure: false }, limitesAcceso: { vinculacion: { limit: 2 } } }).listen(0, "127.0.0.1");
  await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await canjear("a".repeat(64))).status, 401);
  assert.equal((await canjear("a".repeat(64))).status, 401);
  assert.equal((await canjear("a".repeat(64))).status, 429);
});

test("Secure es obligatorio por defecto y no se confía en X-Forwarded-Proto sin configurar proxy", async () => {
  assert.equal(configurarPuesto().secure, true);
  assert.throws(() => configurarPuesto({ PUESTO_COOKIE_SECURE: "false", NODE_ENV: "production" }));
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
  const codigo = (await generar()).body.codigo;
  const r = await request("/api/puesto/vincular", { method: "POST", body: { codigo }, headers: { "X-Forwarded-Proto": "https" } });
  assert.equal(r.status, 403); assert.equal(r.cookie, null);
});

test("proxy HTTPS explícito de loopback emite Secure y no admite configuración de escucha LAN", async () => {
  assert.throws(() => configurarPuesto({ PUESTO_PROXY_LOOPBACK: "true", HOST: "0.0.0.0" }));
  assert.throws(() => configurarPuesto({ PUESTO_PROXY_LOOPBACK: "true", PUESTO_COOKIE_SECURE: "false" }));
  await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  server = createApp({ pool, jwtSecret: secret, puesto: configurarPuesto({ PUESTO_PROXY_LOOPBACK: "true", HOST: "127.0.0.1" }) }).listen(0, "127.0.0.1");
  await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
  const codigo = (await generar()).body.codigo;
  const r = await request("/api/puesto/vincular", { method: "POST", body: { codigo }, headers: { "X-Forwarded-Proto": "https" } });
  assert.equal(r.status, 201); assert.match(r.cookie, /; Secure/);
  assert.equal(r.headers.get("access-control-allow-credentials"), "true");
  assert.equal((await request("/api/computadoras", { token: admin })).headers.get("access-control-allow-credentials"), null);
});

test("integridad SQL impide asociar una autorización al equipo equivocado", async () => {
  await generar(1);
  const id = (await db.query("SELECT id FROM autorizaciones_puesto")).rows[0].id;
  await assert.rejects(db.query(`INSERT INTO vinculaciones_puesto (computadora_id,autorizacion_id,credencial_hash,vence_en)
    VALUES (2,$1,$2,clock_timestamp()+interval '1 hour')`, [id, "f".repeat(64)]), { code: "23503" });
});
