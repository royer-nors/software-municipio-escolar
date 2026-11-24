const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { EventEmitter, once } = require("node:events");
const { createServer } = require("node:http");
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
  let listo, quit = 0, offline = opciones.offline ?? false, abierta = false;
  let estado = { estado: "activa", referencia: "a".repeat(64), pendientes: 1 };
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
    setMenu() {} show() {} focus() {} restore() { this.minimized = false; } isMinimized() { return !!this.minimized; }
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
    fetch: async (url, config) => {
      if (offline) throw Error("offline");
      if (url.endsWith("/api/votacion/configuracion") && !opciones.fetchEleccion) {
        return { ok: true, json: async () => ({ votacionAbierta: abierta }) };
      }
      return opciones.fetch ? opciones.fetch(url, config) : { ok: true, json: async () => ({ estado: "activo", votacionAbierta: abierta }) };
    },
  });
  await listo;
  const w = ventanas[0];
  const instancia = { dir, w, ventanas, app, webRequest,
    invoke: (nombre, valor, v = w) => handlers.get(nombre)({ sender: v.webContents, senderFrame: v.webContents.mainFrame }, valor),
    tick: () => intervalos.at(-1)(), tickEleccion: () => intervalos.at(-2)(), setEleccion: v => { abierta = v; },
    setEstado: d => { estado = { ...estado, ...d }; }, offline: v => { offline = v; }, quit: () => quit };
  if (opciones.abrirPuesto) {
    assert.equal((await instancia.invoke("puesto:comprobar-servidor", { servidorUrl: "127.0.0.1:3000" })).ok, true);
    assert.equal((await instancia.invoke("puesto:continuar")).ok, true);
  }
  return instancia;
}
function evento() { return { bloqueado: false, preventDefault() { this.bloqueado = true; } }; }

test("formulario real del renderer verifica HTTP antes de mostrar éxito y exige Continuar", { timeout: 15000 }, async t => {
  const solicitudes = [];
  let responder;
  let recibir;
  const servidor = createServer((req, res) => {
    solicitudes.push([req.method, req.url]);
    responder = (status, estado) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify({ estado }));
    recibir?.();
  });
  servidor.listen(0, "127.0.0.1");
  await once(servidor, "listening");
  t.after(() => { servidor.close(); servidor.closeAllConnections(); });
  const origen = `http://127.0.0.1:${servidor.address().port}`;
  const e = await ejecutar(t, { configurada: false, fetch });
  const elementos = new Map();
  const elemento = id => {
    if (!elementos.has(id)) elementos.set(id, {
      hidden: id === "continuar", value: "", textContent: "", focus() {}, reportValidity: () => true,
      addEventListener(tipo, fn) { this[tipo] = fn; },
    });
    return elementos.get(id);
  };
  vm.runInNewContext(await fs.readFile(path.join(path.dirname(principal), "renderer.cjs"), "utf8"), {
    document: { getElementById: elemento },
    window: { puestoApp: {
      obtenerEstado: () => e.invoke("puesto:estado"),
      comprobarServidor: datos => e.invoke("puesto:comprobar-servidor", datos),
      continuar: () => e.invoke("puesto:continuar"),
    } },
  });
  assert.equal((await e.invoke("puesto:continuar")).ok, false);
  elemento("servidor-url").value = origen + "/ruta-invalida";
  const enviar = () => elemento("formulario-servidor").submit(evento());
  await enviar();
  assert.equal(solicitudes.length, 0);
  assert.match(elemento("mensaje").textContent, /Escribe solo/);

  elemento("servidor-url").value = origen;
  for (const [status, estado] of [[503, "activo"], [200, "desconocido"], [200, "activo"]]) {
    const recibida = new Promise(resolve => { recibir = resolve; });
    const respuesta = enviar();
    assert.equal(elemento("estado").textContent, "Conectando al Servidor...");
    assert.equal(elemento("continuar").hidden, true);
    await recibida;
    responder(status, estado);
    await respuesta;
    if (status !== 200 || estado !== "activo") {
      assert.match(elemento("mensaje").textContent, /No se pudo conectar/);
      assert.equal(elemento("continuar").hidden, true);
      assert.equal(elemento("servidor-url").readOnly, false);
    }
  }
  assert.deepEqual(solicitudes, Array.from({ length: 3 }, () => ["GET", "/api/estado"]));
  assert.equal(elemento("estado").textContent, "¡Conexión exitosa con el Servidor!");
  assert.equal(elemento("continuar").hidden, false);
  assert.match(e.w.webContents.mainFrame.url, /configuracion\.html$/);
  await assert.rejects(fs.access(path.join(e.dir, "puesto-config.json")), { code: "ENOENT" });
  await elemento("continuar").click();
  assert.equal(e.w.webContents.mainFrame.url, origen + "/puesto");
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(e.dir, "puesto-config.json"))), { servidorUrl: origen });

  const reiniciado = await ejecutar(t, { dir: e.dir, fetch });
  assert.equal((await reiniciado.invoke("puesto:estado")).servidorUrl, origen);
  assert.match(reiniciado.w.webContents.mainFrame.url, /configuracion\.html$/);
  assert.equal(solicitudes.length, 3);
});

