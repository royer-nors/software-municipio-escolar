const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { PGlite } = require("@electric-sql/pglite");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { JWT_ISSUER, STUDENT_JWT_AUDIENCE } = require("../config/auth");

let db, server, url, token;
const secret = "secreto-aislado-computadoras-no-usar-en-produccion";
const clave = "ClaveComputadorasPrueba!";
const equipo = { identificador: "PC-01", nombre: "Aula de informática", grado: 3 };
const pool = {
  query(sql, values) { return db.query(sql, values); },
  async connect() {
    return {
      async query(sql, values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values); },
      release() {},
    };
  },
};
async function request(ruta = "", method = "GET", body, credencial = token) {
  const respuesta = await fetch(`${url}/api/computadoras${ruta}`, {
    method, headers: { "Content-Type": "application/json", ...(credencial ? { Authorization: `Bearer ${credencial}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: respuesta.status, body: await respuesta.json(), cache: respuesta.headers.get("cache-control") };
}
before(async () => {
  // PostgreSQL embebido efímero: nunca carga .env ni usa la base instalada.
  db = await PGlite.create();
  await migrar(pool);
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await db.exec("TRUNCATE vinculaciones_puesto, autorizaciones_puesto, computadoras, administradores RESTART IDENTITY;");
  await db.query("INSERT INTO administradores (usuario, password_hash) VALUES ($1, $2)", ["admin", bcrypt.hashSync(clave, 4)]);
  const login = await fetch(`${url}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "admin", password: clave }) });
  assert.equal(login.status, 200);
  token = (await login.json()).token;
});
after(async () => {
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  if (db) await db.close();
});

test("registra identificadores normalizados, fecha y varios equipos para el mismo grado", async () => {
  const nuevo = await request("", "POST", { ...equipo, identificador: " pc-01 ", nombre: " Aula de informática " });
  assert.equal(nuevo.status, 201);
  assert.equal(nuevo.cache, "no-store");
  assert.deepEqual(Object.keys(nuevo.body.computadora).sort(), ["activo", "fecha_registro", "grado", "id", "identificador", "nombre"]);
  assert.equal(nuevo.body.computadora.identificador, "PC-01");
  assert.equal(nuevo.body.computadora.nombre, equipo.nombre);
  assert.equal(nuevo.body.computadora.activo, true);
  assert.ok(Number.isFinite(Date.parse(nuevo.body.computadora.fecha_registro)));
  assert.equal((await request("", "POST", { ...equipo, identificador: "PC-02" })).status, 201);
  const lista = await request();
  assert.equal(lista.body.computadoras.length, 2);
  assert.deepEqual(lista.body.computadoras.map(c => c.grado), [3, 3]);
  assert.equal(lista.body.hayMas, false);
});

test("rechaza duplicados incluso con minúsculas y registros simultáneos", async () => {
  const respuestas = await Promise.all([request("", "POST", equipo), request("", "POST", equipo)]);
  assert.deepEqual(respuestas.map(r => r.status).sort(), [201, 409]);
  assert.equal((await request("", "POST", { ...equipo, identificador: "pc-01" })).status, 409);
  await request("/1", "PATCH", { activo: false });
  assert.equal((await request("", "POST", equipo)).status, 409);
  assert.equal((await request()).body.computadoras.length, 1);
});

test("edita nombre y grado; deshabilita y rehabilita conservando identificador y fecha", async () => {
  const original = (await request("", "POST", equipo)).body.computadora;
  const editado = await request(`/${original.id}`, "PATCH", { nombre: "Equipo biblioteca", grado: 5 });
  assert.equal(editado.status, 200);
  assert.equal(editado.body.computadora.nombre, "Equipo biblioteca");
  assert.equal(editado.body.computadora.grado, 5);
  for (const activo of [false, true]) {
    const actual = await request(`/${original.id}`, "PATCH", { activo });
    assert.equal(actual.status, 200);
    assert.equal(actual.body.computadora.activo, activo);
    assert.equal(actual.body.computadora.identificador, original.identificador);
    assert.equal(actual.body.computadora.fecha_registro, original.fecha_registro);
    assert.equal(actual.body.computadora.nombre, "Equipo biblioteca");
  }
});

test("valida campos, grados, IDs, estados e identificador inmutable", async () => {
  for (const body of [null, [], {}, { ...equipo, grado: "3" }, { ...equipo, grado: 0 }, { ...equipo, grado: 6 },
    { ...equipo, grado: 2.5 }, { ...equipo, nombre: " " }, { ...equipo, nombre: "x".repeat(101) },
    { ...equipo, nombre: "A\u0000B" }, { ...equipo, identificador: "PC 01" }, { ...equipo, identificador: "á-01" },
    { ...equipo, identificador: "X".repeat(31) }, { ...equipo, activo: true }, { ...equipo, token: "inventado" }]) {
    assert.equal((await request("", "POST", body)).status, 400, JSON.stringify(body));
  }
  await request("", "POST", equipo);
  for (const body of [{}, { identificador: "PC-02" }, { fecha_registro: "2099-01-01" }, { id: 99 }, { grado: null }, { activo: "false" }, { activo: 0 }, { autorizado: true }]) {
    assert.equal((await request("/1", "PATCH", body)).status, 400);
  }
  for (const id of ["0", "-1", "abc", "1.5", "2147483648"]) assert.equal((await request(`/${id}`, "PATCH", { nombre: "Otro" })).status, 400);
  assert.equal((await request("/999", "PATCH", { nombre: "Otro" })).status, 404);
  assert.equal((await request()).body.computadoras[0].nombre, equipo.nombre);
});

