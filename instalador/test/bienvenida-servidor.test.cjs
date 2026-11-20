const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { conectarInterfazServidor } = require("../servidor/interfaz-bienvenida.cjs");
function escenario() {
  let listener; const principal = { frames: [] };
  const v = { isDestroyed: () => false, webContents: { mainFrame: principal, on(evento, fn) { assert.equal(evento, "did-frame-finish-load"); listener = fn; } } };
  conectarInterfazServidor(v); return { principal, notificar: main => listener({}, main) };
}
test("solo el iframe local directo del Servidor recibe la senal visual sin Node", async () => {
  const e = escenario(); const contexto = { window: { dispatchEvent() {} }, Event: class Event {} };
  const iframe = { parent: e.principal, url: "http://localhost:3000", async executeJavaScript(codigo) { vm.runInNewContext(codigo, contexto); } };
  e.principal.frames.push(iframe); await e.notificar(false);
  assert.equal(contexto.window.municipioEscritorio.interfaz, "servidor");
  assert.equal(Object.getOwnPropertyDescriptor(contexto.window, "municipioEscritorio").writable, false);
  assert.deepEqual(Object.keys(contexto.window.municipioEscritorio), ["interfaz"]);
});
test("no se identifica la web normal, otro origen ni marcos ajenos", async () => {
  const e = escenario(); let llamadas = 0;
  for (const url of ["http://localhost:5173", "http://192.168.1.40:3000", "https://localhost:3000"]) e.principal.frames.push({ parent: e.principal, url, executeJavaScript() { llamadas++; } });
  e.principal.frames.push({ parent: {}, url: "http://localhost:3000", executeJavaScript() { llamadas++; } });
  await e.notificar(false); await e.notificar(true); assert.equal(llamadas, 0);
});