test("cambiar la IP no abre un diálogo y conserva la clave de salida anterior", async t => {
  const e = await ejecutar(t);
  const archivo = path.join(e.dir, "puesto-config.json");
  const previa = JSON.parse(await fs.readFile(archivo));
  assert.equal((await e.invoke("puesto:comprobar-servidor", { servidorUrl: "192.168.1.20" })).ok, true);
  assert.deepEqual(JSON.parse(await fs.readFile(archivo)), previa);
  assert.equal((await e.invoke("puesto:continuar")).ok, true);
  assert.equal(e.ventanas.length, 1);
  assert.equal(e.w.webContents.mainFrame.url, "http://192.168.1.20:3000/puesto");
  assert.deepEqual(JSON.parse(await fs.readFile(archivo)), { ...previa, servidorUrl: "http://192.168.1.20:3000" });
});

test("un estado pendiente ilegible impide editar o guardar la dirección", async t => {
  const anterior = await ejecutar(t);
  const archivo = path.join(anterior.dir, "puesto-config.json");
  const previa = await fs.readFile(archivo, "utf8");
  await fs.writeFile(path.join(anterior.dir, "puesto-sesion-pendiente.json"), "{");
  const e = await ejecutar(t, { dir: anterior.dir });
  assert.equal(e.w.kiosk, true);
  e.offline(true);
  for (let n = 0; n < 3; n++) await e.tick();
  assert.equal((await e.invoke("puesto:estado")).vista, "sin-conexion");
  await e.invoke("puesto:editar-direccion");
  assert.equal((await e.invoke("puesto:estado")).vista, "sin-conexion");
  assert.equal((await e.invoke("puesto:comprobar-servidor", { servidorUrl: "192.168.1.20" })).ok, false);
  assert.equal((await e.invoke("puesto:continuar")).ok, false);
  assert.equal(await fs.readFile(archivo, "utf8"), previa);
});

