// Verificación manual de la aplicación fuente sin abrir el userData real.
// No genera instaladores ni crea credenciales predeterminadas.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const net = require("node:net");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
async function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.connect({ host: "127.0.0.1", port: 3000 });
    s.once("connect", () => { s.destroy(); reject(new Error("El puerto 3000 está ocupado. Cierra normalmente el Servidor instalado antes de abrir la prueba aislada.")); });
    s.once("error", e => e.code === "ECONNREFUSED" ? resolve() : reject(e));
    s.setTimeout(3000, () => { s.destroy(); reject(new Error("No se pudo comprobar el puerto 3000.")); });
  });
}
async function main() {
  await puertoLibre();
  const opciones = ["frontend", "instalador"].map(p => path.join(root, p, "node_modules/electron/dist/electron.exe"));
  let electron;
  for (const candidato of opciones) { try { await fs.access(candidato); electron = candidato; break; } catch { /* siguiente */ } }
  if (!electron) throw new Error("No se encontró Electron. Instala las dependencias del proyecto antes de probar.");
  await fs.access(path.join(root, "frontend/dist/index.html"));
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-servidor-aislado-"));
  try {
    const inicio = path.join(dir, "iniciar.cjs");
    await fs.writeFile(inicio, `const { app } = require("electron");
app.setName("municipio-servidor-prueba-aislada");
app.setPath("userData", ${JSON.stringify(dir)});
app.setPath("sessionData", ${JSON.stringify(dir)});
require(${JSON.stringify(path.join(root, "instalador/servidor/main.cjs"))});
`);
    const env = { ...process.env };
    env.MEDIA_ROOT = path.join(dir, "storage/listas");
    for (const k of Object.keys(env)) if (["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS"].includes(k.toUpperCase())) delete env[k];
    console.log("PRUEBA AISLADA: crea un administrador ficticio en la pantalla inicial. No es tu base real.");
    console.log("Selecciona una operación, simula y revisa el resultado. No necesitas confirmar la ejecución.");
    const codigo = await new Promise((resolve, reject) => {
      const hijo = spawn(electron, [inicio], { cwd: path.join(root, "instalador"), env, windowsHide: true, stdio: "inherit" });
      hijo.on("error", reject); hijo.on("exit", c => resolve(c ?? 1));
    });
    process.exitCode = codigo;
  } finally {
    if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(dir).startsWith("sme-servidor-aislado-")) throw new Error("Se rechazó limpiar una ruta no temporal.");
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    console.log("Perfil temporal retirado. La base real no se abrió desde esta prueba.");
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
