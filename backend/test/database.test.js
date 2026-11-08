const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { PGlite } = require("@electric-sql/pglite");
const { migrar } = require("../database/migrar");
const { createAdministradorRepository } = require("../repositories/administrador.repository");
const { createEstudianteRepository } = require("../repositories/estudiante.repository");
const { createResultadosRepository } = require("../repositories/resultados.repository");
const { createListasRepository } = require("../repositories/listas.repository");
const { createResultadosService } = require("../services/resultados.service");
const { createListasService } = require("../services/listas.service");
const { createAuthService } = require("../services/auth.service");

let db;
const pool = {
  query(sql, values) { return db.query(sql, values); },
  async connect() {
    return {
      async query(sql, values) {
        if (values !== undefined) return db.query(sql, values);
        const results = await db.exec(sql);
        return results.at(-1);
      },
      release() {},
    };
  },
};
before(async () => { db = await PGlite.create(); });
beforeEach(async () => {
  // Solo destruye el esquema de esta instancia efímera, nunca usa DB_*.
  await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
});
after(async () => { if (db) await db.close(); });

async function cargarEsquemaAnterior() {
  await db.exec(await readFile(path.join(__dirname, "fixtures/esquema-anterior.sql"), "utf8"));
}

async function prepararVotacion() {
  await migrar(pool);
  await db.exec(`
    INSERT INTO estudiantes (codigo, nombre) VALUES ('01234567', 'Estudiante A'), ('12345678', 'Estudiante B');
    INSERT INTO listas (nombre) VALUES ('Juntos por un mejor futuro'), ('Unidos por el cambio');
    INSERT INTO candidatos (nombre, lista_id) VALUES ('Candidato A', 1), ('Candidata B', 2);
  `);
}

test("instala una base vacía y repetir las migraciones no duplica el esquema", async () => {
  assert.equal((await migrar(pool)).length, 2);
  assert.deepEqual(await migrar(pool), []);
  const tables = await db.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  assert.deepEqual(tables.rows.map(row => row.tablename), ["administradores", "candidatos", "esquema_migraciones", "estudiantes", "listas", "votos"]);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM estudiantes")).rows[0].total, 0);
});

test("migra los datos anteriores sin perder votos, DNI ni acceso administrativo", async () => {
  await cargarEsquemaAnterior();
  await db.exec(`
    INSERT INTO estudiantes (codigo, nombre, ya_voto) VALUES ('01234567', 'Estudiante A', TRUE), ('12345678', 'Estudiante B', TRUE);
    INSERT INTO candidatos (nombre, lista) VALUES ('Candidato A', 'Lista histórica');
    INSERT INTO votos (candidato_id) VALUES (1), (NULL);
  `);
  await db.query("INSERT INTO administradores (usuario, password_hash) VALUES ($1, $2)", ["admin", bcrypt.hashSync("Clave de prueba", 4)]);
  await migrar(pool);
  const estudiante = await createEstudianteRepository(pool).findByDni("01234567");
  assert.equal(estudiante.nombre, "Estudiante A");
  assert.equal(estudiante.ya_voto, true);
  const rows = (await db.query("SELECT candidato_id, lista_id FROM votos ORDER BY id")).rows;
  assert.deepEqual(rows, [{ candidato_id: 1, lista_id: 1 }, { candidato_id: null, lista_id: null }]);
  const auth = createAuthService({ administradorRepository: createAdministradorRepository(pool), jwtSecret: "secreto-para-pruebas-de-base-no-usar-en-produccion" });
  assert.equal((await auth.login("admin", "Clave de prueba")).administrador.usuario, "admin");
  await migrar(pool);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 2);
});

test("PostgreSQL rechaza DNI inválidos y duplicados conservando ceros iniciales", async () => {
  await migrar(pool);
  await db.query("INSERT INTO estudiantes (codigo, nombre) VALUES ($1, $2)", ["01234567", "Estudiante"]);
  await assert.rejects(db.query("INSERT INTO estudiantes (codigo, nombre) VALUES ($1, $2)", ["01234567", "Duplicado"]), { code: "23505" });
  await assert.rejects(db.query("INSERT INTO estudiantes (codigo, nombre) VALUES ($1, $2)", ["123", "Inválido"]), { code: "23514" });
  assert.equal((await db.query("SELECT codigo FROM estudiantes")).rows[0].codigo, "01234567");
});

