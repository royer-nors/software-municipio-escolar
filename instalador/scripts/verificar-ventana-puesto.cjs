// Verifica el Puesto en Electron con un perfil temporal y HTTP local.
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const assert = require("node:assert/strict");
if (!process.versions.electron) {
  (async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-ventana-nativa-"));
    try {
      const env = { ...process.env };
      for (const k of Object.keys(env)) if (["ELECTRON_RUN_AS_NODE", "NODE_OPTIONS"].includes(k.toUpperCase())) delete env[k];
      const electron = path.resolve(__dirname, "../../frontend/node_modules/electron/dist/electron.exe");
      process.exitCode = await new Promise((resolve, reject) => {
        const hijo = require("node:child_process").spawn(electron, [__filename, dir, "--disable-gpu"], { env, windowsHide: true, stdio: "inherit" });
        hijo.on("error", reject); hijo.on("exit", c => resolve(c ?? 1));
      });
    } finally {
      assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(dir).startsWith("sme-ventana-nativa-"));
      await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
    }
  })().catch(e => { console.error(e.message); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, safeStorage } = require("electron");
  const { createServer } = require("node:http");
  const { once } = require("node:events");
  const { ControlVentanaPuesto } = require("../puesto/control-ventana.cjs");
  const dir = process.argv[2];
  app.setPath("userData", dir); app.setPath("sessionData", dir);
  app.on("window-all-closed", () => {});
  app.on("before-quit", event => event.preventDefault());
  setTimeout(() => { console.error("La verificación nativa excedió el tiempo límite."); app.exit(1); }, 30000).unref();
  app.whenReady().then(async () => {
    const crear = () => new BrowserWindow({ show: false, frame: true, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    let w = crear();
    try {
      await w.loadURL("data:text/html,<p>Prueba aislada</p>");
      let estado = "activa";
      const opciones = { archivo: path.join(dir, "pendiente.json"), safeStorage,
        consultar: async () => ({ estado, referencia: "a".repeat(64), pendientes: estado === "activa" ? 1 : 0 }),
        reiniciarVista: () => w.loadURL("data:text/html,<p>Espera limpia</p>") };
      let c = new ControlVentanaPuesto(opciones); await c.cargar(); c.conectar(w);
      assert.equal(w.isKiosk(), false); assert.equal(w.isFullScreen(), false);
      for (const metodo of ["isClosable", "isMinimizable", "isMaximizable"]) assert.equal(w[metodo](), true);
      console.log("APROBADO: ventana nativa normal");
      await c.iniciar("http://localhost:3000"); await c.registrar("comprobante-solo-fixture", "http://localhost:3000");
      assert.equal(w.isKiosk(), true); assert.equal(w.isFullScreen(), true);
      for (const metodo of ["isClosable", "isMinimizable", "isMaximizable"]) assert.equal(w[metodo](), false);
      assert.ok(!(await fs.readFile(opciones.archivo, "utf8")).includes("comprobante-solo-fixture"));
      console.log("APROBADO: kiosco nativo y persistencia cifrada con safeStorage");
      c.marcarIncierto(); assert.equal((await c.resolver("http://localhost:3000", true)).ok, false);
      // Un reinicio real destruye la ventana y sus listeners anteriores.
      const anterior = w; w = crear(); anterior.destroy();
      await w.loadURL("data:text/html,<p>Sesion recuperada</p>");
      const recuperado = new ControlVentanaPuesto(opciones); await recuperado.cargar(); recuperado.conectar(w);
      c = recuperado;
      assert.equal(w.isKiosk(), true); assert.equal((await c.resolver("http://localhost:3000")).ok, false);
      console.log("APROBADO: sesión activa y reinicio mantienen bloqueo");
      estado = "registrada";
      assert.deepEqual(await c.resolver("http://localhost:3000"), { ok: false, requiereFinalizar: true });
      assert.equal(w.isKiosk(), true);
      assert.equal((await c.resolver("http://localhost:3000", true)).ok, true);
      assert.equal(w.isKiosk(), false); assert.equal(w.isFullScreen(), false);
      for (const metodo of ["isClosable", "isMinimizable", "isMaximizable"]) assert.equal(w[metodo](), true);
      assert.equal(await w.webContents.executeJavaScript("document.body.textContent"), "Espera limpia");
      console.log("APROBADO: vuelta a ventana nativa y contenido limpio");
    } finally { w.destroy(); }
  }).then(async () => {
    let estado = "activa";
    const { crearEntorno } = require("../../backend/test-support/entorno-votacion-puesto");
    const { createApp } = require("../../backend/app");
    const jwt = require("../../backend/node_modules/jsonwebtoken");
    const { JWT_ISSUER, JWT_AUDIENCE } = require("../../backend/config/auth");
    const entorno = await crearEntorno({ real: false });
    const jwtSecret = "secreto-exclusivo-verificacion-electron";
    await entorno.pool.query("UPDATE configuracion_votacion SET automatica = false, votacion_abierta = false");
    await entorno.pool.query("INSERT INTO administradores (usuario, password_hash) VALUES ('admin-fixture', 'solo-fixture')");
    const token = jwt.sign({ rol: "administrador", usuario: "admin-fixture", version_token: 0 }, jwtSecret,
      { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, subject: "1", expiresIn: 3600 });
    const backend = createApp({ pool: entorno.pool, jwtSecret });
    const servidor = createServer((req, res) => {
      if (req.url === "/api/puesto/sesion-ventana") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ estado, referencia: "a".repeat(64), pendientes: estado === "activa" ? 1 : 0 }));
      } else if (req.url === "/puesto") {
        res.setHeader("Content-Type", "text/html");
        res.end('<title>frontend</title><input id="dni" aria-label="DNI">');
      } else backend(req, res);
    });
    servidor.listen(0, "127.0.0.1");
    await once(servidor, "listening");
    const origen = `http://127.0.0.1:${servidor.address().port}`;
    async function cambiarEleccion(votacionAbierta) {
      const respuesta = await fetch(origen + "/api/votacion/configuracion", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ votacionAbierta, confirmarCambioActivo: true, motivo: "Verificación nativa del Puesto" }),
      });
      const datos = await respuesta.json();
      assert.equal(respuesta.status, 200, JSON.stringify(datos));
      assert.equal(datos.configuracion.votacionAbierta, votacionAbierta);
    }
    await fs.writeFile(path.join(dir, "puesto-config.json"), JSON.stringify({ servidorUrl: origen }));
    const creada = once(app, "browser-window-created");
    const archivoAsar = process.env.SME_PRUEBA_PUESTO_ASAR;
    require(archivoAsar ? path.join(path.resolve(archivoAsar), "puesto", "main.cjs") : "../puesto/main.cjs");
    const [, w] = await creada;
    await once(w.webContents, "did-finish-load");
    try {
      const evaluar = js => w.webContents.executeJavaScript(js);
      assert.equal(await evaluar('document.querySelector("h1").textContent'), "Conectar al Servidor");
      assert.equal(await evaluar(`window.puestoApp.comprobarServidor({ servidorUrl: ${JSON.stringify(origen)} }).then(r => r.ok)`), true);
      const conectado = once(w.webContents, "did-finish-load");
      await evaluar("void window.puestoApp.continuar()");
      await conectado;
      assert.equal(w.webContents.getURL(), origen + "/puesto");
      assert.equal(w.getTitle(), "Software Municipio Escolar — Puesto de Votación");
      assert.equal(w.isKiosk(), false);
      await cambiarEleccion(true);
      await esperarKiosco(w, true);
      assert.equal(await evaluar('document.querySelector("#dni").value'), "");
      assert.equal(w.isClosable(), false);
      await enviarCerrarWindows(w);
      assert.equal(w.isDestroyed(), false);
      assert.equal(w.isMinimizable(), false);
      await cambiarEleccion(false);
      await esperarKiosco(w, false);
      assert.equal(w.isClosable(), true);
      await cambiarEleccion(true);
      assert.equal(await evaluar("window.puestoVentana.confirmarEleccionAbierta().then(r => r.ok)"), true);
      assert.equal(await evaluar('window.puestoVentana.iniciarAutenticacion().then(r => r.ok)'), true);
      assert.equal(await evaluar('window.puestoVentana.registrarSesion("comprobante-fixture").then(r => r.ok)'), true);
      assert.equal(w.isKiosk(), true);
      assert.equal(w.isFullScreen(), true);
      w.close();
      assert.equal(w.isDestroyed(), false);
      w.minimize();
      assert.equal(w.isMinimized(), false);
      w.setFullScreen(false);
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.equal(w.isFullScreen(), true);
      const recargada = once(w.webContents, "did-finish-load");
      w.webContents.reload();
      await recargada;
      assert.equal(w.isKiosk(), true);
      await cambiarEleccion(false);
      assert.equal(await evaluar("window.puestoVentana.confirmarEleccionAbierta().then(r => r.ok)"), false);
      assert.equal(w.isKiosk(), true);
      estado = "registrada";
      const finalizado = once(w.webContents, "did-finish-load");
      await evaluar("void window.puestoVentana.finalizarSesion()");
      await finalizado;
      for (let intento = 0; intento < 20 && w.isKiosk(); intento++) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(w.isKiosk(), false);
      assert.equal(w.isClosable(), true);
      assert.equal(w.isMinimizable(), true);
      const cerrada = once(w, "closed");
      await enviarCerrarWindows(w);
      await cerrada;
      assert.equal(w.isDestroyed(), true);
      console.log("APROBADO: SC_CLOSE de Windows bloqueado con DNI vacío y permitido tras el cierre administrativo");
    } finally {
      servidor.close();
      servidor.closeAllConnections();
      await entorno.cerrar();
    }
  }).then(() => app.exit(0), e => { console.error(e); app.exit(1); });
}

async function esperarKiosco(ventana, esperado) {
  for (let intento = 0; intento < 60 && ventana.isKiosk() !== esperado; intento++) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(ventana.isKiosk(), esperado);
}

async function enviarCerrarWindows(ventana) {
  assert.equal(process.platform, "win32");
  const { execFileSync } = require("node:child_process");
  const buffer = ventana.getNativeWindowHandle();
  const hwnd = buffer.length === 8 ? buffer.readBigUInt64LE() : BigInt(buffer.readUInt32LE());
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ComandoVentana {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool PostMessageW(IntPtr hWnd, uint msg, UIntPtr wParam, IntPtr lParam);
}
'@
if (-not [ComandoVentana]::PostMessageW([IntPtr][long]${hwnd}, 0x0112, [UIntPtr][uint32]0xF060, [IntPtr]::Zero)) { exit 1 }
`;
  execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  await new Promise(resolve => setTimeout(resolve, 200));
}
