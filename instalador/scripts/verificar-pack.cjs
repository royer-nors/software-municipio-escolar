const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");

const instaladorRoot = path.resolve(__dirname, "..");
const requireLocal = createRequire(path.join(instaladorRoot, "package.json"));
const asar = requireLocal("@electron/asar");

function exigirExiste(ruta, descripcion) {
  if (!fs.existsSync(ruta)) throw new Error(`Falta ${descripcion}: ${ruta}`);
}

function exigirAusente(ruta, descripcion) {
  if (fs.existsSync(ruta)) throw new Error(`Se encontró ${descripcion} fuera de las carpetas de producto: ${ruta}`);
}

function verificarServidor() {
  const raiz = path.join(instaladorRoot, "release", "servidor", "win-unpacked", "resources");
  exigirExiste(path.join(raiz, "app.asar"), "app.asar del servidor");
  exigirExiste(path.join(raiz, "backend", "server.js"), "backend/server.js");
  exigirExiste(path.join(raiz, "backend", "routes", "auth.routes.js"), "rutas del backend");
  exigirExiste(path.join(raiz, "backend", "node_modules", "@electric-sql", "pglite", "dist", "pglite.wasm"), "WASM de PGlite");
  exigirExiste(path.join(raiz, "backend", "node_modules", "@electric-sql", "pglite", "dist", "initdb.wasm"), "WASM de inicialización de PGlite");
  exigirExiste(path.join(raiz, "backend", "node_modules", "bcryptjs", "index.js"), "bcryptjs de producción");
  exigirExiste(path.join(raiz, "backend", "node_modules", "sharp"), "sharp de producción");
  const sharpLib = path.join(raiz, "backend", "node_modules", "@img", "sharp-win32-x64", "lib");
  exigirExiste(sharpLib, "binarios nativos de sharp para Windows x64");
  if (!fs.readdirSync(sharpLib).some(nombre => nombre.endsWith(".node")) || !fs.readdirSync(sharpLib).some(nombre => nombre.endsWith(".dll"))) {
    throw new Error("Faltan binarios de sharp en sus dependencias de Windows x64.");
  }
  exigirExiste(path.join(raiz, "frontend", "dist", "index.html"), "frontend/dist/index.html");

  const migraciones = path.join(raiz, "database", "migrations");
  exigirExiste(migraciones, "directorio externo de migraciones SQL");
  if (!fs.readdirSync(migraciones).some(nombre => nombre.endsWith(".sql"))) throw new Error("No hay migraciones SQL empaquetadas.");
  for (const moduloDev of ["nodemon", "write-excel-file"]) {
    if (fs.existsSync(path.join(raiz, "backend", "node_modules", moduloDev))) throw new Error(`El staging incluyó ${moduloDev}, que es una dependencia de desarrollo.`);
  }

  const archivoAsar = path.join(raiz, "app.asar");
  const archivos = asar.listPackage(archivoAsar);
  if (!archivos.some(nombre => nombre.endsWith("servidor\\main.cjs"))) throw new Error("Falta el main del servidor en app.asar.");
  const assets = fs.readdirSync(path.join(raiz, "frontend", "dist", "assets"));
  const js = assets.filter(nombre => nombre.endsWith(".js"));
  if (!js.length || js.some(nombre => fs.readFileSync(path.join(raiz, "frontend", "dist", "assets", nombre), "utf8").includes("http://localhost:3000/api"))) {
    throw new Error("El frontend compilado no apunta al API relativo /api.");
  }
  exigirAusente(path.join(instaladorRoot, "release", "win-unpacked"), "win-unpacked suelto en release");

  console.log("Servidor: backend, producción, PGlite/WASM, bcryptjs, migraciones y frontend presentes fuera de asar.");
}

function verificarPuesto() {
  const archivoAsar = path.join(instaladorRoot, "release", "puesto", "win-unpacked", "resources", "app.asar");
  exigirExiste(archivoAsar, "app.asar del puesto");
  const archivos = asar.listPackage(archivoAsar);
  for (const requerido of ["puesto\\main.cjs", "puesto\\clave.html", "puesto\\seguridad-local.cjs"]) {
    if (!archivos.includes(`\\${requerido}`)) throw new Error(`Falta ${requerido} en app.asar del puesto.`);
  }
  exigirAusente(path.join(instaladorRoot, "release", "win-unpacked"), "win-unpacked suelto en release");
  console.log("Puesto: app.asar contiene main, pantalla de clave y funciones de configuración.");
}

try {
  const producto = process.argv[2];
  if (producto === "servidor") verificarServidor();
  else if (producto === "puesto") verificarPuesto();
  else throw new Error("Indica el producto servidor o puesto.");
} catch (error) {
  console.error(`Verificación del paquete fallida: ${error.message}`);
  process.exitCode = 1;
}
