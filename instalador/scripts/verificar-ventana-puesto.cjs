// Verifica propiedades nativas en Electron, oculto y sin conectarse a una base.
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
  const { ControlVentanaPuesto } = require("../puesto/control-ventana.cjs");
  const dir = process.argv[2];
  app.setPath("userData", dir); app.setPath("sessionData", dir);
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
      estado = "registrada"; assert.equal((await c.resolver("http://localhost:3000")).ok, true);
      assert.equal(w.isKiosk(), false); assert.equal(w.isFullScreen(), false);
      for (const metodo of ["isClosable", "isMinimizable", "isMaximizable"]) assert.equal(w[metodo](), true);
      assert.equal(await w.webContents.executeJavaScript("document.body.textContent"), "Espera limpia");
      console.log("APROBADO: vuelta a ventana nativa y contenido limpio");
    } finally { w.destroy(); }
  }).then(() => app.exit(0), e => { console.error(e.message); app.exit(1); });
}