test("reconecta tras una caída y respeta el formulario si se elige cambiar de dirección", async t => {
  const e = await ejecutar(t, { abrirPuesto: true });
  const desconectar = async () => {
    e.offline(true);
    for (let n = 0; n < 3; n++) await e.tick();
    assert.equal((await e.invoke("puesto:estado")).vista, "sin-conexion");
  };
  await desconectar();
  e.offline(false);
  await e.tick();
  assert.equal(e.w.webContents.mainFrame.url, "http://127.0.0.1:3000/puesto");
  await desconectar();
  await e.invoke("puesto:editar-direccion");
  e.offline(false);
  await e.tick();
  assert.equal((await e.invoke("puesto:estado")).vista, "configuracion");
  assert.equal((await e.invoke("puesto:continuar")).ok, false);
});
test("sin vincular/configurar y vinculado en espera tienen frame nativo y permiten la X", async t => {
  for (const configurada of [false, true]) {
    const e = await ejecutar(t, { configurada });
    assert.equal(e.w.opciones.frame, true); assert.equal(e.w.kiosk, false); assert.equal(e.w.full, false);
    assert.equal(e.w.close(), true); assert.equal(e.quit(), 1);
  }
});
test("autenticación bloquea; navegación, recarga, X y quit no permiten escapar", async t => {
  const e = await ejecutar(t, { abrirPuesto: true });
  const iniciar = e.invoke("puesto:iniciar-autenticacion");
  assert.equal(e.w.close(), false);
  assert.equal((await iniciar).ok, true);
  assert.equal(e.w.kiosk, true); assert.equal(e.w.close(), false);
  const tecla = evento(); e.w.webContents.emit("before-input-event", tecla, { type: "keyDown", control: true, key: "r" }); assert.equal(tecla.bloqueado, true);
  const altF4 = evento(); e.w.webContents.emit("before-input-event", altF4, { type: "keyDown", alt: true, key: "F4" });
  assert.equal(altF4.bloqueado, true);
  e.w.minimized = true; e.w.emit("minimize"); assert.equal(e.w.isMinimized(), false);
  e.w.full = false; e.w.emit("leave-full-screen"); assert.equal(e.w.full, true);
  e.w.webContents.emit("before-input-event", evento(), { type: "keyDown", control: true, shift: true, key: "F12" });
  assert.match(e.w.webContents.mainFrame.url, /\/puesto$/);
  const navegar = evento(); e.w.webContents.emit("will-navigate", navegar, "http://127.0.0.1:3000/puesto");
  e.app.quit(); assert.equal(e.quit(), 0); assert.equal(e.w.kiosk, true);
  const otra = evento(); e.w.webContents.emit("will-navigate", otra, "http://otro/puesto"); assert.equal(otra.bloqueado, true);
});
test("la elección abierta protege antes del DNI y el cierre solo libera sin sesión", async t => {
  const e = await ejecutar(t, { abrirPuesto: true });
  assert.equal(e.w.kiosk, false);
  const titulo = evento(); e.w.emit("page-title-updated", titulo, "frontend");
  assert.equal(titulo.bloqueado, true);
  e.setEleccion(true);
  await e.tickEleccion();
  assert.equal(e.w.kiosk, true);
  assert.equal(e.w.close(), false);
  const altF4 = evento(); e.w.webContents.emit("before-input-event", altF4, { type: "keyDown", alt: true, key: "F4" });
  assert.equal(altF4.bloqueado, true);
  e.offline(true);
  await e.tickEleccion();
  assert.equal(e.w.close(), false);
  e.offline(false);
  e.setEleccion(false);
  await e.tickEleccion();
  assert.equal(e.w.kiosk, false);
  e.setEleccion(true);
  assert.equal((await e.invoke("puesto:confirmar-eleccion-abierta")).ok, true);
  await e.invoke("puesto:iniciar-autenticacion");
  await e.invoke("puesto:registrar-sesion", "token-ficticio");
  e.setEleccion(false);
  await e.tickEleccion();
  assert.equal(e.w.close(), false);
  e.setEstado({ estado: "registrada", pendientes: 0 });
  assert.equal((await e.invoke("puesto:finalizar-sesion")).ok, true);
  assert.equal(e.w.kiosk, false);
});

