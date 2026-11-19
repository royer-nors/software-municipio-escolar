const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const instaladorRoot = path.resolve(__dirname, "..");
const releaseRoot = path.join(instaladorRoot, "release");
const stagingRoot = path.join(instaladorRoot, "staging");
const builderCli = path.join(instaladorRoot, "node_modules", "electron-builder", "cli.js");

async function borrarSeguro(destino, limite) {
  const resuelto = path.resolve(destino);
  const base = path.resolve(limite);
  if (!resuelto.startsWith(`${base}${path.sep}`)) throw new Error(`Se rechazó limpiar una ruta fuera de la salida generada: ${resuelto}`);
  await fs.rm(resuelto, { recursive: true, force: true });
}

async function limpiarRaizLegacyRelease() {
  let entradas = [];
  try { entradas = await fs.readdir(releaseRoot); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const nombre of entradas) {
    if (nombre === "servidor" || nombre === "puesto") continue;
    await borrarSeguro(path.join(releaseRoot, nombre), releaseRoot);
  }
}

function ejecutarNode(archivo, argumentos = []) {
  const resultado = spawnSync(process.execPath, [archivo, ...argumentos], { cwd: instaladorRoot, stdio: "inherit" });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error(`${path.basename(archivo)} terminó con código ${resultado.status}.`);
}

function construir(producto, soloDirectorio) {
  const config = producto === "servidor" ? "electron-builder.cjs" : "electron-builder.puesto.cjs";
  const args = ["--win", "nsis", "--config", config];
  if (soloDirectorio) args.push("--dir");
  const resultado = spawnSync(process.execPath, [builderCli, ...args], { cwd: instaladorRoot, stdio: "inherit" });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error(`electron-builder (${producto}) terminó con código ${resultado.status}.`);
  ejecutarNode(path.join(__dirname, "verificar-pack.cjs"), [producto]);
}

async function construirProducto(producto, soloDirectorio) {
  await limpiarRaizLegacyRelease();
  await borrarSeguro(path.join(releaseRoot, producto), releaseRoot);
  if (producto === "servidor") {
    await borrarSeguro(stagingRoot, instaladorRoot);
    ejecutarNode(path.join(__dirname, "preparar.cjs"));
  }
  construir(producto, soloDirectorio);
}

async function main() {
  const opcion = process.argv[2];
  if (!["servidor", "puesto", "todo", "pack-servidor", "pack-puesto"].includes(opcion)) {
    throw new Error("Uso: node scripts/dist.cjs servidor|puesto|todo|pack-servidor|pack-puesto");
  }
  if (opcion === "todo") {
    await borrarSeguro(releaseRoot, instaladorRoot);
    await borrarSeguro(stagingRoot, instaladorRoot);
    ejecutarNode(path.join(__dirname, "preparar.cjs"));
    construir("servidor", false);
    construir("puesto", false);
    return;
  }
  const producto = opcion.endsWith("servidor") ? "servidor" : "puesto";
  await construirProducto(producto, opcion.startsWith("pack-"));
}

main().catch(error => {
  console.error(`No se pudo crear la distribución: ${error.message}`);
  process.exitCode = 1;
});
