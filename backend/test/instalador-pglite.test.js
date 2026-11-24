const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { once } = require("node:events");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { crearPoolPGlite } = require("../config/db-pglite");
const { migrar } = require("../database/migrar");
const { configurarRed } = require("../config/red");
const { configurarPuesto } = require("../config/puesto");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE } = require("../config/auth");

async function temporal(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-instalador-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test("el adaptador de producción migra, serializa conexiones y conserva datos al reabrir", async t => {
  const dataDir = path.join(await temporal(t), "db");
  let pool = await crearPoolPGlite({ dataDir });
  const aplicadas = await migrar(pool);
  assert.ok(aplicadas.length > 0);
  await pool.query("CREATE TABLE persistencia_instalador (valor TEXT NOT NULL)");
  await pool.query("INSERT INTO persistencia_instalador VALUES ($1)", ["persistido"]);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO persistencia_instalador VALUES ($1)", ["transaccion"]);
    let consultaTerminada = false;
    const consultaEsperando = pool.query("SELECT COUNT(*)::int AS total FROM persistencia_instalador").then(result => {
      consultaTerminada = true;
      return result;
    });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(consultaTerminada, false, "pool.query espera a que se libere la conexión transaccional");
    await client.query("ROLLBACK");
    client.release();
    assert.equal((await consultaEsperando).rows[0].total, 1);
  } finally { client.release(); }
  await pool.close();

  pool = await crearPoolPGlite({ dataDir });
  assert.deepEqual(await migrar(pool), []);
  assert.deepEqual((await pool.query("SELECT valor FROM persistencia_instalador")).rows, [{ valor: "persistido" }]);
  await pool.close();
});

