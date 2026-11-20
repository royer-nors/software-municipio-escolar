// Ejecuta el Puesto fuente con perfil temporal; no abre su configuración real.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
async function main() {
  const electron = path.join(root, "frontend/node_modules/electron/dist/electron.exe");
  await fs.access(electron);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-puesto-aislado-"));
  try {
    const inicio = path.join(dir, "iniciar.cjs");
    await fs.writeFile(inicio, `const { app } = require("electron");
app.setPath("userData", ${JSON.stringify(dir)});
app.setPath("sessionData", ${JSON.stringify(dir)});
require(${JSON.stringify(path.join(root, "instalador/puesto/main.cjs"))});
`);
    const env = { ...process.env };
    for (const k of Object.keys(env)) if (["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS"].includes(k.toUpperCase())) delete env[k];
    console.log("Puesto temporal: configura la dirección de tu Servidor de prueba y una clave de salida ficticia. El perfil se eliminará al cerrar.");
    process.exitCode = await new Promise((resolve, reject) => {
      const hijo = spawn(electron, [inicio], { cwd: root, env, windowsHide: true, stdio: "inherit" });
      hijo.on("error", reject); hijo.on("exit", codigo => resolve(codigo ?? 1));
    });
  } finally {
    if (!path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(dir).startsWith("sme-puesto-aislado-")) throw Error("Ruta temporal no válida");
    await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