test("la petición de identificar también bloquea antes de enviarse aunque no hubiera aviso React", async t => {
  const e = await ejecutar(t, { abrirPuesto: true });
  const r = await new Promise(resolve => e.webRequest.antes({ webContentsId: e.w.webContents.id,
    url: "http://127.0.0.1:3000/api/puesto/identificar", method: "POST" }, resolve));
  assert.ok(!r.cancel); assert.equal(e.w.kiosk, true); assert.equal(e.w.closable, false);
});
test("fin solo libera tras comprobante del servidor; desconexión mantiene kiosco", async t => {
  const e = await ejecutar(t, { abrirPuesto: true }); await e.invoke("puesto:iniciar-autenticacion");
  await e.invoke("puesto:registrar-sesion", "token-ficticio");
  assert.equal((await e.invoke("puesto:finalizar-sesion")).ok, false);
  e.offline(true); for (let n = 0; n < 3; n++) await e.tick();
  assert.equal(e.w.kiosk, true); assert.equal(e.w.close(), false);
  assert.equal((await e.invoke("puesto:estado")).pendiente, true);
  await e.invoke("puesto:editar-direccion");
  assert.equal((await e.invoke("puesto:estado")).vista, "sin-conexion");
  assert.equal((await e.invoke("puesto:comprobar-servidor", { servidorUrl: "192.168.1.20" })).ok, false);
  e.offline(false); e.setEstado({ estado: "registrada", pendientes: 0 }); await e.tick();
  assert.equal(e.w.kiosk, true);
  assert.equal((await e.invoke("puesto:estado")).vista, "finalizar-sesion");
  assert.equal((await e.invoke("puesto:finalizar-sesion")).ok, true);
  assert.equal(e.w.kiosk, false); assert.equal(e.w.closable, true); assert.equal(e.w.minimizable, true); assert.equal(e.w.maximizable, true);
});
test("reiniciar con sesión pendiente no habilita la X hasta verificar el servidor", async t => {
  const anterior = await ejecutar(t, { abrirPuesto: true }); await anterior.invoke("puesto:iniciar-autenticacion"); await anterior.invoke("puesto:registrar-sesion", "token-ficticio");
  const e = await ejecutar(t, { dir: anterior.dir });
  assert.equal(e.w.opciones.frame, true); assert.equal(e.w.opciones.kiosk, true); assert.equal(e.w.close(), false);
  e.setEstado({ estado: "registrada", pendientes: 0 }); await e.tick(); assert.equal(e.w.kiosk, true);
  assert.equal((await e.invoke("puesto:finalizar-sesion")).ok, true);
  assert.equal(e.w.kiosk, false);
});

test("una finalización explícita sobrevive a una caída de red y al reinicio", async t => {
  const anterior = await ejecutar(t, { abrirPuesto: true });
  await anterior.invoke("puesto:iniciar-autenticacion");
  await anterior.invoke("puesto:registrar-sesion", "token-ficticio");
  anterior.offline(true);
  assert.equal((await anterior.invoke("puesto:finalizar-sesion")).ok, false);
  assert.equal(anterior.w.close(), false);
  const e = await ejecutar(t, { dir: anterior.dir, offline: true });
  assert.equal(e.w.kiosk, true);
  e.setEstado({ estado: "registrada", pendientes: 0 });
  e.offline(false);
  await e.tick();
  assert.equal(e.w.kiosk, false);
  assert.equal(e.w.close(), true);
});
test("la salida de emergencia conserva la clave; una llamada remota no la suplanta", async t => {
  const e = await ejecutar(t, { abrirPuesto: true }); await e.invoke("puesto:iniciar-autenticacion");
  assert.equal((await e.invoke("puesto:validar-clave", "ClaveFicticiaLocal")).ok, false);
  const tecla = evento(); e.w.webContents.emit("before-input-event", tecla, { type: "keyDown", control: true, shift: true, key: "F10" });
  const modal = e.ventanas.at(-1); assert.notEqual(modal, e.w);
  assert.equal((await e.invoke("puesto:validar-clave", "incorrecta", modal)).ok, false); assert.equal(e.quit(), 0);
  assert.equal((await e.invoke("puesto:validar-clave", "ClaveFicticiaLocal", modal)).ok, true); assert.equal(e.quit(), 1);
  assert.equal(JSON.parse(await fs.readFile(path.join(e.dir, "puesto-sesion-pendiente.json"))).pendiente, true);
});