test("MODO_INSTALADOR actualiza una base con la 001 de Git y conserva datos, autenticación y JWT_SECRET", async t => {
  const dataDir = await temporal(t);
  const version = "001_estructura_inicial.sql";
  const migrations = path.join(__dirname, "../../database/migrations");
  const copia = await temporal(t);
  const directorioSql = path.join(copia, "database/migrations");
  const directorioRunner = path.join(copia, "backend/database");
  await fs.mkdir(directorioSql, { recursive: true });
  await fs.mkdir(directorioRunner, { recursive: true });
  const runner = path.join(directorioRunner, "migrar.js");
  await fs.copyFile(require.resolve("../database/migrar"), runner);
  const migrarCopia = require(runner).migrar;
  const sqlActual = (await fs.readFile(path.join(migrations, version), "utf8")).replace(/\r\n/g, "\n");
  await fs.writeFile(path.join(directorioSql, version), sqlActual.slice(0, -2));
  const segunda = "002_listas_y_dni.sql";
  await fs.copyFile(path.join(migrations, segunda), path.join(directorioSql, segunda));

  const poolAnterior = await crearPoolPGlite({ dataDir: path.join(dataDir, "database") });
  const registros = pool => pool.query("SELECT * FROM esquema_migraciones ORDER BY version");
  const datos = pool => pool.query(`
    SELECT e.codigo, e.ya_voto, l.nombre AS lista, c.nombre AS candidato, v.id AS voto
    FROM estudiantes e CROSS JOIN votos v
    JOIN candidatos c ON c.id = v.candidato_id
    JOIN listas l ON l.id = v.lista_id
  `);
  let historial;
  let datosAnteriores;
  const password = "Clave histórica de prueba";
  try {
    assert.deepEqual(await migrarCopia(poolAnterior), [version, segunda]);
    historial = (await registros(poolAnterior)).rows;
    assert.equal(historial[0].checksum, "45f7468a10a36b6f7d00f8472f287b7da78e11f72b0ecca8de1dc783d71cb497");
    await poolAnterior.query(`
      INSERT INTO estudiantes (codigo, nombre, ya_voto) VALUES ('01234567', 'Ana', TRUE);
      INSERT INTO listas (nombre) VALUES ('Lista anterior');
      INSERT INTO candidatos (nombre, lista_id) VALUES ('Candidato anterior', 1);
      INSERT INTO votos (candidato_id, lista_id) VALUES (1, 1);
    `);
    await poolAnterior.query("INSERT INTO administradores (usuario, password_hash) VALUES ($1, $2)",
      ["admin-anterior", bcrypt.hashSync(password, 4)]);
    datosAnteriores = (await datos(poolAnterior)).rows;
    assert.equal(datosAnteriores.length, 1);

    await fs.writeFile(path.join(directorioSql, version), sqlActual + "SELECT 1;\n");
    await assert.rejects(migrarCopia(poolAnterior), /001_estructura_inicial\.sql cambió después de aplicarse/);
    assert.deepEqual((await registros(poolAnterior)).rows, historial);
  } finally {
    await poolAnterior.close();
  }
  const variables = ["MODO_INSTALADOR", "MODO_LAN", "DATA_DIR", "MEDIA_ROOT", "JWT_SECRET", "HOST", "PORT", "NODE_ENV", "FRONTEND_DIST", "CORS_ORIGINS", "CORS_ALLOW_NULL_ORIGIN", "PUESTO_COOKIE_SECURE", "PUESTO_PROXY_LOOPBACK"];
  const previas = Object.fromEntries(variables.map(key => [key, process.env[key]]));
  const pruebaPuerto = net.createServer();
  pruebaPuerto.listen(0, "127.0.0.1");
  await once(pruebaPuerto, "listening");
  const port = pruebaPuerto.address().port;
  await new Promise(resolve => pruebaPuerto.close(resolve));
  Object.assign(process.env, {
    MODO_INSTALADOR: "true", MODO_LAN: "false", DATA_DIR: dataDir, MEDIA_ROOT: "", JWT_SECRET: "",
    HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "development", FRONTEND_DIST: "",
    CORS_ORIGINS: "http://localhost:5173", CORS_ALLOW_NULL_ORIGIN: "false",
    PUESTO_COOKIE_SECURE: "true", PUESTO_PROXY_LOOPBACK: "false",
  });
  const { iniciarInstalador } = require("../server");
  let instance;
  t.after(async () => {
    if (instance) {
      await new Promise(resolve => { instance.server.close(resolve); instance.server.closeAllConnections(); });
      await instance.pool.close();
    }
    for (const key of variables) {
      if (previas[key] === undefined) delete process.env[key]; else process.env[key] = previas[key];
    }
  });

  const secretPath = path.join(dataDir, "jwt.secret");
  instance = await iniciarInstalador();
  await once(instance.server, "listening");
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/database`)).status, 200);
  assert.deepEqual((await registros(instance.pool)).rows.slice(0, historial.length), historial);
  assert.deepEqual((await datos(instance.pool)).rows, datosAnteriores);
  assert.deepEqual(await migrar(instance.pool), []);
  const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario: "admin-anterior", password }),
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).administrador.usuario, "admin-anterior");
  const secret = (await fs.readFile(secretPath, "utf8")).trim();
  assert.match(secret, /^[a-f0-9]{96}$/);
  await new Promise(resolve => { instance.server.close(resolve); instance.server.closeAllConnections(); });
  await instance.pool.close();

  instance = await iniciarInstalador();
  await once(instance.server, "listening");
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/database`)).status, 200);
  assert.equal((await fs.readFile(secretPath, "utf8")).trim(), secret);
});

