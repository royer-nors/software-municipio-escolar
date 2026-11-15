import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let servidor;
let Resultados;
before(async () => {
  servidor = await createServer({
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, hmr: false },
    logLevel: "silent",
  });
  ({ default: Resultados } = await servidor.ssrLoadModule("/src/pages/Resultados.jsx"));
});
after(async () => { await servidor?.close(); });

test("el consultor ve el reporte sin menú administrativo ni acceso de regreso al panel", () => {
  const html = renderToStaticMarkup(createElement(Resultados, {
    consultor: true, onSalir() {},
  }));
  assert.match(html, /Resultados de la elección/);
  assert.match(html, /Salir/);
  assert.doesNotMatch(html, /Cuenta de|Seguridad|Consultores de resultados|Volver al panel/);
});

test("el administrador conserva su navegación y la gestión de consultores al integrar las ramas", () => {
  const html = renderToStaticMarkup(createElement(Resultados, {
    token: "sesion-solo-de-prueba", usuario: "Admin",
    onVolver() {}, onSeguridad() {}, onConsultores() {}, onSalir() {},
  }));
  assert.match(html, /Volver al panel/);
  assert.match(html, /Cuenta de Admin/);
  assert.match(html, /aria-label="Seguridad"/);
  assert.match(html, /aria-label="Consultores de resultados"/);
  assert.match(html, /aria-label="Cerrar sesión"/);
  assert.doesNotMatch(html, /sesion-solo-de-prueba/);
});
