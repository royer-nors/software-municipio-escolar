const { after, before, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { crearPoolPGlite } = require("../config/db-pglite");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { createInicializacionRouter, esLoopback } = require("../routes/inicializacion.routes");

const secret = "secreto-de-configuracion-inicial-exclusivo-de-pruebas";
const password = "Clave inicial de prueba 2026";
let pool, server, baseUrl, dataDir;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-admin-inicial-"));
  pool = await crearPoolPGlite({ dataDir: path.join(dataDir, "db") });
  await migrar(pool);
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await pool.query("TRUNCATE administradores RESTART IDENTITY");
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (pool) await pool.close();
  if (dataDir) await fs.rm(dataDir, { recursive: true, force: true });
});

async function pedir(ruta, method = "GET", body) {
  const response = await fetch(`${baseUrl}${ruta}`, {
    method,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  return { response, body: await response.json() };
}

test("el estado de instalación solo propone configurar si no existe administrador", async () => {
  assert.deepEqual((await pedir("/api/instalacion/estado")).body, { requiereAdministrador: true });
  await pedir("/api/instalacion/administrador-inicial", "POST", { usuario: "admin", password });
  assert.deepEqual((await pedir("/api/instalacion/estado")).body, { requiereAdministrador: false });
});

test("crea la primera cuenta con hash y rechaza la creación posterior", async () => {
  const creado = await pedir("/api/instalacion/administrador-inicial", "POST", { usuario: " admin-inicial ", password });
  assert.equal(creado.response.status, 201);
  assert.deepEqual(creado.body.administrador, { id: 1, usuario: "admin-inicial", activo: true });
  assert.equal(JSON.stringify(creado.body).includes(password), false);
  const fila = (await pool.query("SELECT password_hash FROM administradores WHERE id=1")).rows[0];
  assert.notEqual(fila.password_hash, password);
  assert.equal((await pedir("/api/instalacion/administrador-inicial", "POST", { usuario: "segundo", password })).response.status, 409);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS total FROM administradores")).rows[0].total, 1);
});

test("valida usuario y contraseña con las reglas del script existente", async () => {
  for (const body of [{ usuario: "", password }, { usuario: "a".repeat(51), password }, { usuario: "admin", password: "corta" }, { usuario: "admin", password: "á".repeat(37) }]) {
    assert.equal((await pedir("/api/instalacion/administrador-inicial", "POST", body)).response.status, 400);
  }
  assert.equal((await pool.query("SELECT COUNT(*)::int AS total FROM administradores")).rows[0].total, 0);
});

test("rechaza solicitudes concurrentes duplicadas y deja un solo administrador", async () => {
  const resultados = await Promise.all([
    pedir("/api/instalacion/administrador-inicial", "POST", { usuario: "primero", password }),
    pedir("/api/instalacion/administrador-inicial", "POST", { usuario: "segundo", password }),
  ]);
  assert.deepEqual(resultados.map(r => r.response.status).sort(), [201, 409]);
  assert.equal((await pool.query("SELECT COUNT(*)::int AS total FROM administradores")).rows[0].total, 1);
});

test("el administrador inicial puede iniciar sesión", async () => {
  await pedir("/api/instalacion/administrador-inicial", "POST", { usuario: "admin-inicial", password });
  const login = await pedir("/api/auth/login", "POST", { usuario: "admin-inicial", password });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.administrador.usuario, "admin-inicial");
  assert.equal(typeof login.body.token, "string");
});

test("el control de acceso reconoce loopback y rechaza direcciones remotas", () => {
  for (const ip of ["127.0.0.1", "127.8.9.10", "::1", "::ffff:127.0.0.1"]) assert.equal(esLoopback(ip), true);
  for (const ip of ["192.168.1.20", "10.0.0.4", "172.16.0.9", "8.8.8.8", undefined]) assert.equal(esLoopback(ip), false);
});

test("una conexión LAN recibe 403 en GET y POST aunque envíe Host y X-Forwarded-For de loopback", async t => {
  let consultas = 0;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    Object.defineProperty(req.socket, "remoteAddress", { configurable: true, value: "192.168.1.20" });
    next();
  });
  app.use("/api/instalacion", createInicializacionRouter({
    async query() { consultas += 1; throw new Error("El bloqueo debe ocurrir antes de consultar la base."); },
    async connect() { consultas += 1; throw new Error("El bloqueo debe ocurrir antes de insertar."); },
  }));
  const servidorLan = app.listen(0, "127.0.0.1");
  t.after(() => new Promise(resolve => { servidorLan.close(resolve); servidorLan.closeAllConnections(); }));
  await once(servidorLan, "listening");
  const base = `http://127.0.0.1:${servidorLan.address().port}`;
  const cabeceras = { Host: "localhost", "X-Forwarded-For": "127.0.0.1", "Content-Type": "application/json" };

  const estado = await fetch(`${base}/api/instalacion/estado`, { headers: cabeceras });
  assert.equal(estado.status, 403);
  assert.deepEqual(await estado.json(), { mensaje: "La configuración inicial solo está disponible en el servidor." });

  const crear = await fetch(`${base}/api/instalacion/administrador-inicial`, {
    method: "POST", headers: cabeceras, body: JSON.stringify({ usuario: "admin", password }),
  });
  assert.equal(crear.status, 403);
  assert.deepEqual(await crear.json(), { mensaje: "La configuración inicial solo está disponible en el servidor." });
  assert.equal(consultas, 0, "el GET no revela el estado y el POST no llega a insertar");
});
