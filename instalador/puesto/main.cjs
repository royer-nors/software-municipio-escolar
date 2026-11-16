const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const ARCHIVO_CONFIG = "puesto-config.json";
const INTERVALO_REINTENTO_MS = 5000;
const FALLOS_ANTES_DE_MOSTRAR_OFFLINE = 3;
const TIMEOUT_SALUD_MS = 5000;

let ventana;
let servidorUrl = "";
let fallosConsecutivos = 0;
let temporizadorSalud;
let vistaLocal = "configuracion";
let salirAutorizado = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(iniciar).catch(error => mostrarErrorFatal(error));

  app.on("second-instance", () => {
    if (ventana) ventana.focus();
  });

  app.on("before-quit", () => {
    salirAutorizado = true;
    clearInterval(temporizadorSalud);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });

  ipcMain.handle("puesto:estado", () => ({
    vista: vistaLocal,
    servidorUrl,
  }));
  ipcMain.handle("puesto:guardar-servidor", async (_event, valor) => {
    const base = normalizarServidorUrl(valor);
    await verificarServidor(base);
    await guardarConfiguracion(base);
    servidorUrl = base;
    fallosConsecutivos = 0;
    await abrirPuesto();
    iniciarMonitoreo();
    return { ok: true };
  });
  ipcMain.handle("puesto:reintentar", () => reintentarConexion());

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && salirAutorizado) app.quit();
  });
}

async function iniciar() {
  crearVentana();
  servidorUrl = await leerConfiguracion();
  if (!servidorUrl) {
    mostrarVistaLocal("configuracion");
    return;
  }
  try {
    await verificarServidor(servidorUrl);
    await abrirPuesto();
  } catch {
    mostrarVistaLocal("sin-conexion");
  }
  iniciarMonitoreo();
}

function crearVentana() {
  if (ventana) return;
  ventana = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    kiosk: true,
    fullscreen: true,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  ventana.setMenu(null);
  ventana.once("ready-to-show", () => ventana.show());
  ventana.on("closed", () => { ventana = undefined; });
  ventana.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  ventana.webContents.on("will-navigate", (event, destino) => {
    if (destino.startsWith("file://")) return;
    let mismaOrigen = false;
    try { mismaOrigen = new URL(destino).origin === new URL(servidorUrl).origin; } catch {}
    if (!mismaOrigen) event.preventDefault();
  });
  ventana.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const tecla = input.key.toLowerCase();
    const reconfigurar = input.control && input.shift && tecla === "f12";
    if (reconfigurar) {
      event.preventDefault();
      mostrarVistaLocal("configuracion");
      return;
    }
    const atajoBloqueado = input.alt && tecla === "f4"
      || input.control && ["w", "q", "r", "i", "j", "u"].includes(tecla)
      || tecla === "f5" || tecla === "f11" || tecla === "f12";
    if (atajoBloqueado) event.preventDefault();
  });
  ventana.webContents.on("did-fail-load", (_event, codigo, _descripcion, _url, esMarcoPrincipal) => {
    if (esMarcoPrincipal && codigo !== -3 && servidorUrl) {
      fallosConsecutivos = FALLOS_ANTES_DE_MOSTRAR_OFFLINE;
      mostrarVistaLocal("sin-conexion");
      iniciarMonitoreo();
    }
  });
  ventana.on("close", event => {
    if (!salirAutorizado) event.preventDefault();
  });
  mostrarVistaLocal("configuracion");
}

function normalizarServidorUrl(valor) {
  if (typeof valor !== "string" || !valor.trim()) throw new Error("Escribe la IP o URL del servidor.");
  let entrada = valor.trim();
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(entrada)) entrada = `http://${entrada}`;
  let url;
  try { url = new URL(entrada); } catch { throw new Error("La IP o URL no tiene un formato válido."); }
  if (url.protocol !== "http:" || url.username || url.password || !["", "/"].includes(url.pathname) || url.search || url.hash) {
    throw new Error("Usa una dirección HTTP del servidor, por ejemplo http://192.168.1.20:3000.");
  }
  if (!url.port) url.port = "3000";
  return url.origin;
}

async function verificarServidor(base) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_SALUD_MS);
  try {
    const respuesta = await fetch(`${base}/api/estado`, { signal: controlador.signal, cache: "no-store" });
    const datos = await respuesta.json();
    if (!respuesta.ok || datos?.estado !== "activo") throw new Error("El servidor no confirmó que está activo.");
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Se agotó el tiempo de conexión con el servidor.");
    throw new Error(`No se pudo conectar con ${base}. Verifica la IP y que ambos equipos estén en la misma red.`);
  } finally {
    clearTimeout(temporizador);
  }
}

async function leerConfiguracion() {
  try {
    const contenido = await fs.readFile(archivoConfiguracion(), "utf8");
    const datos = JSON.parse(contenido);
    return normalizarServidorUrl(datos.servidorUrl);
  } catch (error) {
    if (error.code !== "ENOENT") await fs.rename(archivoConfiguracion(), `${archivoConfiguracion()}.invalido`).catch(() => {});
    return "";
  }
}

async function guardarConfiguracion(base) {
  const archivo = archivoConfiguracion();
  const temporal = `${archivo}.tmp`;
  await fs.writeFile(temporal, `${JSON.stringify({ servidorUrl: base }, null, 2)}\n`, "utf8");
  await fs.rename(temporal, archivo);
}

function archivoConfiguracion() {
  return path.join(app.getPath("userData"), ARCHIVO_CONFIG);
}

function mostrarVistaLocal(vista) {
  if (!ventana) return;
  vistaLocal = vista;
  ventana.loadFile(path.join(__dirname, "configuracion.html"), { query: { vista } });
}

async function abrirPuesto() {
  if (!ventana || !servidorUrl) return;
  vistaLocal = "puesto";
  await ventana.loadURL(new URL("/puesto", servidorUrl).toString());
}

function iniciarMonitoreo() {
  clearInterval(temporizadorSalud);
  if (!servidorUrl) return;
  temporizadorSalud = setInterval(async () => {
    try {
      await verificarServidor(servidorUrl);
      fallosConsecutivos = 0;
      if (vistaLocal === "sin-conexion") await abrirPuesto();
    } catch {
      fallosConsecutivos += 1;
      if (fallosConsecutivos >= FALLOS_ANTES_DE_MOSTRAR_OFFLINE && vistaLocal === "puesto") {
        mostrarVistaLocal("sin-conexion");
      }
    }
  }, INTERVALO_REINTENTO_MS);
}

async function reintentarConexion() {
  if (!servidorUrl) return { ok: false, mensaje: "Configura la URL del servidor primero." };
  try {
    await verificarServidor(servidorUrl);
    fallosConsecutivos = 0;
    await abrirPuesto();
    iniciarMonitoreo();
    return { ok: true };
  } catch (error) {
    return { ok: false, mensaje: error.message };
  }
}

function mostrarErrorFatal(error) {
  console.error(`No se pudo iniciar la aplicación de puesto: ${error.message}`);
  if (ventana) mostrarVistaLocal("configuracion");
}