test("registra lista completa y blanco; las consultas reales los cuentan correctamente", async () => {
  await prepararVotacion();
  await db.query("SELECT registrar_voto($1, $2)", [1, 1]);
  await db.query("SELECT registrar_voto($1, $2)", [2, null]);
  const result = await createResultadosService(createResultadosRepository(pool)).obtenerResultados();
  assert.deepEqual(result.resumen, {
    estudiantesHabilitados: 2, votosEmitidos: 2, votosValidos: 1,
    votosEnBlanco: 1, votosNulos: 0, noVotaron: 0, participacion: 100,
  });
  assert.deepEqual(result.listas.map(lista => [lista.votos, lista.porcentaje]), [[1, 100], [0, 0]]);
  const columns = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'votos' AND table_schema = 'public'")).rows.map(row => row.column_name);
  assert.equal(columns.includes("estudiante_id"), false);
  assert.equal(columns.includes("dni"), false);
});

test("un reintento del mismo estudiante no registra un segundo voto", async () => {
  await prepararVotacion();
  await db.query("SELECT registrar_voto($1, $2)", [1, 1]);
  await assert.rejects(db.query("SELECT registrar_voto($1, $2)", [1, 2]), { code: "P0001" });
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 1);
});

test("si la lista no existe, se revierte también la marca ya_voto", async () => {
  await prepararVotacion();
  await assert.rejects(db.query("SELECT registrar_voto($1, $2)", [1, 999]), { code: "23503" });
  assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id = 1")).rows[0].ya_voto, false);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 0);
});

test("datos anteriores inválidos abortan toda la migración y se conservan para su revisión", async () => {
  await cargarEsquemaAnterior();
  await db.exec("INSERT INTO estudiantes (codigo, nombre) VALUES ('codigo-invalido', 'Revisar padrón')");
  await assert.rejects(migrar(pool), /DNI inválidos/);
  assert.equal((await db.query("SELECT codigo FROM estudiantes")).rows[0].codigo, "codigo-invalido");
  const result = await db.query("SELECT to_regclass('public.listas') AS listas, to_regclass('public.esquema_migraciones') AS versiones");
  assert.deepEqual(result.rows[0], { listas: null, versiones: null });
});

test("impide volver a aplicar una migración cuyo checksum no coincide", async () => {
  await migrar(pool);
  await db.query("UPDATE esquema_migraciones SET checksum = $1 WHERE version = $2", ["alterado", "001_estructura_inicial.sql"]);
  await assert.rejects(migrar(pool), /cambió después de aplicarse/);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM esquema_migraciones")).rows[0].total, 2);
});

test("la papeleta real usa los nombres de listas y candidatos del nuevo modelo", async () => {
  await prepararVotacion();
  const service = createListasService(createListasRepository(pool));
  const result = await service.obtenerListas(1);
  assert.equal(result.estado, "habilitado");
  assert.deepEqual(result.listas, [
    { id: 1, nombre: "Juntos por un mejor futuro", candidatos: [{ id: 1, nombre: "Candidato A" }] },
    { id: 2, nombre: "Unidos por el cambio", candidatos: [{ id: 2, nombre: "Candidata B" }] },
  ]);
  await db.query("SELECT registrar_voto($1, $2)", [1, 1]);
  assert.equal((await service.obtenerListas(1)).estado, "ya_voto");
});

test("un candidato no puede atribuir su voto a otra lista", async () => {
  await prepararVotacion();
  await assert.rejects(db.query("INSERT INTO votos (candidato_id, lista_id) VALUES ($1, $2)", [1, 2]), { code: "23514" });
  await db.query("INSERT INTO votos (candidato_id) VALUES ($1)", [1]);
  assert.equal((await db.query("SELECT lista_id FROM votos")).rows[0].lista_id, 1);
});
