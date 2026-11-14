// Tres perfiles aislados (administrador y dos puestos), cookies reales y Express.
// Compila /api relativo en un directorio temporal y nunca lee .env del backend.
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { once } from "node:events";
import assert from "node:assert/strict";
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireBackend = createRequire(path.join(raiz, "../backend/package.json"));
const { PGlite } = requireBackend("@electric-sql/pglite");
const express = requireBackend("express");
const bcrypt = requireBackend("bcryptjs");
const { migrar } = requireBackend("./database/migrar");
const { createApp } = requireBackend("./app");
const carpeta = await mkdtemp(path.join(tmpdir(), "municipio-vinculacion-"));
let db, server, chrome, socket, secuencia = 0, salidaChrome = "";
const pendientes = new Map();
const dormir = ms => new Promise(resolve => setTimeout(resolve, ms));
function enviar(sessionId, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++secuencia;
    const timer = setTimeout(() => { pendientes.delete(id); reject(new Error(`Tiempo agotado: ${method}. ${salidaChrome.slice(-1200)}`)); }, 15000);
    pendientes.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluar(s, expression) {
  const r = await enviar(s, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("Error en comprobación del navegador");
  return r.result.value;
}
async function esperar(s, expression) {
  for (let n = 0; n < 150; n++) { if (await evaluar(s, expression)) return; await dormir(80); }
  throw new Error("No se cumplió: " + expression);
}
async function escribir(s, id, texto) {
  await evaluar(s, `(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(texto)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
}
const click = (s, texto) => evaluar(s, `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(texto)})?.click()`);
const listado = s => esperar(s, "document.querySelector('.computadoras')?.getAttribute('aria-busy')==='false'");
async function codigo(s, identificador) {
  await evaluar(s, `document.querySelector('[aria-label="Autorizar ${identificador}"]').click()`);
  await esperar(s, "Boolean(document.querySelector('dialog textarea'))");
  const valor = await evaluar(s, "document.querySelector('dialog textarea').value");
  await click(s, "Cerrar y ocultar código"); await listado(s);
  return valor;
}
async function vincular(s, valor) {
  await esperar(s, "Boolean(document.getElementById('puesto-codigo')) && document.querySelector('.puesto').getAttribute('aria-busy')==='false'");
  await escribir(s, "puesto-codigo", valor);
  await evaluar(s, "document.querySelector('form').requestSubmit()");
  await esperar(s, "document.querySelector('.puesto').getAttribute('aria-busy')==='false'");
}
try {
  const build = spawn(process.execPath, [path.join(raiz, "node_modules/vite/bin/vite.js"), "build", "--outDir", path.join(carpeta, "dist")], { cwd: raiz, env: { ...process.env, VITE_API_URL: "/api" }, windowsHide: true, stdio: "ignore" });
  assert.equal((await once(build, "exit"))[0], 0, "Debe compilar el frontend temporal");
  db = await PGlite.create(); let turno = Promise.resolve();
  const pool = { query: (sql, values) => db.query(sql, values), async connect() {
    const anterior = turno; let liberar; turno = new Promise(resolve => { liberar = resolve; }); await anterior;
    return { async query(sql, values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values); }, release() { liberar(); } };
  } };
  await migrar(pool);
  await db.query("INSERT INTO administradores (usuario,password_hash) VALUES ($1,$2)", ["admin-fixture", bcrypt.hashSync("ClaveTemporalPuestos!", 4)]);
  await db.query("INSERT INTO computadoras (identificador,nombre,grado) VALUES ('PC-01','Aula A',3),('PC-02','Aula B',3)");
  const red = { origenes: [], permitirOrigenNull: false };
  const app = createApp({ pool, jwtSecret: "secreto-aislado-navegador-puestos-no-produccion", puesto: { secure: false }, red });
  app.use(express.static(path.join(carpeta, "dist")));
  app.get("/puesto", (req, res) => res.sendFile(path.join(carpeta, "dist/index.html")));
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const origen = `http://127.0.0.1:${server.address().port}`; red.origenes.push(origen);
  chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${path.join(carpeta, "perfil")}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const ws = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome no inició")), 15000);
    chrome.stderr.on("data", d => { salidaChrome += d; const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(salidaChrome); if (m) { clearTimeout(timer); resolve(m[1]); } });
    chrome.on("error", e => { clearTimeout(timer); reject(e); });
  });
  socket = new WebSocket(ws); await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) { const p = pendientes.get(m.id); if (p) { pendientes.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
    else if (m.method === "Page.javascriptDialogOpening") enviar(m.sessionId, "Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
  });
  async function abrir(ruta) {
    const contexto = await enviar(null, "Target.createBrowserContext");
    const target = await enviar(null, "Target.createTarget", { url: "about:blank", browserContextId: contexto.browserContextId, newWindow: true });
    const s = (await enviar(null, "Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
    await enviar(s, "Page.enable"); await enviar(s, "Page.navigate", { url: origen + ruta }); return s;
  }
  const admin = await abrir("/");
  await esperar(admin, "Boolean(document.querySelector('.bv-opcion-administrador'))");
  await evaluar(admin, "document.querySelector('.bv-opcion-administrador').click()");
  await esperar(admin, "Boolean(document.getElementById('usuario'))");
  await escribir(admin, "usuario", "admin-fixture"); await escribir(admin, "password", "ClaveTemporalPuestos!");
  await evaluar(admin, "document.querySelector('form').requestSubmit()");
  await esperar(admin, "document.body.innerText.includes('Administrar computadoras')");
  await evaluar(admin, "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Administrar computadoras')).click()"); await listado(admin);
  const a = await abrir("/puesto"), b = await abrir("/puesto");
  const primero = await codigo(admin, "PC-01");
  await vincular(a, primero); await esperar(a, "Boolean(document.querySelector('[aria-label=\"Puesto vinculado\"]'))");
  await vincular(b, primero); await esperar(b, "document.querySelector('[role=alert]')?.textContent.includes('utilizada')");
  await evaluar(admin, "document.querySelector('[aria-label=\"Revocar PC-01\"]').click()"); await listado(admin);
  await click(a, "Consultar estado"); await esperar(a, "document.body.innerText.includes('Revocada')");
  await vincular(b, await codigo(admin, "PC-01")); await esperar(b, "Boolean(document.querySelector('[aria-label=\"Puesto vinculado\"]'))");
  await vincular(a, await codigo(admin, "PC-02")); await esperar(a, "document.body.innerText.includes('PC-02')");
  for (const s of [a, b]) {
    assert.equal(await evaluar(s, "document.cookie.includes('sme_puesto')"), false);
    assert.equal(await evaluar(s, "localStorage.length"), 0);
    assert.equal(await evaluar(s, "sessionStorage.getItem('admin_token')"), null);
    assert.equal(await evaluar(s, "document.body.innerText.includes('Panel administrativo')"), false);
  }
  await enviar(b, "Page.reload"); await esperar(b, "Boolean(document.querySelector('[aria-label=\"Puesto vinculado\"]'))");
  await evaluar(admin, "document.querySelector('[aria-label=\"Revocar PC-02\"]').click()"); await listado(admin);
  await click(a, "Consultar estado"); await esperar(a, "document.body.innerText.includes('Revocada')");
  await click(b, "Consultar estado"); await esperar(b, "Boolean(document.querySelector('[aria-label=\"Puesto vinculado\"]'))");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM votos")).rows[0].n, 0);
  console.log("Etapa 4 aprobada: administrador y dos puestos aislados; cookie HttpOnly real, canje/reutilización, revocación, nueva vinculación, dos equipos por grado y persistencia tras recargar. Sin JWT administrativo en puestos ni cambios electorales.");
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  chrome?.kill();
  if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  if (db) await db.close();
}
