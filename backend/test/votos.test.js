const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { PGlite } = require("@electric-sql/pglite");
const jwt = require("jsonwebtoken");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");
const secret = "secreto-de-pruebas-de-votos-no-usar-en-produccion";
let db, server, url, falloConexion = false;
const pool = {
  query(sql, values) {
    if (falloConexion) throw new Error("Detalle privado de PostgreSQL");
    return db.query(sql, values);
  },
  async connect() {
    return { async query(sql, values) {
      return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values);
    }, release() {} };
  },
};
function token(rol = "estudiante", options = {}) {
  return jwt.sign({ rol, ...(rol === "administrador" ? { usuario: "admin", version_token: 0 } : {}) }, secret, {
    algorithm: "HS256", subject: "1", issuer: JWT_ISSUER,
    audience: rol === "estudiante" ? STUDENT_JWT_AUDIENCE : JWT_AUDIENCE,
    expiresIn: 900, ...options,
  });
}
before(async () => {
  db = await PGlite.create();
  await migrar(pool);
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  falloConexion = false;
  await db.exec(`
    TRUNCATE votos, candidatos, listas, estudiantes RESTART IDENTITY CASCADE;
    INSERT INTO estudiantes (codigo, nombre) VALUES ('01234567', 'Estudiante A'), ('12345678', 'Estudiante B');
    INSERT INTO listas (id, nombre) VALUES (10, 'Lista A'), (20, 'Lista B');
    INSERT INTO candidatos (id, nombre, lista_id) VALUES (101, 'Candidato A', 10), (102, 'Candidata A', 10), (201, 'Candidato B', 20);
  `);
    await db.query(`
    UPDATE configuracion_votacion
    SET votacion_abierta = TRUE,
        voto_blanco_habilitado = TRUE
    WHERE id = 1
  `);
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (db) await db.close();
});
async function votar(body, credential = token()) {
  const response = await fetch(`${url}/api/votos`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}
async function totalVotos() { return (await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total; }

test("desde DNI y papeleta registra la lista completa y usa la identidad del token", async () => {
  const login = await fetch(`${url}/api/auth/estudiante`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dni: "01234567" }) });
  const session = await login.json();
  assert.equal(login.status, 200);
  const papeleta = await fetch(`${url}/api/listas`, { headers: { Authorization: `Bearer ${session.token}` } });
  const { listas } = await papeleta.json();
  assert.equal(listas[0].id, 10);
  assert.deepEqual(listas[0].candidatos.map(c => c.id), [101, 102]);
  const result = await votar({ listaId: listas[0].id, estudianteId: 2 }, session.token);
  assert.equal(result.response.status, 201);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(result.body, { mensaje: "Voto registrado correctamente.", sesionFinalizada: true });
  assert.deepEqual((await db.query("SELECT lista_id, candidato_id FROM votos")).rows, [{ lista_id: 10, candidato_id: null }]);
  assert.deepEqual((await db.query("SELECT ya_voto FROM estudiantes ORDER BY id")).rows.map(e => e.ya_voto), [true, false]);
  const closed = await fetch(`${url}/api/listas`, { headers: { Authorization: `Bearer ${session.token}` } });
  assert.equal(closed.status, 409);
  await closed.json();
});

test("solo un null explícito registra el voto en blanco", async () => {
  const result = await votar({ listaId: null });
  assert.equal(result.response.status, 201);
  assert.equal((await db.query("SELECT lista_id FROM votos")).rows[0].lista_id, null);
});

test("no registra votos cuando la votación está cerrada", async () => {
  await db.query(`
    UPDATE configuracion_votacion
    SET votacion_abierta = FALSE
    WHERE id = 1
  `);

  const result = await votar({ listaId: 10 });

  assert.equal(result.response.status, 409);
  assert.match(result.body.mensaje, /votación está cerrada/i);

  assert.equal(
    (await db.query("SELECT ya_voto FROM estudiantes WHERE id = 1")).rows[0].ya_voto,
    false
  );

  assert.equal(await totalVotos(), 0);
});

