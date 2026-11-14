const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { PGlite } = require("@electric-sql/pglite");
const bcrypt = require("bcryptjs");
const { migrar } = require("../database/migrar");
const { createLegacyRouterHarness: createApp } = require("../test-support/legacy-router-harness");
let db, server, url, token;
const secret = "secreto-aislado-usuarios-no-usar-en-produccion";
const clave = "ClavePrueba2026!";
// Instancia exclusivamente en memoria. Serializa transacciones porque PGlite
// utiliza una conexión; no simula bloqueos entre conexiones de un servidor real.
let turno = Promise.resolve();
const pool = {
  query(sql, values) { return db.query(sql, values); },
  async connect() {
    const anterior = turno;
    let liberar;
    turno = new Promise(resolve => { liberar = resolve; });
    await anterior;
    return {
      async query(sql, values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values); },
      release() { liberar(); },
    };
  },
};
async function request(path, method = "GET", body, credential = token) {
  const response = await fetch(url + path, {
    method,
    headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function login(usuario = "admin", password = clave) {
  return request("/api/auth/login", "POST", { usuario, password }, null);
}
const alumno = { dni: "01234567", nombre: "Ana Torres", grado: "5", seccion: "A" };
before(async () => {
  db = await PGlite.create();
  await migrar(pool);
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await db.exec("TRUNCATE votos, candidatos, listas, estudiantes, administradores RESTART IDENTITY CASCADE;");
  await db.query("INSERT INTO administradores (usuario, password_hash) VALUES ($1, $2)", ["admin", bcrypt.hashSync(clave, 4)]);
  token = (await login()).body.token;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  if (db) await db.close();
});
test("crea, lista, edita y desactiva administradores sin exponer hashes", async () => {
  const nuevo = await request("/api/administradores", "POST", { usuario: "segundo", password: clave });
  assert.equal(nuevo.status, 201);
  assert.deepEqual(nuevo.body.administrador, { id: 2, usuario: "segundo", activo: true });
  assert.equal((await login("segundo")).status, 200);
  const hash = (await db.query("SELECT password_hash FROM administradores WHERE id=2")).rows[0].password_hash;
  assert.notEqual(hash, clave);
  assert.ok(await bcrypt.compare(clave, hash));
  assert.equal((await request("/api/administradores?buscar=segundo")).body.administradores.length, 1);
  assert.equal((await request("/api/administradores/2", "PATCH", { usuario: "renombrado" })).status, 200);
  const sesion = (await login("renombrado")).body.token;
  assert.equal((await request("/api/administradores/2/desactivar", "PATCH", {})).status, 200);
  assert.equal((await request("/api/auth/me", "GET", undefined, sesion)).status, 401);
  assert.equal((await login("renombrado")).status, 401);
  const listado = await request("/api/administradores");
  assert.equal(JSON.stringify(listado.body).includes("password"), false);
  assert.equal(JSON.stringify(listado.body).includes("version_token"), false);
});
test("rechaza usuarios duplicados y campos internos incluso en PATCH", async () => {
  assert.equal((await request("/api/administradores", "POST", { usuario: "admin", password: clave })).status, 409);
  const segundo = await request("/api/administradores", "POST", { usuario: "segundo", password: clave });
  assert.equal((await request(`/api/administradores/${segundo.body.administrador.id}`, "PATCH", { usuario: "admin" })).status, 409);
  for (const campo of ["activo", "password_hash", "version_token", "id"]) {
    assert.equal((await request("/api/administradores/1", "PATCH", { usuario: "otro", [campo]: 1 })).status, 400);
  }
  assert.equal((await request("/api/administradores", "POST", { usuario: "otro", password: "corta" })).status, 400);
  assert.equal((await request("/api/administradores/no-id", "PATCH", { usuario: "otro" })).status, 400);
  assert.equal((await request("/api/administradores/999", "PATCH", { usuario: "otro" })).status, 404);
});
test("cambia contraseña propia, verifica la anterior e invalida JWT", async () => {
  assert.equal((await request("/api/auth/password", "PATCH", { passwordActual: "incorrecta", passwordNueva: "NuevaClave2026!" })).status, 401);
  assert.equal((await request("/api/auth/password", "PATCH", { passwordActual: clave, passwordNueva: "NuevaClave2026!" })).status, 200);
  assert.equal((await request("/api/auth/me")).status, 401);
  assert.equal((await login()).status, 401);
  const nueva = await login("admin", "NuevaClave2026!");
  assert.equal(nueva.status, 200);
  assert.equal((await request("/api/auth/me", "GET", undefined, nueva.body.token)).status, 200);
});
test("impide desactivar el último activo, también con peticiones simultáneas", async () => {
  assert.equal((await request("/api/administradores/1/desactivar", "PATCH", {})).status, 409);
  await request("/api/administradores", "POST", { usuario: "segundo", password: clave });
  const respuestas = await Promise.all([1, 2].map(id => request(`/api/administradores/${id}/desactivar`, "PATCH", {})));
  assert.equal(respuestas.filter(r => r.status === 200).length, 1);
  assert.ok(respuestas.some(r => r.status === 409 || r.status === 401));
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM administradores WHERE activo")).rows[0].total, 1);
});
test("registra, busca, edita y desactiva estudiantes conservando el DNI", async () => {
  const nuevo = await request("/api/estudiantes", "POST", alumno);
  assert.equal(nuevo.status, 201);
  assert.equal(nuevo.body.estudiante.dni, alumno.dni);
  assert.equal(nuevo.body.estudiante.ya_voto, false);
  assert.equal((await request("/api/estudiantes?buscar=Torres&limit=1&offset=0")).body.estudiantes.length, 1);
  assert.equal((await request("/api/estudiantes/1", "PATCH", { nombre: "Ana Pérez", grado: "4", seccion: "B" })).status, 200);
  const sesion = await request("/api/auth/estudiante", "POST", { dni: alumno.dni }, null);
  assert.equal(sesion.status, 200);
  assert.equal((await request("/api/estudiantes/1/desactivar", "PATCH", {})).status, 200);
  assert.equal((await request("/api/auth/estudiante", "POST", { dni: alumno.dni }, null)).status, 401);
  assert.equal((await request("/api/listas", "GET", undefined, sesion.body.token)).status, 401);
  assert.equal((await request("/api/votos", "POST", { listaId: null }, sesion.body.token)).status, 409);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 0);
  assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id=1")).rows[0].ya_voto, false);
});
test("valida DNI, duplicados, campos internos y paginación", async () => {
  for (const dni of [12345678, "123", "1234567x", " 01234567 "]) {
    assert.equal((await request("/api/estudiantes", "POST", { ...alumno, dni })).status, 400);
  }
  await request("/api/estudiantes", "POST", alumno);
  assert.equal((await request("/api/estudiantes", "POST", alumno)).status, 409);
  const segundo = await request("/api/estudiantes", "POST", { ...alumno, dni: "12345678" });
  assert.equal((await request(`/api/estudiantes/${segundo.body.estudiante.id}`, "PATCH", { dni: alumno.dni })).status, 409);
  for (const campo of ["ya_voto", "activo", "id", "codigo"]) {
    assert.equal((await request("/api/estudiantes/1", "PATCH", { [campo]: true })).status, 400);
    assert.equal((await request("/api/estudiantes", "POST", { ...alumno, [campo]: true })).status, 400);
  }
  assert.equal((await request("/api/estudiantes?limit=999")).status, 400);
});
test("el estudiante y el visitante no pueden gestionar usuarios ni cambiar contraseñas", async () => {
  await request("/api/estudiantes", "POST", alumno);
  const sesion = await request("/api/auth/estudiante", "POST", { dni: alumno.dni }, null);
  for (const credential of [null, sesion.body.token]) {
    for (const entidad of ["administradores", "estudiantes"]) {
      for (const [ruta, method] of [[`/api/${entidad}`, "GET"], [`/api/${entidad}`, "POST"], [`/api/${entidad}/1`, "PATCH"], [`/api/${entidad}/1/desactivar`, "PATCH"]]) {
        assert.equal((await request(ruta, method, method === "GET" ? undefined : {}, credential)).status, 401);
      }
    }
    assert.equal((await request("/api/auth/password", "PATCH", {}, credential)).status, 401);
  }
});
test("el primer voto bloquea alta, edición y desactivación del padrón", async () => {
  await request("/api/estudiantes", "POST", alumno);
  await db.query(`
  UPDATE configuracion_votacion
  SET votacion_abierta = TRUE
  WHERE id = 1
  `);
  await db.query("SELECT registrar_voto($1, $2)", [1, null]);
  assert.equal((await request("/api/estudiantes", "POST", { ...alumno, dni: "12345678" })).status, 409);
  assert.equal((await request("/api/estudiantes/1", "PATCH", { nombre: "Otro" })).status, 409);
  assert.equal((await request("/api/estudiantes/1/desactivar", "PATCH", {})).status, 409);
  const row = (await db.query("SELECT nombre, activo, ya_voto FROM estudiantes WHERE id=1")).rows[0];
  assert.deepEqual(row, { nombre: alumno.nombre, activo: true, ya_voto: true });
});
