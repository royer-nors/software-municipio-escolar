const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const pool = require("../config/db");
const { migrar } = require("../database/migrar");

async function main() {
  try {
    const aplicadas = await migrar(pool);
    console.log(aplicadas.length ? `Migraciones aplicadas: ${aplicadas.join(", ")}` : "La base de datos ya está actualizada.");
  } catch (error) {
    console.error(`No se completó la migración: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
