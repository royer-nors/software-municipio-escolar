const { app, BrowserWindow, dialog, ipcMain, safeStorage } = require("electron");
const { ControlVentanaPuesto } = require("./control-ventana.cjs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  crearHashClave,
  crearLimitadorIntentos,
  normalizarServidorUrl,
  validarClaveInicial,
  verificarHashClave,
} = require("./seguridad-local.cjs");

const ARCHIVO_CONFIG = "puesto-config.json";
const INTERVALO_REINTENTO_MS = 5000;
const FALLOS_ANTES_DE_MOSTRAR_OFFLINE = 3;
const TIMEOUT_SALUD_MS = 5000;

let ventana;
let servidorUrl = "";
let configuracionLocal;
let fallosConsecutivos = 0;
let temporizadorSalud;
let vistaLocal = "configuracion";
let salirAutorizado = false;
let configuracionAutorizada = false;
let ventanaClave;
let accionClave;
let controlVentana;
const intentosClave = crearLimitadorIntentos();

app.setName("software-municipio-escolar-puesto");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(iniciar).catch(error => mostrarErrorFatal(error));

  app.on("second-instance", () => {
    if (ventana) ventana.focus();
  });

  app.on("before-quit", event => {
    if (controlVentana?.pendiente && !salirAutorizado) { event.preventDefault(); return; }
    salirAutorizado = true;
    clearInterval(temporizadorSalud);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });

  ipcMain.handle("puesto:estado", event => {
    if (!esVistaLocal(event, "configuracion.html")) return { vista: "puesto", servidorUrl: "" };
    return { vista: vistaLocal, servidorUrl, requiereClave: !configuracionLocal?.claveHash };
  });
  ipcMain.handle("puesto:guardar-servidor", async (event, datos) => {
    if (!esVistaLocal(event, "configuracion.html") || vistaLocal !== "configuracion" || !configuracionAutorizada) {
      return { ok: false, mensaje: "Para cambiar la configuración, solicita la clave de salida o reconfiguración." };
    }
    let normalizado;
    try {
      normalizado = normalizarServidorUrl(datos?.servidorUrl);
      if (normalizado.aviso) {
        await dialog.showMessageBox(ventana, {
          type: "info",
          title: "Dirección ajustada",
          message: normalizado.aviso,
          buttons: ["Continuar"],
          defaultId: 0,
          noLink: true,
        });
      }
      if (!configuracionLocal?.claveHash) {
        validarClaveInicial(datos?.clave, datos?.confirmacion);
      }
      await verificarServidor(normalizado.url);
      const claveHash = configuracionLocal?.claveHash || crearHashClave(datos.clave);
      await guardarConfiguracion({ servidorUrl: normalizado.url, claveHash });
      configuracionLocal = { servidorUrl: normalizado.url, claveHash };
      servidorUrl = normalizado.url;
      configuracionAutorizada = false;
      fallosConsecutivos = 0;
      await abrirPuesto();
      iniciarMonitoreo();
      return { ok: true, aviso: normalizado.aviso };
    } catch (error) {
      return { ok: false, mensaje: mensajeAmigable(error), aviso: normalizado?.aviso || "", url: normalizado?.url || "" };
    }
  });
  ipcMain.handle("puesto:reintentar", event => esVistaLocal(event, "configuracion.html") ? reintentarConexion() : { ok: false, mensaje: "No se pudo reintentar la conexión." });
  ipcMain.handle("puesto:validar-clave", (event, clave) => validarClave(event, clave));
  ipcMain.handle("puesto:cancelar-clave", event => {
    if (!esVentanaClave(event)) return false;
    ventanaClave?.close();
    return true;
  });
  const operarVentana = fn => async (event, ...args) => {
    if (!esPaginaPuesto(event)) return { ok: false };
    try { return await fn(...args); }
    catch { controlVentana?.marcarIncierto(); return { ok: false, mensaje: "No se pudo verificar la sesión. La ventana permanece protegida." }; }
  };
  ipcMain.handle("puesto:iniciar-autenticacion", operarVentana(() => controlVentana.iniciar(servidorUrl)));
  ipcMain.handle("puesto:registrar-sesion", operarVentana(token => controlVentana.registrar(token, servidorUrl)));
  ipcMain.handle("puesto:finalizar-sesion", operarVentana(() => controlVentana.resolver(servidorUrl, true)));

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" && salirAutorizado) app.quit();
  });
}

