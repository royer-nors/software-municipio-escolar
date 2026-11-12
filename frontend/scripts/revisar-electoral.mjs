// Revisión de navegador aislada: intercepta TODAS las solicitudes externas.
// No inicia el backend ni permite conexiones a PostgreSQL/API real.
// Requiere Chrome/Edge instalado; no descarga paquetes ni navegadores.
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const carpeta = await mkdtemp(path.join(tmpdir(), "municipio-electoral-revision-"));
const chrome = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const servidor = spawn(process.execPath, [path.join(raiz, "node_modules/vite/bin/vite.js"), "preview", "--host", "127.0.0.1", "--port", "4179", "--strictPort"], { cwd: raiz, windowsHide: true, stdio: "ignore" });
let navegador, socket;
const pendientes = new Map();
const handlers = new Map();
let secuencia = 0, sesion;
const origen = "http://127.0.0.1:4179";
const sharp = createRequire(path.join(raiz, "../backend/package.json"))("sharp");
const pngPrueba = await readFile(path.join(raiz, "public/logoo.png"));
const imagenPrueba = await sharp(pngPrueba).webp().toBuffer();
const logoPrueba = "/api/archivos/logo-prueba.webp";
const fotoPrueba = "/api/archivos/foto-prueba.webp";
const candidaturas = [];
const dormir = ms => new Promise(resolve => setTimeout(resolve, ms));
const votos = [];
const importaciones = [];
const altas = [];
let modoImportacion = "normal";
let modoVoto = "normal", modoResultados = "normal";
let configuracion = { votacionAbierta: true, votoBlancoHabilitado: true };
const listas = [
  { id: 17, nombre: "Juntos por un mejor futuro", candidatos: [{ id: 1, nombre: "Candidatura A" }, { id: 2, nombre: "Candidatura B" }] },
  { id: 31, nombre: "Unidos por el cambio", candidatos: [{ id: 3, nombre: "Candidatura C" }, { id: 4, nombre: "Candidatura D" }] },
  { id: 45, nombre: "Ideas que transforman", candidatos: [{ id: 5, nombre: "Candidatura E" }] },
  { id: 66, nombre: "La fuerza de todos", candidatos: [{ id: 6, nombre: "Candidatura F" }] },
];
listas.forEach((l, i) => { l.numero = i + 1; l.logoUrl = logoPrueba; l.candidatos.forEach((c, j) => { c.fotoUrl = fotoPrueba; if (!j) c.cargo = "Alcalde escolar"; }); });
function reporte() {
  return { generadoEn: "2026-11-10T14:30:00Z",
    resumen: { estudiantesHabilitados: 1200, votosEmitidos: 1000, votosValidos: 1000, votosEnBlanco: 0, votosNulos: 0, noVotaron: 200, participacion: 83.3 },
    listas: listas.map((l, i) => ({ id: l.id, numero: l.numero, nombre: l.nombre, logoUrl: l.logoUrl, candidatos: l.candidatos, votos: [501, 328, 104, 67][i], porcentaje: [50.1, 32.8, 10.4, 6.7][i], posicion: i + 1 })),
  };
}
function enviar(method, params = {}, sessionId = sesion) {
  return new Promise((resolve, reject) => {
    const id = ++secuencia;
    const timer = setTimeout(() => { pendientes.delete(id); reject(new Error("Timeout CDP: " + method)); }, 15000);
    pendientes.set(id, { resolve: r => { clearTimeout(timer); resolve(r); }, reject: e => { clearTimeout(timer); reject(e); } });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
async function evaluar(expression) {
  const r = await enviar("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function esperar(expression) {
  for (let i = 0; i < 160; i++) { if (await evaluar(expression)) return; await dormir(50); }
  throw new Error("No se cumplió: " + expression);
}
const click = texto => evaluar(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(texto)})?.click()`);
async function escribir(selector, texto) {
  await evaluar(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  await enviar("Input.insertText", { text: texto });
}
async function captura(nombre) {
  const r = await enviar("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  await writeFile(path.join(carpeta, nombre + ".png"), Buffer.from(r.data, "base64"));
}
async function inicio() {
  await enviar("Page.navigate", { url: origen });
  await esperar("Boolean(document.querySelector('.bv-opcion-estudiante')) || document.body.innerText.includes('¡Bienvenido!')");
}
async function identificar() {
  await inicio();
  await evaluar("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Ingresar como estudiante') || b.textContent.includes('Identificación y voto')).click()");
  await esperar("Boolean(document.querySelector('#dni'))");
  await escribir("#dni", "01234567");
  await evaluar("document.querySelector('form').requestSubmit()");
  await esperar("document.body.innerText.includes('VOTANTE IDENTIFICADO')");
}
async function papeleta() {
  await identificar();
  await click("Votar →");
  await esperar("Boolean(document.querySelector('input[value=\"17\"]'))");
}

try {
  await readFile(path.join(raiz, "dist/index.html")); // Solo revisa el build existente.
  for (let i = 0; ; i++) {
    try { if ((await fetch(origen)).ok) break; } catch {}
    if (i === 100) throw new Error("No inició el servidor de preview");
    await dormir(100);
  }
  navegador = spawn(chrome, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", "--user-data-dir=" + path.join(carpeta, "perfil"), "about:blank"],
    { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let logs = "";
    const timer = setTimeout(() => reject(new Error("No inició Chrome headless")), 15000);
    navegador.on("error", reject);
    navegador.stderr.on("data", data => {
      logs += data.toString();
      const match = logs.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", event => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const p = pendientes.get(msg.id); if (!p) return;
      pendientes.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
    } else {
      const handler = handlers.get(msg.method);
      if (handler) handler(msg.params).catch(e => { console.error(e); process.exitCode = 1; });
    }
  });
  const { targetId } = await enviar("Target.createTarget", { url: "about:blank" });
  sesion = (await enviar("Target.attachToTarget", { targetId, flatten: true })).sessionId;
  handlers.set("Fetch.requestPaused", async ({ requestId, request }) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/archivos/")) {
      await enviar("Fetch.fulfillRequest", { requestId, responseCode: url.pathname.includes('inexistente') ? 404 : 200,
        responseHeaders: [{ name: "Content-Type", value: "image/webp" }, { name: "Access-Control-Allow-Origin", value: "*" }],
        body: url.pathname.includes('inexistente') ? "" : imagenPrueba.toString("base64") }); return;
    }
    if (url.origin === origen && !url.pathname.startsWith("/api/")) {
      await enviar("Fetch.continueRequest", { requestId }); return;
    }
    if (request.method === "OPTIONS") {
      await enviar("Fetch.fulfillRequest", { requestId, responseCode: 204, responseHeaders: [
        { name: "Access-Control-Allow-Origin", value: "*" },
        { name: "Access-Control-Allow-Headers", value: "authorization,content-type" },
        { name: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
      ] }); return;
    }
    const contentType = Object.entries(request.headers).find(([name]) => name.toLowerCase() === "content-type")?.[1] || "";
    const body = request.postData && contentType.includes("application/json") ? JSON.parse(request.postData) : {};
    let status = 200, datos;
    if (url.pathname.endsWith("/auth/me")) datos = { administrador: { id: 1, usuario: "revision-aislada" } };
    else if (url.pathname.endsWith("/auth/login")) datos = { token: "admin-aislado", administrador: { id: 1, usuario: "revision-aislada" } };
    else if (url.pathname.endsWith("/auth/estudiante")) {
      if (body.dni === "11111111") { status = 409; datos = { mensaje: "El estudiante ya emitió su voto." }; }
      else datos = { token: "estudiante-aislado", habilitadoParaVotar: true, estudiante: { id: 1, dni: body.dni, nombre: "Estudiante de revisión aislada" } };
    }
    else if (url.pathname.endsWith("/candidaturas")) {
      candidaturas.push(request);
      datos = { lista: { id: 88, numero: 7, nombre: "Lista desde formulario", logo_url: logoPrueba, candidatos: [{ id: 99, nombre: "Candidata desde formulario", foto_url: fotoPrueba }] } };
      status = 201;
    }
    else if (url.pathname.endsWith("/padron/importar")) {
      importaciones.push({ contentType, authorization: Object.entries(request.headers).find(([name]) => name.toLowerCase() === "authorization")?.[1] });
      await dormir(250);
      if (modoImportacion === "errores") { status = 422; datos = { mensaje: "El padrón contiene errores. No se importó ninguna fila.", errores: [{ fila: 2, campo: "dni", mensaje: "El DNI está repetido en el archivo." }] }; }
      else if (modoImportacion === "bloqueado") { status = 409; datos = { mensaje: "No se puede reemplazar el padrón después de que haya comenzado la votación." }; }
      else if (modoImportacion === "sesion") { status = 401; datos = { mensaje: "La sesión fue invalidada." }; }
      else datos = { mensaje: "Padrón reemplazado correctamente.", total: 2, reemplazados: 1 };
    }
    else if (url.pathname.endsWith("/estudiantes") && request.method === "POST") { altas.push(body); status = 201; datos = { estudiante: { id: 7, ...body, activo: true, ya_voto: false } }; }
    else if (url.pathname.endsWith("/votacion/configuracion")) datos = configuracion;
    else if (url.pathname.endsWith("/listas")) datos = { listas };
    else if (url.pathname.endsWith("/votos")) {
      votos.push(body);
      if (modoVoto === "incierto") { await enviar("Fetch.failRequest", { requestId, errorReason: "ConnectionClosed" }); return; }
      status = modoVoto === "duplicado" ? 409 : 201;
      datos = modoVoto === "duplicado" ? { mensaje: "El estudiante ya emitió su voto." } : { sesionFinalizada: true };
    }
    else if (url.pathname.endsWith("/resultados")) {
      datos = reporte();
      if (modoResultados === "empate") {
        datos.listas = datos.listas.map((l, i) => ({ ...l, votos: [400, 400, 100, 100][i], porcentaje: [40, 40, 10, 10][i], posicion: [1, 1, 3, 3][i] }));
      }
      if (modoResultados === "vacio") {
        datos.resumen = { estudiantesHabilitados: 1200, votosEmitidos: 0, votosValidos: 0, votosEnBlanco: 0, votosNulos: 0, noVotaron: 1200, participacion: 0 };
        datos.listas = datos.listas.map(l => ({ ...l, votos: 0, porcentaje: 0, posicion: null }));
      }
      if (modoResultados === "invalido") datos = { estudiantesHabilitados: 1200, listas: [] };
      if (modoResultados === "imagen-rota") datos.listas[0].logoUrl = "/api/archivos/inexistente.webp";
    }
    else { await enviar("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }); return; }
    await enviar("Fetch.fulfillRequest", { requestId, responseCode: status,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }, { name: "Access-Control-Allow-Origin", value: "*" }],
      body: Buffer.from(JSON.stringify(datos)).toString("base64") });
  });
  await enviar("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await enviar("Page.enable");
  await enviar("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  await inicio();
  await evaluar("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Ingresar como estudiante') || b.textContent.includes('Identificación y voto')).click()");
  await esperar("Boolean(document.querySelector('#dni'))");
  await captura("01-autenticacion");
  assert.equal(await evaluar("document.querySelectorAll('.marco').length"), 1);
  assert.equal(await evaluar("document.querySelector('.marco-logo').naturalWidth > 0"), true);
  await escribir("#dni", "11111111");
  await evaluar("document.querySelector('form').requestSubmit()");
  await esperar("document.querySelector('dialog')?.innerText.includes('ya emitió')");
  await click("Aceptar");

  await identificar();
  await captura("02-identificado");
  assert.equal(await evaluar("document.body.innerText.includes('Grado:')"), false);
  await click("Votar →");
  await esperar("Boolean(document.querySelector('input[value=\"17\"]'))");
  await evaluar("document.querySelector('input[value=\"17\"]').click()");
  await captura("03-papeleta");
  await click("Votar →");
  await esperar("document.querySelector('dialog')?.innerText.includes('Confirmar voto')");
  assert.equal(votos.length, 0);
  await captura("04-confirmacion");
  await evaluar("const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Confirmar voto');b.click();b.click()");
  await esperar("document.querySelector('dialog')?.innerText.includes('Tu voto se registró correctamente.')");
  assert.deepEqual(votos, [{ listaId: 17 }]);
  await captura("05-voto-registrado");
  await click("Finalizar");
  await esperar("Boolean(document.querySelector('#dni'))");

  // Una restricción que cambia después de abrir el modal tampoco debe escribir.
  await papeleta();
  assert.equal(await evaluar("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Votar →').disabled"), true);
  await evaluar("document.querySelector('input[value=\"17\"]').click()");
  await click("Votar →");
  configuracion = { votacionAbierta: false, votoBlancoHabilitado: true };
  await click("Confirmar voto");
  await esperar("document.body.innerText.includes('La votación está cerrada.') && !document.querySelector('dialog')");
  assert.equal(votos.length, 1);

  configuracion = { votacionAbierta: true, votoBlancoHabilitado: true };
  await papeleta();
  await evaluar("document.querySelector('input[value=\"blanco\"]').click()");
  await click("Votar →");
  configuracion = { votacionAbierta: true, votoBlancoHabilitado: false };
  await click("Confirmar voto");
  await esperar("!document.querySelector('dialog') && !document.querySelector('.btn-blanco')");
  assert.equal(votos.length, 1);

  configuracion = { votacionAbierta: false, votoBlancoHabilitado: false };
  await papeleta();
  assert.equal(await evaluar("document.querySelector('.btn-blanco') === null"), true);
  assert.equal(await evaluar("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Votar →').disabled"), true);
  await captura("06-eleccion-cerrada");

  configuracion = { votacionAbierta: true, votoBlancoHabilitado: true };
  modoVoto = "incierto";
  await papeleta();
  await evaluar("document.querySelector('input[value=\"17\"]').click()");
  await click("Votar →");
  await click("Confirmar voto");
  await esperar("document.querySelector('dialog')?.innerText.includes('No se pudo confirmar')");
  assert.equal(votos.length, 2);
  assert.equal(await evaluar("document.body.innerText.includes('Tu voto se registró correctamente.')"), false);
  await captura("07-respuesta-incierta");
  await click("Volver a identificarme");
  await esperar("Boolean(document.querySelector('#dni'))");

  modoVoto = "duplicado";
  await papeleta();
  await evaluar("document.querySelector('input[value=\"17\"]').click()");
  await click("Votar →"); await click("Confirmar voto");
  await esperar("document.querySelector('dialog')?.innerText.includes('ya emitió')");
  await click("Aceptar");

  await inicio();
  assert.equal(await evaluar("document.querySelectorAll('.marco').length"), 1);
  assert.equal(await evaluar("document.querySelector('.marco-etiqueta-cabecera')?.textContent"), "MUNICIPIO ESCOLAR · VOTACIÓN DIGITAL");
  await evaluar("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Ingresar como administrador') || b.textContent.includes('Consultar los resultados')).click()");
  await esperar("Boolean(document.querySelector('#usuario'))");
  await escribir("#usuario", "revision-aislada"); await escribir("#password", "ClaveSoloDePrueba");
  await evaluar("document.querySelector('form').requestSubmit()");
  await esperar("document.body.innerText.includes('Configurar Sistema de Votación') || document.querySelectorAll('.electoral-resultado').length === 4");
  if (await evaluar("document.body.innerText.includes('Configurar Sistema de Votación')")) {
    await evaluar("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Gestionar estudiantes')).click()");
    await esperar("document.body.innerText.includes('Registrar Nuevo Votante')");
    await escribir('input[name="dni"]', "01234567");
    await escribir('input[name="nombres"]', "Ana");
    await escribir('input[name="apellidos"]', "Torres");
    await evaluar("document.querySelector('.gestion-padron form').requestSubmit()");
    await esperar("document.querySelector('.gestion-padron .padron-exito')?.textContent.includes('registrado correctamente')");
    assert.deepEqual(altas, [{ dni: "01234567", nombre: "Ana Torres", grado: "3°", seccion: "A" }]);
    // Archivo de transporte aislado: la API está interceptada; no se importa en PostgreSQL.
    await evaluar("(() => { const dt = new DataTransfer(); dt.items.add(new File(['prueba de transporte'], 'padron.xlsx')); const input = document.querySelector('#padron-archivo'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await esperar("document.querySelector('.padron-archivo-nombre')?.textContent === 'padron.xlsx'");
    await click("Importar estudiantes");
    await esperar("document.querySelector('dialog')?.textContent.includes('Se reemplazarán todos')");
    assert.equal(importaciones.length, 0);
    await click("Cancelar");
    assert.equal(importaciones.length, 0);
    await click("Importar estudiantes");
    await evaluar("const btn=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Confirmar importación'); btn.click(); btn.click()");
    await esperar("document.querySelector('dialog')?.textContent.includes('Importando…')");
    await esperar("document.querySelector('.padron-importacion .padron-exito')?.textContent.includes('2 estudiantes importados')");
    assert.equal(importaciones.length, 1);
    assert.ok(importaciones[0].contentType.includes('multipart/form-data; boundary='));
    assert.equal(importaciones[0].authorization, 'Bearer admin-aislado');
    await captura("10-importacion-excel");
    for (const modo of ["errores", "bloqueado", "sesion"]) {
      modoImportacion = modo;
      await evaluar("(() => { const dt = new DataTransfer(); dt.items.add(new File(['prueba de transporte'], 'padron.xlsx')); const input = document.querySelector('#padron-archivo'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()");
      await click("Importar estudiantes"); await click("Confirmar importación");
      await esperar("!document.querySelector('dialog') && Boolean(document.querySelector('.padron-importacion .padron-error'))");
      assert.equal(await evaluar("document.querySelector('.padron-importacion .padron-exito') === null"), true);
      if (modo === "errores") assert.equal(await evaluar("document.querySelector('.padron-errores')?.textContent.includes('El DNI está repetido')"), true);
      if (modo === "bloqueado") assert.equal(await evaluar("document.querySelector('.padron-error')?.textContent.includes('comenzado la votación')"), true);
    }
    await click("Volver");
    await evaluar("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Agregar candidatos')).click()");
    await esperar("document.body.innerText.includes('Registrar Lista de Candidatos')");
    await escribir('input[name="numeroLista"]', "7");
    await escribir('input[name="nombreLista"]', "Lista desde formulario");
    await escribir('input[name="candidatoAlcalde"]', "Candidata desde formulario");
    await evaluar(`(() => { const raw = Uint8Array.from(atob('${pngPrueba.toString('base64')}'), c => c.charCodeAt(0));
      document.querySelectorAll('.candidatura-imagen-campo input').forEach((input,i) => { const dt = new DataTransfer(); dt.items.add(new File([raw], i ? 'foto.png' : 'logo.png', {type:'image/png'})); input.files = dt.files; input.dispatchEvent(new Event('change', {bubbles:true})); }); })()`);
    await esperar("document.querySelectorAll('.candidatura-vista-previa').length === 2");
    await captura("11-candidaturas-vistas-previas");
    await evaluar("document.querySelector('.candidatura-formulario form').requestSubmit()");
    await esperar("Boolean(document.querySelector('.candidatura-exito'))");
    assert.equal(candidaturas.length, 1);
    await esperar("Array.from(document.querySelectorAll('.candidatura-exito img')).every(img=>img.complete && img.naturalWidth>0)");
    await click("Volver");
    await click("Ver resultados");
  }
  await esperar("document.querySelectorAll('.electoral-resultado').length === 4");
  assert.equal(await evaluar("document.querySelectorAll('.marco').length"), 1);
  assert.equal(await evaluar("sessionStorage.getItem('admin_token')"), "admin-aislado");
  assert.ok((await evaluar("document.querySelector('.electoral-resumen').innerText")).includes("200"));
  await captura("08-resultados");
  await evaluar("window.print=()=>{window.__impreso=true}");
  await click("Imprimir resultados");
  await esperar("window.__impreso === true");
  assert.equal(await evaluar("Array.from(document.querySelectorAll('.electoral-ranking img')).every(img=>img.complete && img.naturalWidth>0)"), true);
  const pdf = await enviar("Page.printToPDF", { printBackground: true, landscape: true, preferCSSPageSize: true });
  const bytesPdf = Buffer.from(pdf.data, "base64");
  assert.ok(bytesPdf.includes(Buffer.from("/Subtype /Image")));
  await writeFile(path.join(carpeta, "resultados-A4.pdf"), bytesPdf);
  await enviar("Emulation.setEmulatedMedia", { media: "print" });
  assert.equal(await evaluar("Array.from(document.querySelectorAll('button')).every(b=>b.getClientRects().length===0)"), true);
  await captura("12-reporte-impresion");
  await enviar("Emulation.setEmulatedMedia", { media: "" });
  modoResultados = "imagen-rota"; await click("Actualizar");
  await esperar("document.querySelector('.imagen-electoral-fallo') !== null");
  await evaluar("window.__impreso=false");
  await click("Imprimir resultados");
  await esperar("Boolean(document.querySelector('.electoral-error-impresion'))");
  assert.equal(await evaluar("window.__impreso"), false);
  modoResultados = "empate"; await click("Actualizar");
  await esperar("Array.from(document.querySelectorAll('.electoral-resultado-cabecera strong')).map(x=>x.textContent).join(',')==='1.º lugar,1.º lugar,3.º lugar,3.º lugar'");
  modoResultados = "vacio"; await click("Actualizar");
  await esperar("document.querySelectorAll('.electoral-resultado').length===4 && document.querySelector('.electoral-resultado').innerText.includes('Sin posición')");
  modoResultados = "normal"; await click("Actualizar");
  await esperar("document.querySelector('.electoral-resultado-cifras strong')?.innerText.includes('50')");
  await enviar("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.ok(await evaluar("document.documentElement.scrollWidth <= window.innerWidth"));
  await captura("09-resultados-movil");
  modoResultados = "invalido"; await click("Actualizar");
  await esperar("document.body.innerText.includes('resultados incompletos')");
  assert.equal(await evaluar("document.querySelectorAll('.electoral-resultado').length"), 0);
  console.log("Revisión de navegador aprobada: navegación, ID, doble clic, restricciones, respuesta incierta, empates, impresión y móvil.");
  console.log("Capturas: " + carpeta);
  console.log("API externa interceptada; ninguna escritura ni conexión al backend real.");
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  navegador?.kill();
  servidor.kill();
}
