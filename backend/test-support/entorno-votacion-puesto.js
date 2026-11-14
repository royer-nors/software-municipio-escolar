const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const { migrar } = require("../database/migrar");
async function crearEntorno({ real = process.env.ETAPA5_PG_REAL === "true" } = {}) {
  let db, pool, control, esquema;
  try {
    if (real) {
      require("dotenv").config({ quiet: true });
      const { Pool } = require("pg");
      const conexion = { host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 5432),
        database: "db_municipio_escolar_pruebas", user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000 };
      control = new Pool(conexion);
      assert.equal((await control.query("SELECT current_database() AS nombre")).rows[0].nombre, "db_municipio_escolar_pruebas");
      esquema = "prueba_votacion_puesto_" + randomUUID().replaceAll("-", "");
      await control.query(`CREATE SCHEMA ${esquema}`);
      pool = new Pool({ ...conexion, options: `-c search_path=${esquema},pg_catalog -c statement_timeout=15000 -c lock_timeout=10000` });
      assert.equal((await pool.query("SELECT current_schema() AS nombre")).rows[0].nombre, esquema);
      db = { query: (sql, values) => pool.query(sql, values), exec: sql => pool.query(sql) };
    } else {
      const { PGlite } = require("@electric-sql/pglite"); db = await PGlite.create();
      let cola = Promise.resolve();
      const reservar = async () => { const anterior = cola; let liberar; cola = new Promise(r => { liberar = r; }); await anterior; return liberar; };
      pool = {
        async query(sql, values) { const liberar = await reservar(); try { return await db.query(sql, values); } finally { liberar(); } },
        async connect() { const liberar = await reservar(); return { async query(sql, values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values); }, release: liberar }; },
      };
    }
    await migrar(pool);
    return { db, pool, cerrar };
  } catch (e) { await cerrar(); throw e; }
  async function cerrar() {
    if (control) {
      if (pool) await pool.end();
      if (esquema && /^prueba_votacion_puesto_[a-f0-9]{32}$/.test(esquema)) await control.query(`DROP SCHEMA ${esquema} CASCADE`);
      await control.end();
    } else if (db) await db.close();
  }
}
module.exports = { crearEntorno };