async function iniciar() {
  configuracionLocal = await leerConfiguracion();
  servidorUrl = configuracionLocal?.servidorUrl || "";
  configuracionAutorizada = !configuracionLocal?.claveHash;
  controlVentana = new ControlVentanaPuesto({
    archivo: path.join(app.getPath("userData"), "puesto-sesion-pendiente.json"), safeStorage,
    consultar: consultarSesionVentana,
    reiniciarVista: () => ventana.loadURL(new URL("/puesto", servidorUrl).toString()),
  });
  await controlVentana.cargar();
  crearVentana();
  if (!servidorUrl) {
    mostrarVistaLocal("configuracion");
    return;
  }
  try {
    await verificarServidor(servidorUrl);
    await abrirPuesto();
    await controlVentana.resolver(servidorUrl);
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
    kiosk: controlVentana?.pendiente || false,
    fullscreen: controlVentana?.pendiente || false,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  ventana.setMenu(null);
  controlVentana?.conectar(ventana);
  vigilarSolicitudesPuesto();
  ventana.once("ready-to-show", () => ventana.show());
  ventana.on("closed", () => { ventana = undefined; });
  ventana.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  ventana.webContents.on("will-navigate", (event, destino) => {
    controlVentana?.marcarIncierto();
    if (esArchivoLocal(destino, "configuracion.html") || esArchivoLocal(destino, "clave.html")) return;
    let mismaOrigen = false;
    try { mismaOrigen = new URL(destino).origin === new URL(servidorUrl).origin; } catch {}
    if (!mismaOrigen) event.preventDefault();
  });
  ventana.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const tecla = input.key.toLowerCase();
    if (input.control && input.shift && tecla === "f10") {
      event.preventDefault();
      abrirDialogoClave("salir");
      return;
    }
    if (input.control && input.shift && tecla === "f12") {
      event.preventDefault();
      if (configuracionLocal?.claveHash) abrirDialogoClave("reconfigurar");
      else mostrarVistaLocal("configuracion");
      return;
    }
    const atajoBloqueado = input.control && ["i", "j", "u"].includes(tecla) || tecla === "f12"
      || controlVentana?.pendiente && (input.alt && tecla === "f4"
      || input.control && ["w", "q", "r"].includes(tecla) || tecla === "f5" || tecla === "f11");
    if (atajoBloqueado) event.preventDefault();
  });
  ventana.webContents.on("did-fail-load", (_event, codigo, _descripcion, _url, esMarcoPrincipal) => {
    if (esMarcoPrincipal && codigo !== -3 && servidorUrl) {
      controlVentana?.marcarIncierto();
      fallosConsecutivos = FALLOS_ANTES_DE_MOSTRAR_OFFLINE;
      mostrarVistaLocal("sin-conexion");
      iniciarMonitoreo();
    }
  });
  ventana.on("close", event => {
    if (controlVentana?.pendiente && !salirAutorizado) { event.preventDefault(); return; }
    salirAutorizado = true; clearInterval(temporizadorSalud);
  });
  ventana.webContents.on("did-start-navigation", (_e, _url, _inPlace, principal) => {
    if (principal) controlVentana?.marcarIncierto();
  });
  ventana.webContents.on("render-process-gone", () => controlVentana?.marcarIncierto());
}

function esPaginaPuesto(event) {
  if (!ventana || event.sender !== ventana.webContents || event.senderFrame !== ventana.webContents.mainFrame) return false;
  try {
    const u = new URL(event.senderFrame.url);
    return u.origin === servidorUrl && (u.pathname === "/puesto" || u.pathname.startsWith("/puesto/"));
  } catch { return false; }
}

function vigilarSolicitudesPuesto() {
  const wr = ventana.webContents.session.webRequest;
  const esSolicitud = d => {
    try { return d.webContentsId === ventana.webContents.id && new URL(d.url).origin === servidorUrl; }
    catch { return false; }
  };
  wr.onBeforeRequest({ urls: ["http://*/*"] }, (d, continuar) => {
    if (esSolicitud(d) && d.method === "POST" && ["/api/puesto/identificar", "/api/puesto/votos"].includes(new URL(d.url).pathname)) {
      controlVentana.iniciar(servidorUrl).then(() => continuar({}), () => continuar({ cancel: true }));
    } else continuar({});
  });
  wr.onErrorOccurred({ urls: ["http://*/*"] }, d => { if (esSolicitud(d)) controlVentana?.marcarIncierto(); });
}

