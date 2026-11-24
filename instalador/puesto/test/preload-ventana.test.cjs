const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function cargar() {
  const eventos = new Map(), llamadas = [], puentes = {};
  const document = { addEventListener: (k, f) => eventos.set(k, f) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../preload.cjs"), "utf8"), {
    require: () => ({ contextBridge: { exposeInMainWorld: (k, v) => { puentes[k] = v; } },
      ipcRenderer: { invoke: async (k, ...v) => { llamadas.push([k, ...v]); return { ok: true }; } } }),
    document, window: { addEventListener: (_k, fn) => fn() },
  });
  return { eventos, llamadas, puentes };
}
test("preload no activa kiosco al cargar/enfocar: avisa al comenzar a escribir el DNI", () => {
  const e = cargar(); assert.equal(e.llamadas.length, 0);
  e.eventos.get("beforeinput")({ target: { id: "otro" } }); assert.equal(e.llamadas.length, 0);
  e.eventos.get("beforeinput")({ target: { id: "dni" } });
  assert.equal(e.llamadas[0][0], "puesto:iniciar-autenticacion");
  assert.equal(typeof e.puentes.puestoVentana.finalizarSesion, "function");
});
test("Finalizar solo solicita comprobación al cerrar la confirmación de voto registrado", () => {
  const e = cargar(), click = (textContent, isTrusted = true, usaPuente = false) => e.eventos.get("click")({
    isTrusted, target: { closest: () => ({
      textContent, hasAttribute: () => usaPuente, closest: () => ({ querySelector: () => ({ textContent: "Voto registrado" }) }),
    }) },
  });
  click("Finalizar", false); click("Finalizar", true, true); click("Cancelar");
  assert.equal(e.llamadas.length, 0);
  click("Finalizar"); assert.equal(e.llamadas[0][0], "puesto:finalizar-sesion");
});
