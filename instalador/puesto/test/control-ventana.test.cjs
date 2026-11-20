const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { EventEmitter } = require("node:events");
const { ControlVentanaPuesto } = require("../control-ventana.cjs");
function ventanaFicticia() {
  return Object.assign(new EventEmitter(), {
    kiosk: false, fullscreen: false, closable: true, minimizable: true, maximizable: true,
    isDestroyed: () => false, getNormalBounds: () => ({ x: 10, y: 20, width: 1200, height: 800 }), isMaximized: () => false,
    setKiosk(v) { this.kiosk = v; }, setFullScreen(v) { this.fullscreen = v; },
    setClosable(v) { this.closable = v; }, setMinimizable(v) { this.minimizable = v; }, setMaximizable(v) { this.maximizable = v; },
    setBounds(v) { this.bounds = v; }, maximize() {}, restore() {},
  });
}
async function entorno(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "sme-control-ventana-"));
  t.after(async () => { assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir()) + path.sep)); await fs.rm(dir, { recursive: true, force: true }); });
  let respuesta = { estado: "activa", referencia: "a".repeat(64), pendientes: 1 }, falla = false, recargas = 0;
  const args = { archivo: path.join(dir, "pendiente.json"), safeStorage: {
    isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s.split("").reverse().join("")), decryptString: b => b.toString().split("").reverse().join(""),
  }, consultar: async () => { if (falla) throw Error("Sin conexión"); return respuesta; }, reiniciarVista: async () => { recargas++; } };
  const c = new ControlVentanaPuesto(args), w = ventanaFicticia(); await c.cargar(); c.conectar(w);
  return { c, w, args, dir, responder(d) { respuesta = { ...respuesta, ...d }; }, desconectar() { falla = true; }, reconectar() { falla = false; }, recargas: () => recargas };
}
test("espera/vinculación comienza normal; iniciar autenticación persiste y bloquea", async t => {
  const { c, w, args } = await entorno(t);
  assert.equal(c.pendiente, false); assert.equal(w.closable, true);
  await c.iniciar("http://192.168.1.40:3000");
  assert.equal(w.kiosk, true); assert.equal(w.fullscreen, true); assert.equal(w.closable, false);
  assert.equal(w.minimizable, false); assert.equal(w.maximizable, false);
  assert.equal(JSON.parse(await fs.readFile(args.archivo)).pendiente, true);
});
test("identificación y selección permanecen bloqueadas; Finalizar no basta sin comprobación del servidor", async t => {
  const { c, w } = await entorno(t); const origen = "http://192.168.1.40:3000";
  await c.iniciar(origen); await c.registrar("jwt-ficticio-en-memoria", origen);
  assert.equal((await c.resolver(origen, true)).ok, false); assert.equal(w.kiosk, true);
  w.fullscreen = false; w.emit("leave-full-screen"); assert.equal(w.fullscreen, true);
});
test("voto registrado y ninguna sesión pendiente retira el DOM y restaura botones/bounds", async t => {
  const e = await entorno(t), origen = "http://192.168.1.40:3000";
  await e.c.iniciar(origen); await e.c.registrar("jwt-ficticio", origen);
  e.responder({ estado: "registrada", pendientes: 0 });
  assert.equal((await e.c.resolver(origen, true)).ok, true);
  assert.equal(e.recargas(), 1); assert.equal(e.w.kiosk, false); assert.equal(e.w.fullscreen, false);
  assert.equal(e.w.closable, true); assert.equal(e.w.minimizable, true); assert.equal(e.w.maximizable, true);
  assert.equal(e.w.bounds.width, 1200);
  await assert.rejects(fs.access(e.args.archivo));
});
test("recarga, navegación y desconexión no desbloquean; restablecer solo /api/estado tampoco", async t => {
  const e = await entorno(t), origen = "http://192.168.1.40:3000";
  await e.c.iniciar(origen); await e.c.registrar("jwt-ficticio", origen);
  e.c.marcarIncierto(); e.desconectar(); assert.equal((await e.c.resolver(origen)).ok, false);
  assert.equal(e.w.closable, false); e.reconectar(); assert.equal((await e.c.resolver(origen)).ok, false);
  assert.equal(e.w.kiosk, true);
});
test("reinicio recupera bloqueo y token cifrado; solo vuelve a normal tras verificar", async t => {
  const e = await entorno(t), origen = "http://192.168.1.40:3000";
  await e.c.iniciar(origen); await e.c.registrar("jwt-ficticio-no-plano", origen);
  assert.ok(!(await fs.readFile(e.args.archivo, "utf8")).includes("jwt-ficticio-no-plano"));
  const nuevo = new ControlVentanaPuesto(e.args), w = ventanaFicticia(); await nuevo.cargar(); nuevo.conectar(w);
  assert.equal(w.kiosk, true); assert.equal(w.closable, false);
  assert.equal((await nuevo.resolver(origen)).ok, false);
  e.responder({ estado: "registrada", pendientes: 0 }); assert.equal((await nuevo.resolver(origen)).ok, true);
  assert.equal(w.closable, true);
});
test("estado ilegible, servidor distinto, otra identidad o token no confirmado no permiten salida", async t => {
  const e = await entorno(t), origen = "http://192.168.1.40:3000";
  await fs.writeFile(e.args.archivo, "invalido");
  const ilegible = new ControlVentanaPuesto(e.args); await ilegible.cargar(); assert.equal(ilegible.pendiente, true);
  await e.c.iniciar(origen); await e.c.registrar("jwt-ficticio", origen);
  assert.equal((await e.c.resolver("http://otro:3000", true)).ok, false);
  e.responder({ referencia: "b".repeat(64) }); await assert.rejects(e.c.registrar("otro-token", origen));
  e.responder({ estado: "registrada", pendientes: 0 }); assert.equal((await e.c.resolver(origen, true)).ok, false);
});
test("una sesión vencida confirmada sin pendientes puede volver a espera; otros pendientes impiden hacerlo", async t => {
  const e = await entorno(t), origen = "http://192.168.1.40:3000";
  await e.c.iniciar(origen); await e.c.registrar("jwt-ficticio", origen);
  e.responder({ estado: "vencida", pendientes: 1 }); assert.equal((await e.c.resolver(origen, true)).ok, false);
  e.responder({ pendientes: 0 }); assert.equal((await e.c.resolver(origen, true)).ok, true);
});
test("un fallo de persistencia cancela también los siguientes intentos de autenticación", async t => {
  const e = await entorno(t);
  e.c.guardar = async () => { throw Error("Disco no disponible"); };
  await assert.rejects(e.c.iniciar("http://localhost:3000"));
  await assert.rejects(e.c.iniciar("http://localhost:3000"));
  assert.equal(e.w.kiosk, true); assert.equal(e.w.closable, false);
});
