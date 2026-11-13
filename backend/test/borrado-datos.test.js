const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PGlite } = require("@electric-sql/pglite");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE } = require("../config/auth");

const secret = "secreto-de-pruebas-de-borrado-no-usar-en-produccion";
let db;
let server;
let baseUrl;
let consultas = 0;
const pool = {
  query(sql, values) {
    consultas++;
    return db.query(sql, values);
  },
  async connect() {
    return {
      async query(sql, values) {
        if (values !== undefined) return db.query(sql, values);
        return (await db.exec(sql)).at(-1);
      },
      release() {},
    };
  },
};

function token() {
  return jwt.sign({ usuario: "admin", rol: "administrador", version_token: 0 }, secret, {
    algorithm: "HS256",
    subject: "1",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: 3600,
  });
}

async function solicitar(ruta, { method = "GET", body, credential = token() } = {}) {
  const response = await fetch(`${baseUrl}/api/borrado-datos/${ruta}`, {
    method,
    headers: {
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
}

before(async () => {
  db = await PGlite.create();
  await migrar(pool);
  await db.query("INSERT INTO administradores (usuario, password_hash) VALUES ($1, $2)", [
    "admin", await bcrypt.hash("ClaveSoloPruebas", 4),
  ]);
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await db.exec(`
    DELETE FROM votos;
    DELETE FROM candidatos;
    DELETE FROM listas;
    DELETE FROM estudiantes;
    DELETE FROM auditoria_borrado_datos;
    UPDATE configuracion_votacion SET votacion_abierta = FALSE WHERE id = 1;
  `);
  consultas = 0;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.close();
});

test("los endpoints requieren autenticación administrativa antes de consultar el resumen", async () => {
  const beforeQuery = consultas;
  const summary = await solicitar("resumen", { credential: null });
  assert.equal(summary.response.status, 401);
  assert.equal(consultas, beforeQuery);

  const simulation = await solicitar("simulacion", {
    method: "POST", body: { operacion: "solo_votos" }, credential: null,
  });
  assert.equal(simulation.response.status, 401);
  assert.equal(consultas, beforeQuery + 1);
  const unauthenticatedAudit = (await db.query("SELECT administrador_id, modo, resultado, detalle FROM auditoria_borrado_datos")).rows[0];
  assert.equal(unauthenticatedAudit.administrador_id, null);
  assert.equal(unauthenticatedAudit.modo, "simulacion");
  assert.equal(unauthenticatedAudit.resultado, "fallido");
  assert.equal(unauthenticatedAudit.detalle.motivo, "autenticacion_requerida");
});

test("el resumen informa cantidades y una simulación audita sin cambiar los datos", async () => {
  await db.exec(`
    INSERT INTO estudiantes (codigo, nombre, ya_voto) VALUES ('01234567', 'Estudiante A', TRUE), ('12345678', 'Estudiante B', FALSE);
    INSERT INTO listas (nombre) VALUES ('Lista de prueba');
    INSERT INTO candidatos (nombre, lista_id) VALUES ('Candidata A', 1), ('Candidato B', 1);
    INSERT INTO votos (lista_id) VALUES (1);
  `);

  const summary = await solicitar("resumen");
  assert.equal(summary.response.status, 200);
  assert.equal(summary.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(summary.body, {
    estudiantes: 2,
    listas: 1,
    candidatos: 2,
    votos: 1,
    estudiantesMarcadosYaVoto: 1,
    configuracionDisponible: true,
    votacionAbierta: false,
    votosRegistrados: true,
    estudiantesYaVotaron: true,
  });

  const simulation = await solicitar("simulacion", {
    method: "POST", body: { operacion: "candidatos_listas" },
  });
  assert.equal(simulation.response.status, 200);
  assert.equal(simulation.body.eliminacionReal, false);
  assert.equal(simulation.body.bloqueada, true);
  assert.deepEqual(simulation.body.proyeccion, {
    estudiantes: 0,
    listas: 1,
    candidatos: 2,
    votos: 1,
    marcasYaVotoRestablecidas: 1,
  });
  assert.ok(simulation.body.bloqueos.includes("Hay votos registrados."));
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 1);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM listas")).rows[0].total, 1);
  assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id = 1")).rows[0].ya_voto, true);

  const audit = (await db.query("SELECT administrador_id, administrador_usuario, operacion, modo, resultado, detalle FROM auditoria_borrado_datos")).rows[0];
  assert.equal(audit.administrador_id, 1);
  assert.equal(audit.administrador_usuario, "admin");
  assert.equal(audit.operacion, "candidatos_listas");
  assert.equal(audit.modo, "simulacion");
  assert.equal(audit.resultado, "bloqueado");
  assert.equal(audit.detalle.eliminacionReal, false);
  assert.equal(JSON.stringify(audit).includes("ClaveSoloPruebas"), false);
});

test("audita operaciones desconocidas y simula el reinicio excepcional sin bloqueo pendiente", async () => {
  const invalid = await solicitar("simulacion", { method: "POST", body: { operacion: "otra" } });
  assert.equal(invalid.response.status, 400);
  const invalidAudit = (await db.query("SELECT resultado, detalle FROM auditoria_borrado_datos")).rows[0];
  assert.equal(invalidAudit.resultado, "fallido");
  assert.equal(invalidAudit.detalle.motivo, "operacion_invalida");

  const exceptional = await solicitar("simulacion", {
    method: "POST", body: { operacion: "reinicio_pruebas" },
  });
  assert.equal(exceptional.response.status, 200);
  assert.equal(exceptional.body.bloqueada, false);
  assert.equal(exceptional.body.requiereAutorizacionAdicional, true);
  assert.equal(exceptional.body.eliminacionReal, false);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM auditoria_borrado_datos")).rows[0].total, 2);
});
