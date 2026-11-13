// Integración local: dos contextos Chrome aislados, React construido, Express real
// y PostgreSQL embebido en memoria. Nunca carga .env ni conecta a PostgreSQL instalado.
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
const bcrypt = requireBackend("bcryptjs");
const { migrar } = requireBackend("./database/migrar");
const { createApp } = requireBackend("./app");
const { configurarRed } = requireBackend("./config/red");
const origen = "http://127.0.0.1:4183";
const carpeta = await mkdtemp(path.join(tmpdir(), "municipio-computadoras-"));
const dormir = ms => new Promise(resolve => setTimeout(resolve, ms));
let db, backend, preview, chrome, socket, api, secuencia = 0, errorIntercepcion;
let salidaChrome = "";
let registros = 0;
const pendientes = new Map();
function enviar(sessionId, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++secuencia;
    const timer = setTimeout(() => { pendientes.delete(id); reject(new Error(`Tiempo agotado: ${method}. ${salidaChrome.slice(-1500)}`)); }, 15000);
    pendientes.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluar(sesion, expression) {
  if (errorIntercepcion) throw errorIntercepcion;
  const r = await enviar(sesion, "Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`Falló comprobación DOM: ${expression}`);
  return r.result.value;
}
async function esperar(sesion, expresion) {
  for (let i = 0; i < 160; i++) { if (await evaluar(sesion, expresion)) return; await dormir(75); }
  throw new Error(`No se cumplió: ${expresion}`);
}
const click = (s, texto) => evaluar(s, `Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(texto)})?.click()`);
async function escribir(s, id, valor) {
  await evaluar(s, `(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(valor)});el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`);
}
async function listado(s) { await esperar(s, "Boolean(document.querySelector('.computadoras')) && document.querySelector('.computadoras').getAttribute('aria-busy')==='false'"); }
async function refrescar(s) { await click(s, "Actualizar lista"); await listado(s); }
async function interceptar(s, { requestId, request }) {
  const url = new URL(request.url);
  if (url.protocol === "about:") { await enviar(s, "Fetch.continueRequest", { requestId }); return; }
  if (url.origin === origen && !url.pathname.startsWith("/api/")) {
    await enviar(s, "Fetch.continueRequest", { requestId }); return;
  }
  // Solo estas rutas llegan al backend efímero, incluso si el build contiene otra URL.
  if (!/^\/api\/(auth\/(login|me)|computadoras(?:\/\d+)?)$/.test(url.pathname)) {
    throw new Error(`Solicitud inesperada bloqueada: ${url.pathname}`);
  }
  const headers = { Origin: origen };
  for (const [k, v] of Object.entries(request.headers)) if (["authorization", "content-type", "access-control-request-method", "access-control-request-headers"].includes(k.toLowerCase())) headers[k] = v;
  if (request.method === "POST" && url.pathname === "/api/computadoras") registros++;
  const respuesta = await fetch(api + url.pathname + url.search, { method: request.method, headers, ...(request.postData ? { body: request.postData } : {}) });
  const contenido = await respuesta.text();
  await enviar(s, "Fetch.fulfillRequest", { requestId, responseCode: respuesta.status,
    responseHeaders: [...respuesta.headers].filter(([k]) => ["content-type", "access-control-allow-origin", "access-control-allow-headers", "access-control-allow-methods", "cache-control", "vary"].includes(k)).map(([name, value]) => ({ name, value })),
    body: Buffer.from(contenido).toString("base64"),
  });
}
async function abrirSesion() {
  const contexto = await enviar(null, "Target.createBrowserContext");
  const target = await enviar(null, "Target.createTarget", { url: "about:blank", browserContextId: contexto.browserContextId, newWindow: true });
  const s = (await enviar(null, "Target.attachToTarget", { targetId: target.targetId, flatten: true })).sessionId;
  await enviar(s, "Page.enable");
  await enviar(s, "Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await enviar(s, "Page.navigate", { url: origen });
  await esperar(s, "Boolean(document.querySelector('.bv-opcion-administrador'))");
  assert.equal(await evaluar(s, "sessionStorage.getItem('admin_token')"), null);
  await evaluar(s, "document.querySelector('.bv-opcion-administrador').click()");
  await esperar(s, "Boolean(document.getElementById('usuario'))");
  await escribir(s, "usuario", "admin-prueba"); await escribir(s, "password", "ClaveTemporalComputadoras!");
  await evaluar(s, "document.querySelector('form').requestSubmit()");
  await esperar(s, "document.body.innerText.includes('Administrar computadoras')");
  await evaluar(s, "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Administrar computadoras')).click()");
  await listado(s);
  return s;
}
async function registrar(s, identificador, nombre) {
  await escribir(s, "computadora-identificador", identificador);
  await escribir(s, "computadora-nombre", nombre);
  await escribir(s, "computadora-grado", "3");
  await evaluar(s, "document.querySelector('.computadoras form').requestSubmit()");
  await listado(s);
}
try {
  db = await PGlite.create();
  const pool = { query: (sql, values) => db.query(sql, values), async connect() { return {
    async query(sql, values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values); }, release() {},
  }; } };
  await migrar(pool);
  await db.query("INSERT INTO administradores (usuario, password_hash) VALUES ($1,$2)", ["admin-prueba", bcrypt.hashSync("ClaveTemporalComputadoras!", 4)]);
  backend = createApp({ pool, jwtSecret: "secreto-efimero-computadoras-navegador-no-produccion", red: configurarRed({ CORS_ORIGINS: origen }) }).listen(0, "127.0.0.1");
  await once(backend, "listening"); api = `http://127.0.0.1:${backend.address().port}`;
  preview = spawn(process.execPath, [path.join(raiz, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "4183", "--strictPort"], { cwd: raiz, windowsHide: true, stdio: "ignore" });
  for (let i = 0; ; i++) { try { if ((await fetch(origen)).ok) break; } catch {} if (preview.exitCode !== null || i === 100) throw new Error("No inició preview en 4183"); await dormir(100); }
  chrome = spawn(process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${carpeta}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const ws = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome no inició")), 15000);
    chrome.stderr.on("data", d => { salidaChrome += d; const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(salidaChrome); if (m) { clearTimeout(timer); resolve(m[1]); } });
    chrome.on("error", e => { clearTimeout(timer); reject(e); });
    chrome.on("exit", () => { clearTimeout(timer); reject(new Error("Chrome terminó")); });
  });
  socket = new WebSocket(ws);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const m = JSON.parse(data);
    if (m.id) { const p = pendientes.get(m.id); if (p) { pendientes.delete(m.id); if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result); } }
    else if (m.method === "Fetch.requestPaused") interceptar(m.sessionId, m.params).catch(e => {
      errorIntercepcion = e;
      enviar(m.sessionId, "Fetch.failRequest", { requestId: m.params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
    });
  });
  const a = await abrirSesion(); const b = await abrirSesion();
  await registrar(a, "PC-01", "Equipo aula A");
  await refrescar(b); assert.equal(await evaluar(b, "document.querySelectorAll('[data-equipo]').length"), 1);
  await registrar(a, "PC-02", "Equipo aula B");
  await registrar(a, "pc-01", "Duplicado");
  await esperar(a, "document.querySelector('[role=alert]')?.textContent.includes('ya está registrado')");
  await refrescar(b); assert.equal(await evaluar(b, "document.querySelectorAll('[data-equipo]').length"), 2);
  await evaluar(b, "document.querySelector('[aria-label=\"Editar PC-01\"]').click()");
  assert.equal(await evaluar(b, "document.getElementById('computadora-identificador').readOnly"), true);
  await escribir(b, "computadora-nombre", "Equipo biblioteca"); await escribir(b, "computadora-grado", "5");
  await evaluar(b, "document.querySelector('.computadoras form').requestSubmit()"); await listado(b);
  await refrescar(a);
  assert.ok((await evaluar(a, "document.querySelector('[data-equipo=\"PC-01\"]').innerText")).includes("Equipo biblioteca"));
  assert.ok((await evaluar(a, "document.querySelector('[data-equipo=\"PC-01\"]').innerText")).includes("5.º"));
  await evaluar(a, "document.querySelector('[aria-label=\"Deshabilitar PC-02\"]').click()"); await listado(a);
  await refrescar(b); assert.ok((await evaluar(b, "document.querySelector('[data-equipo=\"PC-02\"]').innerText")).includes("Deshabilitada"));
  await evaluar(b, "document.querySelector('[aria-label=\"Habilitar PC-02\"]').click()"); await listado(b);
  await refrescar(a); assert.ok((await evaluar(a, "document.querySelector('[data-equipo=\"PC-02\"]').innerText")).includes("Habilitada"));
  await escribir(a, "computadora-identificador", "PC-03"); await escribir(a, "computadora-nombre", "Equipo tres");
  const previos = registros;
  await evaluar(a, "document.querySelector('.computadoras form').requestSubmit();document.querySelector('.computadoras form').requestSubmit()"); await listado(a);
  assert.equal(registros - previos, 1);
  await enviar(b, "Page.reload");
  await esperar(b, "Boolean(document.querySelector('.bv-opcion-administrador'))");
  await evaluar(b, "document.querySelector('.bv-opcion-administrador').click()");
  await esperar(b, "document.body.innerText.includes('Administrar computadoras')");
  await evaluar(b, "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Administrar computadoras')).click()"); await listado(b);
  assert.equal(await evaluar(b, "document.querySelectorAll('[data-equipo]').length"), 3);
  assert.equal(await evaluar(b, "localStorage.getItem('computadoraId')"), null);
  await click(a, "Cerrar sesión"); await esperar(a, "Boolean(document.querySelector('.bv-opcion-administrador'))");
  assert.equal(await evaluar(a, "sessionStorage.getItem('admin_token')"), null);
  assert.equal(await evaluar(b, "Boolean(sessionStorage.getItem('admin_token'))"), true);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM computadoras")).rows[0].total, 3);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 0);
  if (errorIntercepcion) throw errorIntercepcion;
  console.log("Etapa 3 aprobada en dos sesiones Chrome aisladas: alta compartida, duplicado, edición, grado, deshabilitar/habilitar, persistencia tras recargar, doble envío y cierre de sesión independiente.");
  console.log("Express real y PGlite efímero; ninguna conexión a PostgreSQL instalado ni modificación de datos reales.");
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  chrome?.kill(); preview?.kill();
  if (backend) await new Promise(resolve => { backend.close(resolve); backend.closeAllConnections(); });
  if (db) await db.close();
}
