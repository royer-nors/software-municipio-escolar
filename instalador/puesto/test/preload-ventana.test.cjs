const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
function cargar() {
  const eventos = new Map(), llamadas = [], puentes = {};
  let titulos = [];
  const document = { addEventListener: (k, f) => eventos.set(k, f), querySelectorAll: () => titulos };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../preload.cjs"), "utf8"), {
    require: () => ({ contextBridge: { exposeInMainWorld: (k, v) => { puentes[k] = v; } },
      ipcRenderer: { invoke: async (k, ...v) => { llamadas.push([k, ...v]); return { ok: true }; } } }),
    document, window: { addEventListener: (_k, fn) => fn() },
  });
  return { eventos, llamadas, puentes, titulos: v => { titulos = v.map(textContent => ({ textContent })); } };
}
test("preload no activa kiosco al cargar/enfocar: avisa al comenzar a escribir el DNI", () => {
  const e = cargar(); assert.equal(e.llamadas.length, 0);
  e.eventos.get("beforeinput")({ target: { id: "otro" } }); assert.equal(e.llamadas.length, 0);
  e.eventos.get("beforeinput")({ target: { id: "dni" } });
  assert.equal(e.llamadas[0][0], "puesto:iniciar-autenticacion");
  assert.equal(e.puentes.puestoVentana.finalizarSesion, undefined);
});
test("Finalizar solo solicita comprobación al cerrar la confirmación de voto registrado", () => {
  const e = cargar(), click = textContent => e.eventos.get("click")({ target: { closest: () => ({ textContent }) } });
  click("Finalizar"); assert.equal(e.llamadas.length, 0);
  e.titulos(["Voto registrado"]); click("Cancelar"); assert.equal(e.llamadas.length, 0);
  click("Finalizar"); assert.equal(e.llamadas[0][0], "puesto:finalizar-sesion");
});
