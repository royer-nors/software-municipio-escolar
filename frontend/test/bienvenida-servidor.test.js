import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { esInterfazServidor } from "../src/utils/interfaz-servidor.js";

let vite, Bienvenida;
const ventanaOriginal = globalThis.window;
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false }, logLevel: "silent" });
  ({ default: Bienvenida } = await vite.ssrLoadModule("/src/pages/Bienvenida.jsx"));
});
afterEach(() => {
  if (ventanaOriginal === undefined) delete globalThis.window;
  else globalThis.window = ventanaOriginal;
});
after(async () => { await vite?.close(); });
const renderizar = () => renderToStaticMarkup(createElement(Bienvenida, {
  onVotar() {}, onAdministrador() {}, onResultados() {},
}));

test("la web normal conserva estudiante, administrador y resultados con su subtítulo", () => {
  delete globalThis.window;
  const html = renderizar();
  assert.match(html, /Ingresar como estudiante/);
  assert.match(html, /Ingresar como administrador/);
  assert.match(html, /Acceso de consultores autorizados/);
  assert.doesNotMatch(html, /M3 3v18h18/);
});
test("solo la señal del Servidor oculta estudiante y agrega el icono de resultados", () => {
  globalThis.window = { municipioEscritorio: Object.freeze({ interfaz: "servidor" }) };
  const html = renderizar();
  assert.doesNotMatch(html, /bv-opcion-estudiante|Ingresar como estudiante/);
  assert.match(html, /bv-opcion-resultados[^]*?<svg[^]*?M3 3v18h18/);
  assert.match(html, /Ingresar como administrador/);
  assert.match(html, /Resultados/);
  assert.match(html, /Acceso de consultores autorizados/);
});
test("parámetros, User-Agent y almacenamiento no seleccionan el modo Servidor", () => {
  globalThis.window = { location: { search: "?servidor=1&modo=servidor" },
    navigator: { userAgent: "Electron" }, localStorage: { servidor: "true" } };
  assert.equal(esInterfazServidor(), false);
  assert.match(renderizar(), /Ingresar como estudiante/);
  assert.equal(esInterfazServidor({ municipioEscritorio: { interfaz: "puesto" } }), false);
});