async function consultarSesionVentana(token, origen) {
  if (origen !== servidorUrl || !ventana) throw Error("Servidor diferente");
  const r = await ventana.webContents.session.fetch(`${origen}/api/puesto/sesion-ventana`, {
    credentials: "include", cache: "no-store", signal: AbortSignal.timeout(5000),
    headers: { Origin: origen, Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw Error("No se pudo verificar la sesión");
  const d = await r.json();
  if (!["activa", "registrada", "vencida"].includes(d.estado) || !/^[a-f0-9]{64}$/.test(d.referencia || "") || !Number.isSafeInteger(d.pendientes) || d.pendientes < 0) throw Error("Estado de sesión inválido");
  return d;
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
    throw new Error("No se pudo conectar con el servidor. Verifica la dirección, que esté encendido y que ambos equipos estén en la misma red.");
  } finally {
    clearTimeout(temporizador);
  }
}

async function leerConfiguracion() {
  try {
    const contenido = await fs.readFile(archivoConfiguracion(), "utf8");
    const datos = JSON.parse(contenido);
    const servidor = normalizarServidorUrl(datos.servidorUrl);
    return { servidorUrl: servidor.url, claveHash: credencialValida(datos.claveHash) ? datos.claveHash : null };
  } catch (error) {
    if (error.code !== "ENOENT") await fs.rename(archivoConfiguracion(), `${archivoConfiguracion()}.invalido`).catch(() => {});
    return null;
  }
}

function credencialValida(credencial) {
  return credencial?.algoritmo === "scrypt"
    && /^[a-f0-9]{32}$/i.test(credencial.salt || "")
    && /^[a-f0-9]{128}$/i.test(credencial.hash || "");
}

async function guardarConfiguracion(configuracion) {
  const archivo = archivoConfiguracion();
  const temporal = `${archivo}.tmp`;
  await fs.writeFile(temporal, `${JSON.stringify(configuracion, null, 2)}\n`, "utf8");
  await fs.rename(temporal, archivo);
}

function archivoConfiguracion() {
  return path.join(app.getPath("userData"), ARCHIVO_CONFIG);
}

function mostrarVistaLocal(vista) {
  if (!ventana) return;
  vistaLocal = vista;
  configuracionAutorizada = true;
  ventana.loadFile(path.join(__dirname, "configuracion.html"), { query: { vista } });
}

function abrirDialogoClave(accion) {
  if (ventanaClave || !ventana || !configuracionLocal?.claveHash) return;
  accionClave = accion;
  ventanaClave = new BrowserWindow({
    parent: ventana,
    modal: true,
    width: 500,
    height: 340,
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  ventanaClave.setMenu(null);
  ventanaClave.once("ready-to-show", () => ventanaClave.show());
  ventanaClave.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  ventanaClave.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const tecla = input.key.toLowerCase();
    if (input.key === "Escape") { event.preventDefault(); ventanaClave?.close(); }
    if (input.alt && tecla === "f4" || input.control && ["w", "q", "r"].includes(tecla)) event.preventDefault();
  });
  ventanaClave.on("closed", () => { ventanaClave = undefined; accionClave = undefined; });
  ventanaClave.loadFile(path.join(__dirname, "clave.html"), { query: { accion } });
}

function esVistaLocal(event, archivo) {
  if (!ventana || event.sender !== ventana.webContents) return false;
  try { return esArchivoLocal(event.senderFrame.url, archivo); }
  catch { return false; }
}

function esVentanaClave(event) {
  if (!ventanaClave || event.sender !== ventanaClave.webContents) return false;
  try { return esArchivoLocal(event.senderFrame.url, "clave.html"); }
  catch { return false; }
}

function esArchivoLocal(valor, archivo) {
  const actual = new URL(valor);
  const esperado = new URL(pathToFileURL(path.join(__dirname, archivo)));
  return actual.protocol === "file:" && actual.hostname === esperado.hostname && actual.pathname === esperado.pathname;
}

function validarClave(event, clave) {
  if (!esVentanaClave(event) || typeof clave !== "string") return { ok: false, mensaje: "No se pudo verificar la clave." };
  const estado = intentosClave.consultar();
  if (!estado.permitido) return { ok: false, mensaje: `Demasiados intentos. Espera ${Math.ceil(estado.restanteMs / 1000)} segundos para volver a intentar.` };
  if (!verificarHashClave(clave, configuracionLocal?.claveHash)) {
    const fallo = intentosClave.registrarFallo();
    if (!fallo.permitido) return { ok: false, mensaje: "Clave incorrecta. Se bloquearon los intentos durante 30 segundos." };
    return { ok: false, mensaje: "La clave es incorrecta." };
  }
  intentosClave.registrarExito();
  const accion = accionClave;
  ventanaClave?.close();
  if (accion === "salir") {
    salirAutorizado = true;
    app.quit();
  } else if (accion === "reconfigurar") {
    mostrarVistaLocal("configuracion");
  }
  return { ok: true };
}

function mensajeAmigable(error) {
  const conocidos = ["Escribe", "La dirección", "Usa", "El servidor", "La clave", "Las claves", "No se pudo conectar", "Se agotó"];
  return conocidos.some(inicio => error.message.startsWith(inicio))
    ? error.message
    : "No se pudo guardar la configuración. Revisa los datos e inténtalo otra vez.";
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
      await controlVentana?.resolver(servidorUrl);
    } catch {
      controlVentana?.marcarIncierto();
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