test("lista más de cien equipos por páginas sin límite total ni registros omitidos", async () => {
  await db.query("INSERT INTO computadoras (identificador, nombre, grado) SELECT 'PC-' || n, 'Equipo ' || n, 2 FROM generate_series(1, 125) AS n");
  const ids = [];
  for (const offset of [0, 50, 100]) {
    const resultado = await request(`?limit=50&offset=${offset}`);
    assert.equal(resultado.status, 200);
    ids.push(...resultado.body.computadoras.map(c => c.id));
    assert.equal(resultado.body.hayMas, offset < 100);
  }
  assert.equal(new Set(ids).size, 125);
  assert.deepEqual((await request("?offset=125")).body, { computadoras: [], hayMas: false });
  for (const query of ["limit=0", "limit=101", "offset=-1", "offset=2147483648", "limit=1&limit=2", "grado=3"]) assert.equal((await request(`?${query}`)).status, 400);
});

test("visitante, estudiante e identificador de PC no conceden administración ni sesión de equipo", async () => {
  const estudiante = jwt.sign({ rol: "estudiante" }, secret, { algorithm: "HS256", issuer: JWT_ISSUER, audience: STUDENT_JWT_AUDIENCE, subject: "1", expiresIn: 900 });
  for (const credencial of [null, estudiante, "PC-01", "token-inventado"]) {
    for (const [ruta, method, body] of [["", "GET"], ["", "POST", equipo], ["/1", "PATCH", { activo: true }]]) {
      assert.equal((await request(ruta, method, body, credencial)).status, 401);
    }
  }
  const respuesta = await fetch(`${url}/api/computadoras`, { headers: { "X-Computadora-ID": "PC-01" } });
  assert.equal(respuesta.status, 401);
  const voto = await fetch(`${url}/api/votos`, { method: "POST", headers: { "Content-Type": "application/json", "X-Computadora-ID": "PC-01" }, body: JSON.stringify({ listaId: null }) });
  assert.equal(voto.status, 401);
});

test("administrador desactivado o con versión JWT revocada no administra equipos", async () => {
  await db.query("UPDATE administradores SET activo = FALSE WHERE id = 1");
  assert.equal((await request()).status, 401);
  await db.query("UPDATE administradores SET activo = TRUE, version_token = version_token + 1 WHERE id = 1");
  assert.equal((await request("", "POST", equipo)).status, 401);
});

test("PostgreSQL conserva integridad de identificador, grado, nombre y estado", async () => {
  await request("", "POST", equipo);
  await assert.rejects(db.query("INSERT INTO computadoras (identificador, nombre, grado) VALUES ('PC-01', 'Duplicado', 2)"), { code: "23505" });
  for (const [identificador, nombre, grado] of [["pc-02", "Equipo", 1], ["PC-02", "", 1], ["PC-02", " Equipo ", 1], ["PC-02", "Equipo", 6]]) {
    await assert.rejects(db.query("INSERT INTO computadoras (identificador, nombre, grado) VALUES ($1,$2,$3)", [identificador, nombre, grado]), { code: "23514" });
  }
  await assert.rejects(db.query("UPDATE computadoras SET activo = NULL WHERE id = 1"), { code: "23502" });
});

test("administrar computadoras conserva padrón, candidatos, votos, resultados y configuración", async () => {
  await db.exec(`INSERT INTO estudiantes (codigo, nombre) VALUES ('01234567', 'Estudiante prueba');
    INSERT INTO listas (nombre) VALUES ('Lista prueba');
    INSERT INTO candidatos (nombre, lista_id) VALUES ('Candidato prueba', 1);
    INSERT INTO votos (candidato_id) VALUES (1);`);
  const tablas = ["estudiantes", "listas", "candidatos", "votos", "configuracion_votacion"];
  const antes = await Promise.all(tablas.map(tabla => db.query(`SELECT * FROM ${tabla} ORDER BY id`)));
  await request("", "POST", equipo);
  await request("/1", "PATCH", { nombre: "Equipo nuevo", grado: 1, activo: false });
  await request("/1", "PATCH", { activo: true });
  const despues = await Promise.all(tablas.map(tabla => db.query(`SELECT * FROM ${tabla} ORDER BY id`)));
  assert.deepEqual(despues.map(r => r.rows), antes.map(r => r.rows));
  assert.deepEqual(await migrar(pool), []);
});
