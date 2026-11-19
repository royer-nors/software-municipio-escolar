const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");

const instaladorRoot = path.resolve(__dirname, "..");
const proyectoRoot = path.resolve(instaladorRoot, "..");
const stagingRoot = path.join(instaladorRoot, "staging");
const backendStage = path.join(stagingRoot, "servidor", "backend");
const envDir = path.join(stagingRoot, "vite-env-vacio");

function borrarSeguro(destino, limite) {
  const resuelto = path.resolve(destino);
  const base = path.resolve(limite);
  if (!resuelto.startsWith(`${base}${path.sep}`)) {
    throw new Error(`Se rechazó limpiar una ruta fuera de staging: ${resuelto}`);
  }
  return fs.rm(resuelto, { recursive: true, force: true });
}

function ejecutarNpm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  const comando = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const comandoArgs = npmCli ? [npmCli, ...args] : args;
  const resultado = spawnSync(comando, comandoArgs, {
    cwd,
    stdio: "inherit",
    shell: !npmCli && process.platform === "win32",
  });
  if (resultado.error) throw resultado.error;
  if (resultado.status !== 0) throw new Error(`npm ${args.join(" ")} terminó con código ${resultado.status}.`);
}

async function compilarFrontend() {
  const frontendRoot = path.join(proyectoRoot, "frontend");
  const requireFrontend = createRequire(path.join(frontendRoot, "package.json"));
  const { build } = requireFrontend("vite");
  const pluginReact = requireFrontend("@vitejs/plugin-react").default;

  process.env.VITE_API_URL = "/api";
  await build({
    configFile: false,
    root: frontendRoot,
    envDir,
    mode: "production",
    base: "/",
    plugins: [pluginReact()],
    build: {
      outDir: path.join(frontendRoot, "dist"),
      emptyOutDir: true,
    },
  });
}

async function prepararBackendProduccion() {
  const backendRoot = path.join(proyectoRoot, "backend");
  await fs.mkdir(backendStage, { recursive: true });
  await fs.copyFile(path.join(backendRoot, "package.json"), path.join(backendStage, "package.json"));
  await fs.copyFile(path.join(backendRoot, "package-lock.json"), path.join(backendStage, "package-lock.json"));
  ejecutarNpm(["ci", "--omit=dev", "--no-audit", "--no-fund"], backendStage);
}

async function main() {
  await borrarSeguro(stagingRoot, instaladorRoot);
  await fs.mkdir(envDir, { recursive: true });
  console.log("Compilando el frontend con VITE_API_URL=/api, base=/ y sin leer .env.local…");
  await compilarFrontend();
  console.log("Instalando dependencias de producción del backend en staging…");
  await prepararBackendProduccion();
  console.log("Preparación terminada. backend/node_modules no se modificó.");
}

main().catch(error => {
  console.error(`No se pudo preparar el instalador: ${error.message}`);
  process.exitCode = 1;
});
