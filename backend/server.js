const path = require("node:path");
const fs = require("node:fs/promises");
const { randomBytes } = require("node:crypto");
const instalador = process.env.MODO_INSTALADOR === "true";

if (!instalador) require("dotenv").config({ path: path.join(__dirname, ".env") });

const { configurarRed } = require("./config/red");
const { configurarPuesto } = require("./config/puesto");

function resolverDataDir(valor) {
  if (!valor) return path.join(__dirname, "data");
  return path.isAbsolute(valor) ? valor : path.join(__dirname, valor);
}

async function asegurarJwtSecret(dataDir) {
  const archivo = path.join(dataDir, "jwt.secret");
  try {
    const existente = (await fs.readFile(archivo, "utf8")).trim();
    if (!/^[a-f0-9]{96,}$/.test(existente) || existente.length % 2 !== 0) throw new Error("El archivo de secreto JWT tiene un formato inválido.");
    return existente;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const secreto = randomBytes(48).toString("hex");
  try {
    const handle = await fs.open(archivo, "wx", 0o600);
    try { await handle.writeFile(`${secreto}\n`, "utf8"); } finally { await handle.close(); }
    return secreto;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return asegurarJwtSecret(dataDir);
  }
}

async function iniciarInstalador() {
  const dataDir = resolverDataDir(process.env.DATA_DIR);
  await fs.mkdir(dataDir, { recursive: true });
  process.env.DATA_DIR = dataDir;
  process.env.MEDIA_ROOT ||= path.join(dataDir, "storage", "listas");
  const jwtSecret = process.env.JWT_SECRET || await asegurarJwtSecret(dataDir);
  const { crearPoolPGlite } = require("./config/db-pglite");
  const { migrar } = require("./database/migrar");
  const pool = await crearPoolPGlite({ dataDir: path.join(dataDir, "database") });
  let servidor;
  try {
    await migrar(pool);
    const { createApp } = require("./app");
    const red = configurarRed(process.env);
    const app = createApp({ pool, jwtSecret, red, modoInstalador: true, puesto: configurarPuesto(process.env) });
    servidor = app.listen(red.port, red.host, () => console.log(`Servidor escuchando en ${red.host}:${red.port}`));
    const cerrar = () => servidor.close(async () => { await pool.close(); });
    process.once("SIGINT", cerrar);
    process.once("SIGTERM", cerrar);
    return { app, pool, server: servidor };
  } catch (error) {
    await pool.close();
    throw error;
  }
}

if (require.main === module) {
  if (instalador) {
    iniciarInstalador().catch(error => {
      console.error(`No se pudo iniciar el servidor instalable: ${error.message}`);
      process.exitCode = 1;
    });
  } else {
    const pool = require("./config/db");
    const { createApp } = require("./app");
    const red = configurarRed(process.env);
    const app = createApp({ pool, jwtSecret: process.env.JWT_SECRET, red, puesto: configurarPuesto(process.env) });
    app.listen(red.port, red.host, () => {
      console.log(`Servidor escuchando en ${red.host}:${red.port}`);
    });
  }
}

module.exports = { iniciarInstalador, asegurarJwtSecret };