test("rechaza el voto en blanco cuando está deshabilitado sin marcar al estudiante", async () => {
  await db.query(`
    UPDATE configuracion_votacion
    SET voto_blanco_habilitado = FALSE
    WHERE id = 1
  `);

  const result = await votar({ listaId: null });

  assert.equal(result.response.status, 409);
  assert.match(result.body.mensaje, /voto en blanco está deshabilitado/i);

  assert.equal(
    (await db.query("SELECT ya_voto FROM estudiantes WHERE id = 1")).rows[0].ya_voto,
    false
  );

  assert.equal(await totalVotos(), 0);
});

test("rechaza ausencia, alteración, expiración o rol incorrecto del token", async () => {
  for (const credential of [null, "invalido", token("administrador"), token("estudiante", { expiresIn: -1 })]) {
    assert.equal((await votar({ listaId: 10 }, credential)).response.status, 401);
  }
  assert.equal(await totalVotos(), 0);
});

test("una selección ausente o inválida no registra un voto", async () => {
  for (const body of [{}, { listaId: "10" }, { listaId: 0 }, { listaId: -1 }, { listaId: 1.5 }, { listaId: 2147483648 }]) {
    assert.equal((await votar(body)).response.status, 400);
  }
  assert.equal(await totalVotos(), 0);
});

test("una lista inexistente revierte la marca del estudiante", async () => {
  assert.equal((await votar({ listaId: 999 })).response.status, 400);
  assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id = 1")).rows[0].ya_voto, false);
  assert.equal(await totalVotos(), 0);
});

test("dos peticiones simultáneas del mismo estudiante dejan un solo voto", async () => {
  const responses = await Promise.all([votar({ listaId: 10 }), votar({ listaId: 20 })]);
  assert.deepEqual(responses.map(r => r.response.status).sort(), [201, 409]);
  assert.equal(await totalVotos(), 1);
});

test("un estudiante eliminado del padrón no puede utilizar su token anterior", async () => {
  const previous = token();
  await db.query("DELETE FROM estudiantes WHERE id = 1");
  assert.equal((await votar({ listaId: 10 }, previous)).response.status, 409);
  assert.equal(await totalVotos(), 0);
});

test("un fallo de conexión no expone detalles internos", async () => {
  falloConexion = true;
  try {
    const result = await votar({ listaId: 10 });
    assert.equal(result.response.status, 503);
    assert.equal(JSON.stringify(result.body).includes("Detalle privado"), false);
  } finally { falloConexion = false; }
  assert.equal(await totalVotos(), 0);
});

test("permite consultar públicamente la configuración de votación", async () => {
  const response = await fetch(`${url}/api/votacion/configuracion`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.votacionAbierta, true);
  assert.equal(body.votoBlancoHabilitado, true);
});

test("solo el administrador puede actualizar la configuración de votación", async () => {
   
  await db.query(`
    INSERT INTO administradores (usuario, password_hash)
    VALUES ('admin', 'hash-de-prueba')
  `);
  const sinAutorizacion = await fetch(`${url}/api/votacion/configuracion`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ votacionAbierta: false }),
  });

  assert.equal(sinAutorizacion.status, 401);

  const response = await fetch(`${url}/api/votacion/configuracion`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token("administrador")}`,
    },
    body: JSON.stringify({
      votacionAbierta: false,
      votoBlancoHabilitado: false,
    }),
  });

  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.configuracion.votacionAbierta, false);
  assert.equal(body.configuracion.votoBlancoHabilitado, false);

  const consulta = await fetch(`${url}/api/votacion/configuracion`);
  const configuracion = await consulta.json();

  assert.equal(configuracion.votacionAbierta, false);
  assert.equal(configuracion.votoBlancoHabilitado, false);
});