test("LAN con PGlite completa vinculación, DNI y voto; solicitudes simultáneas no duplican el voto", async t => {
  const pool = await crearPoolPGlite({ dataDir: path.join(await temporal(t), "db") });
  t.after(() => pool.close());
  await migrar(pool);
  await pool.query(`UPDATE configuracion_votacion SET votacion_abierta=TRUE, voto_blanco_habilitado=TRUE, automatica=FALSE`);
  await pool.query("INSERT INTO administradores(usuario,password_hash) VALUES ($1,$2)", ["admin-fixture", "hash-fixture"]);
  await pool.query("INSERT INTO computadoras(identificador,nombre,grado) VALUES ($1,$2,$3)", ["PC-01", "Aula", 3]);
  await pool.query("INSERT INTO estudiantes(codigo,nombre,grado) VALUES ($1,$2,$3),($4,$5,$6)", ["01234567", "Ana", "3", "12345678", "Bea", "3"]);
  await pool.query("INSERT INTO listas(id,nombre) VALUES (10,'Lista A'),(20,'Lista B')");

  const red = configurarRed({ MODO_LAN: "true", HOST: "127.0.0.1", PORT: "3000" });
  const puesto = configurarPuesto({ MODO_LAN: "true", HOST: "127.0.0.1", NODE_ENV: "development" });
  assert.equal(puesto.secure, false);
  const secret = "secreto-pglite-integracion-aislado-no-produccion";
  const server = createApp({ pool, jwtSecret: secret, red, puesto }).listen(0, "127.0.0.1");
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const origin = "http://192.168.1.20:3000";
  const admin = jwt.sign({ rol: "administrador", usuario: "admin-fixture", version_token: 0 }, secret,
    { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, subject: "1", expiresIn: 3600 });
  const pedir = (url, { method = "GET", body, token, cookie } = {}) => fetch(`${base}${url}`, {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", "X-Puesto-CSRF": "1",
      ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const salud = await pedir("/api/estado");
  assert.equal(salud.status, 200);
  assert.equal((await salud.json()).estado, "activo");
  const puestoSinVincular = await pedir("/api/puesto/estado");
  assert.equal(puestoSinVincular.status, 401);
  assert.equal((await puestoSinVincular.json()).estado, "sin_vincular");
  assert.equal((await pedir("/api/puesto/identificar", { method: "POST", body: { dni: "01234567" } })).status, 401);

  const autorizacion = await pedir("/api/computadoras/1/autorizaciones", { method: "POST", body: {}, token: admin });
  assert.equal(autorizacion.status, 201);
  const vinculacion = await pedir("/api/puesto/vincular", { method: "POST", body: { codigo: (await autorizacion.json()).codigo } });
  assert.equal(vinculacion.status, 201);
  const setCookie = vinculacion.headers.get("set-cookie");
  assert.match(setCookie, /HttpOnly/);
  assert.doesNotMatch(setCookie, /; Secure/i);
  const cookie = setCookie.split(";")[0];
  const puestoVinculado = await pedir("/api/puesto/estado", { cookie });
  assert.equal(puestoVinculado.status, 200);
  assert.equal((await puestoVinculado.json()).estado, "vinculada");
  const login = await pedir("/api/puesto/identificar", { method: "POST", body: { dni: "01234567" }, cookie });
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.equal((await pedir("/api/puesto/votos", { method: "POST", body: { listaId: 10 }, token })).status, 401);
  const respuestas = await Promise.all([
    pedir("/api/puesto/votos", { method: "POST", body: { listaId: 10 }, cookie, token }),
    pedir("/api/puesto/votos", { method: "POST", body: { listaId: 20 }, cookie, token }),
  ]);
  assert.deepEqual(respuestas.map(r => r.status).sort(), [201, 409]);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 1);
  assert.equal((await pedir("/api/estado", { method: "GET" })).status, 200);
  assert.equal((await fetch(`${base}/api/estado`, { headers: { Origin: "http://8.8.8.8:3000" } })).status, 403);
});

test("Express sirve assets y fallback SPA en /puesto y rutas profundas sin capturar /api", async t => {
  const dist = path.join(await temporal(t), "dist");
  await fs.mkdir(path.join(dist, "assets"), { recursive: true });
  await fs.mkdir(path.join(dist, "api"), { recursive: true });
  await fs.writeFile(path.join(dist, "index.html"), "<!doctype html><html><body>frontend-shell</body></html>");
  await fs.writeFile(path.join(dist, "assets", "app.js"), "window.frontendLoaded = true;");
  await fs.writeFile(path.join(dist, "api", "secret.txt"), "must-not-be-served");
  const anterior = process.env.FRONTEND_DIST;
  process.env.FRONTEND_DIST = dist;
  const server = createApp({ pool: { query() { throw new Error("No debe consultar PostgreSQL"); } }, jwtSecret: "secreto-estatico-test-no-produccion" }).listen(0, "127.0.0.1");
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    if (anterior === undefined) delete process.env.FRONTEND_DIST; else process.env.FRONTEND_DIST = anterior;
  });
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const ruta of ["/", "/puesto", "/puesto/votacion/paso"]) {
    const response = await fetch(`${base}${ruta}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /frontend-shell/);
  }
  assert.match(await (await fetch(`${base}/assets/app.js`)).text(), /frontendLoaded/);
  assert.equal((await fetch(`${base}/api/estado`)).status, 200);
  assert.equal((await fetch(`${base}/api/secret.txt`)).status, 404);
});
