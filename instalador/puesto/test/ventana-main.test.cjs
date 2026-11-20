const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { pathToFileURL } = require("node:url");
const { createRequire } = require("node:module");
const { crearHashClave } = require("../seguridad-local.cjs");
const principal = path.resolve(__dirname, "../main.cjs");
const requireReal = createRequire(principal);
async function ejecutar(t, opciones = {}) {
  const dir = opciones.dir || await fs.mkdtemp(path.join(os.tmpdir(), "sme-puesto-main-"));
  if (!opciones.dir) t.after(async () => {
    assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(dir, { recursive: true, force: true });
  });
  if (!opciones.dir && opciones.configurada !== false) await fs.writeFile(path.join(dir, "puesto-config.json"), JSON.stringify({ servidorUrl: "http://127.0.0.1:3000", claveHash: crearHashClave("ClaveFicticiaLocal") }));
  const handlers = new Map(), ventanas = [], intervalos = [], webRequest = {};
  let listo, quit = 0, offline = false, estado = { estado: "activa", referencia: "a".repeat(64), pendientes: 1 };
  const app = Object.assign(new EventEmitter(), { setName() {}, requestSingleInstanceLock: () => true,
    getPath: () => dir, whenReady: () => ({ then(fn) { listo = Promise.resolve().then(fn); return listo; } }),
    quit() { const e = evento(); app.emit("before-quit", e); if (!e.bloqueado) quit++; } });
  const sesion = { webRequest: {
    onBeforeRequest(_f, fn) { webRequest.antes = fn; }, onErrorOccurred(_f, fn) { webRequest.error = fn; },
  }, async fetch() { if (offline) throw Error("offline"); return { ok: true, json: async () => estado }; } };
  class Ventana extends EventEmitter {
    constructor(op) { super(); this.opciones = op; this.destruida = false; this.kiosk = !!op.kiosk; this.full = !!op.fullscreen;
      this.closable = true; this.minimizable = true; this.maximizable = true;
      this.webContents = Object.assign(new EventEmitter(), { id: ventanas.length + 1, session: sesion,
        mainFrame: { url: "about:blank" }, setWindowOpenHandler() {} }); ventanas.push(this);
    }
    setMenu() {} show() {} focus() {} restore() {} isMinimized() { return false; }
    getNormalBounds() { return { x: 10, y: 10, width: 1280, height: 800 }; } isMaximized() { return false; }
    setKiosk(v) { this.kiosk = v; } setFullScreen(v) { this.full = v; } setClosable(v) { this.closable = v; }
    setMinimizable(v) { this.minimizable = v; } setMaximizable(v) { this.maximizable = v; } setBounds() {} maximize() {}
    isDestroyed() { return this.destruida; }
    async loadURL(url) { this.webContents.emit("did-start-navigation", {}, url, false, true); this.webContents.mainFrame.url = url; }
    async loadFile(p) { this.webContents.mainFrame.url = pathToFileURL(p).toString(); }
    close() { const e = evento(); this.emit("close", e); if (!e.bloqueado) { this.destruida = true; this.emit("closed"); if (ventanas.every(v => v.destruida)) app.emit("window-all-closed"); } return !e.bloqueado; }
    static getAllWindows() { return ventanas.filter(v => !v.destruida); }
  }
  const electron = { app, BrowserWindow: Ventana, dialog: { showMessageBox: async () => ({ response: 0 }) },
    ipcMain: { handle: (k, fn) => handlers.set(k, fn) }, safeStorage: {
      isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s.split("").reverse().join("")), decryptString: b => b.toString().split("").reverse().join(""),
    } };
  vm.runInNewContext(await fs.readFile(principal, "utf8"), {
    require: n => n === "electron" ? electron : requireReal(n), __dirname: path.dirname(principal),
    process: { platform: "win32" }, console, URL, AbortController, AbortSignal,
    setTimeout, clearTimeout, setInterval: fn => { intervalos.push(fn); return intervalos.length; }, clearInterval() {},
    fetch: async () => { if (offline) throw Error("offline"); return { ok: true, json: async () => ({ estado: "activo" }) }; },
  });
  await listo;
  const w = ventanas[0];
  return { dir, w, ventanas, app, webRequest,
    invoke: (nombre, valor, v = w) => handlers.get(nombre)({ sender: v.webContents, senderFrame: v.webContents.mainFrame }, valor),
    tick: () => intervalos.at(-1)(), setEstado: d => { estado = { ...estado, ...d }; }, offline: v => { offline = v; }, quit: () => quit };
}
function evento() { return { bloqueado: false, preventDefault() { this.bloqueado = true; } }; }
test("sin vincular/configurar y vinculado en espera tienen frame nativo y permiten la X", async t => {
  for (const configurada of [false, true]) {
    const e = await ejecutar(t, { configurada });
    assert.equal(e.w.opciones.frame, true); assert.equal(e.w.kiosk, false); assert.equal(e.w.full, false);
    assert.equal(e.w.close(), true); assert.equal(e.quit(), 1);
  }
});
test("autenticación bloquea; navegación, recarga, X y quit no permiten escapar", async t => {
  const e = await ejecutar(t);
  assert.equal((await e.invoke("puesto:iniciar-autenticacion")).ok, true);
  assert.equal(e.w.kiosk, true); assert.equal(e.w.close(), false);
  const tecla = evento(); e.w.webContents.emit("before-input-event", tecla, { type: "keyDown", control: true, key: "r" }); assert.equal(tecla.bloqueado, true);
  const navegar = evento(); e.w.webContents.emit("will-navigate", navegar, "http://127.0.0.1:3000/puesto");
  e.app.quit(); assert.equal(e.quit(), 0); assert.equal(e.w.kiosk, true);
  const otra = evento(); e.w.webContents.emit("will-navigate", otra, "http://otro/puesto"); assert.equal(otra.bloqueado, true);
});
test("la petición de identificar también bloquea antes de enviarse aunque no hubiera aviso React", async t => {
  const e = await ejecutar(t);
  const r = await new Promise(resolve => e.webRequest.antes({ webContentsId: e.w.webContents.id,
    url: "http://127.0.0.1:3000/api/puesto/identificar", method: "POST" }, resolve));
  assert.ok(!r.cancel); assert.equal(e.w.kiosk, true); assert.equal(e.w.closable, false);
});
test("fin solo libera tras comprobante del servidor; desconexión mantiene kiosco", async t => {
  const e = await ejecutar(t); await e.invoke("puesto:iniciar-autenticacion");
  await e.invoke("puesto:registrar-sesion", "token-ficticio");
  assert.equal((await e.invoke("puesto:finalizar-sesion")).ok, false);
  e.offline(true); for (let n = 0; n < 3; n++) await e.tick();
  assert.equal(e.w.kiosk, true); assert.equal(e.w.close(), false);
  e.offline(false); e.setEstado({ estado: "registrada", pendientes: 0 }); await e.tick();
  assert.equal(e.w.kiosk, false); assert.equal(e.w.closable, true); assert.equal(e.w.minimizable, true); assert.equal(e.w.maximizable, true);
});
test("reiniciar con sesión pendiente no habilita la X hasta verificar el servidor", async t => {
  const anterior = await ejecutar(t); await anterior.invoke("puesto:iniciar-autenticacion"); await anterior.invoke("puesto:registrar-sesion", "token-ficticio");
  const e = await ejecutar(t, { dir: anterior.dir });
  assert.equal(e.w.opciones.frame, true); assert.equal(e.w.opciones.kiosk, true); assert.equal(e.w.close(), false);
  e.setEstado({ estado: "registrada", pendientes: 0 }); await e.tick(); assert.equal(e.w.kiosk, false);
});
test("la salida de emergencia conserva la clave; una llamada remota no la suplanta", async t => {
  const e = await ejecutar(t); await e.invoke("puesto:iniciar-autenticacion");
  assert.equal((await e.invoke("puesto:validar-clave", "ClaveFicticiaLocal")).ok, false);
  const tecla = evento(); e.w.webContents.emit("before-input-event", tecla, { type: "keyDown", control: true, shift: true, key: "F10" });
  const modal = e.ventanas.at(-1); assert.notEqual(modal, e.w);
  assert.equal((await e.invoke("puesto:validar-clave", "incorrecta", modal)).ok, false); assert.equal(e.quit(), 0);
  assert.equal((await e.invoke("puesto:validar-clave", "ClaveFicticiaLocal", modal)).ok, true); assert.equal(e.quit(), 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(e.dir, "puesto-sesion-pendiente.json"))).pendiente, true);
});
