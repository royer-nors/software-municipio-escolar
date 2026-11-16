const { app, BrowserWindow, clipboard, dialog, ipcMain } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let ventana;
let backend;
let cierreAutorizado = false;
let cierrePendiente;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  });

  ipcMain.handle("servidor:urls", () => urlsLan());
  ipcMain.handle("servidor:copiar", (_event, url) => {
    if (!urlsLan().includes(url)) return false;
    clipboard.writeText(url);
    return true;
  });

  app.whenReady().then(iniciarServidorEscritorio).catch(async error => {
    await cerrarBackend();
    dialog.showErrorBox("No se pudo iniciar el servidor", error.message);
    cierreAutorizado = true;
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && backend) crearVentana();
  });

  app.on("before-quit", event => {
    if (cierreAutorizado) return;
    event.preventDefault();
    if (cierrePendiente) return;
    cierrePendiente = cerrarBackend().catch(error => {
      console.error(`No se pudo cerrar limpiamente el backend: ${error.message}`);
    }).finally(() => {
      cierreAutorizado = true;
      app.quit();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

function proyectoRoot() {
  return app.isPackaged ? process.resourcesPath : path.resolve(__dirname, "../..");
}

function rutasRuntime() {
  if (app.isPackaged) {
    return {
      backend: path.join(process.resourcesPath, "backend"),
      frontendDist: path.join(process.resourcesPath, "frontend", "dist"),
    };
  }
  const root = proyectoRoot();
  return { backend: path.join(root, "backend"), frontendDist: path.join(root, "frontend", "dist") };
}

function esIpv4Privada(ip) {
  const partes = ip.split(".");
  if (partes.length !== 4 || partes.some(p => !/^\d+$/.test(p) || Number(p) > 255)) return false;
  const [a, b] = partes.map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function ipsLan() {
  const ips = [];
  for (const adaptadores of Object.values(os.networkInterfaces())) {
    for (const adaptador of adaptadores ?? []) {
      const ipv4 = adaptador.family === "IPv4" || adaptador.family === 4;
      if (ipv4 && !adaptador.internal && esIpv4Privada(adaptador.address) && !ips.includes(adaptador.address)) ips.push(adaptador.address);
    }
  }
  return ips;
}

function urlsLan() { return ipsLan().map(ip => `http://${ip}:3000`); }

async function esperarEscucha(server) {
  if (server.listening) return;
  await new Promise((resolve, reject) => {
    const escuchar = () => { limpiar(); resolve(); };
    const error = err => { limpiar(); reject(err); };
    const limpiar = () => { server.off("listening", escuchar); server.off("error", error); };
    server.once("listening", escuchar);
    server.once("error", error);
  });
}

async function esperarApi(url, timeoutMs = 120000) {
  const fin = Date.now() + timeoutMs;
  let ultimoError;
  while (Date.now() < fin) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 1200);
    try {
      const response = await fetch(url, { signal: controlador.signal });
      if (response.ok) {
        const estado = await response.json();
        if (estado.estado === "activo") return;
      }
      ultimoError = new Error(`La API respondió HTTP ${response.status}.`);
    } catch (error) { ultimoError = error; }
    finally { clearTimeout(temporizador); }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`La API no respondió correctamente dentro del tiempo esperado${ultimoError ? `: ${ultimoError.message}` : "."}`);
}

async function iniciarServidorEscritorio() {
  const runtime = rutasRuntime();
  const frontendIndex = path.join(runtime.frontendDist, "index.html");
  if (!fs.existsSync(frontendIndex)) throw new Error(`No se encontró el frontend compilado: ${frontendIndex}`);

  process.env.MODO_INSTALADOR = "true";
  process.env.MODO_LAN = "true";
  process.env.HOST = "0.0.0.0";
  process.env.PORT = "3000";
  process.env.DATA_DIR = app.getPath("userData");
  process.env.FRONTEND_DIST = runtime.frontendDist;
  process.env.NODE_ENV = "development";
  process.env.CORS_ALLOW_NULL_ORIGIN = "false";
  delete process.env.JWT_SECRET;

  const { iniciarInstalador } = require(path.join(runtime.backend, "server.js"));
  backend = await iniciarInstalador();
  await esperarEscucha(backend.server);
  await esperarApi("http://127.0.0.1:3000/api/estado");
  crearVentana();
}

function crearVentana() {
  ventana = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: "Municipio Escolar · Servidor",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  ventana.once("ready-to-show", () => ventana.show());
  ventana.on("closed", () => { ventana = undefined; });
  ventana.loadFile(path.join(__dirname, "index.html"));
}

async function cerrarBackend() {
  if (!backend) return;
  const { server, pool } = backend;
  if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.close();
  backend = undefined;
}
