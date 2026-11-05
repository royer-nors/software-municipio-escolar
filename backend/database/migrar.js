const { readdir, readFile } = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");

async function migrar(pool) {
  const directorio = path.join(__dirname, "../../database/migrations");
  const archivos = (await readdir(directorio)).filter(nombre => /^\d{3}_[a-z0-9_]+\.sql$/.test(nombre)).sort();
  const client = await pool.connect();
  const aplicadas = [];
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [18472026]);
    await client.query(`CREATE TABLE IF NOT EXISTS esquema_migraciones (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    for (const archivo of archivos) {
      const sql = (await readFile(path.join(directorio, archivo), "utf8")).replace(/\r\n/g, "\n");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previo = await client.query("SELECT checksum FROM esquema_migraciones WHERE version = $1", [archivo]);
      if (previo.rows.length) {
        if (previo.rows[0].checksum !== checksum) throw new Error(`La migración ${archivo} cambió después de aplicarse.`);
        continue;
      }
      await client.query(sql);
      await client.query("INSERT INTO esquema_migraciones (version, checksum) VALUES ($1, $2)", [archivo, checksum]);
      aplicadas.push(archivo);
    }
    await client.query("COMMIT");
    return aplicadas;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { migrar };
