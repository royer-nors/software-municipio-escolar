import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { navegadorPuestos } from "./soporte-navegador-puestos.mjs";
const require = createRequire(import.meta.url);
const { iniciarDemo } = require("../../backend/scripts/demo-votacion-puestos.js");
let demo, n;
try {
  demo = await iniciarDemo({ port: 0 }); n = await navegadorPuestos();
  const admin = await n.abrir(demo.url), a = await n.abrir(demo.url + "/puesto"), b = await n.abrir(demo.url + "/puesto");
  await n.esperar(admin, "Boolean(document.querySelector('.bv-opcion-administrador'))");
  await n.evaluar(admin, "document.querySelector('.bv-opcion-administrador').click()");
  await n.esperar(admin, "Boolean(document.getElementById('usuario'))");
  await n.escribir(admin, "usuario", "admin-demo"); await n.escribir(admin, "password", "SoloPruebas2026!");
  await n.evaluar(admin, "document.querySelector('form').requestSubmit()");
  await n.esperar(admin, "document.body.innerText.includes('Administrar computadoras')");
  await n.evaluar(admin, "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Administrar computadoras')).click()");
  const listo = () => n.esperar(admin, "document.querySelector('.computadoras')?.getAttribute('aria-busy')==='false'");
  async function vincular(s, pc) {
    await listo(); await n.evaluar(admin, `document.querySelector('[aria-label="Autorizar ${pc}"]').click()`);
    await n.esperar(admin, "Boolean(document.querySelector('dialog textarea'))");
    const codigo = await n.evaluar(admin, "document.querySelector('dialog textarea').value");
    await n.click(admin, "Cerrar y ocultar código");
    await n.esperar(s, "Boolean(document.getElementById('puesto-codigo')) && document.querySelector('.puesto').getAttribute('aria-busy')==='false'");
    await n.escribir(s, "puesto-codigo", codigo); await n.evaluar(s, "document.querySelector('form').requestSubmit()");
    await n.esperar(s, "Boolean(document.getElementById('dni'))");
  }
  await vincular(a, "PC-01"); await vincular(b, "PC-02");
  for (const s of [a, b]) {
    assert.equal(await n.evaluar(s, "document.cookie.includes('sme_puesto')"), false);
    assert.equal(await n.evaluar(s, "localStorage.length + sessionStorage.length"), 0);
    assert.equal(await n.evaluar(s, "document.body.innerText.includes('Panel administrativo')"), false);
  }
  await n.escribir(b, "dni", "33333333"); await n.evaluar(b, "document.querySelector('form').requestSubmit()");
  await n.esperar(b, "document.body.innerText.includes('Tu grado no corresponde')");
  async function identificar(s, dni) {
    await n.escribir(s, "dni", dni); await n.evaluar(s, "document.querySelector('form').requestSubmit()");
    await n.esperar(s, "Boolean(document.querySelector('.electoral-papeleta')) && !document.querySelector('.electoral-papeleta').disabled");
  }
  await identificar(a, "01234567"); await identificar(b, "12345678");
  await n.evaluar(a, "document.querySelector('[aria-label=\"Lista A\"]').click()");
  await n.evaluar(b, "document.querySelector('[value=blanco]').click()");
  await n.click(a, "Votar →"); await n.click(b, "Votar →");
  await n.esperar(a, "document.querySelector('dialog')?.textContent.includes('Confirmar voto')");
  assert.equal((await demo.db.query("SELECT count(*)::int AS n FROM votos")).rows[0].n, 0, "La confirmación debe preceder al voto");
  await Promise.all([n.click(a, "Confirmar voto"), n.click(b, "Confirmar voto")]);
  for (const s of [a, b]) {
    await n.esperar(s, "document.querySelector('dialog')?.textContent.includes('Tu voto se registró correctamente')");
    const texto = await n.evaluar(s, "document.body.innerText");
    assert.ok(!texto.includes("Ana Demo") && !texto.includes("Bruno Demo") && !texto.includes("Lista A") && !texto.includes("Lista B"));
    assert.equal(await n.evaluar(s, "document.querySelectorAll('[name=opcion-electoral]').length"), 0);
    await n.click(s, "Finalizar"); await n.esperar(s, "Boolean(document.getElementById('dni'))");
    assert.equal(await n.evaluar(s, "document.getElementById('dni').value"), "");
  }
  assert.equal((await demo.db.query("SELECT count(*)::int AS n FROM votos")).rows[0].n, 2);
  assert.equal((await demo.db.query("SELECT count(*)::int AS n FROM votos WHERE lista_id IS NULL")).rows[0].n, 1);
  // Entrada al historial y regreso: nunca debe restaurar la papeleta ya finalizada.
  await n.enviar(a, "Page.navigate", { url: demo.url + "/" });
  await n.esperar(a, "Boolean(document.querySelector('.bv-opcion-administrador'))");
  await n.evaluar(a, "history.back()"); await n.esperar(a, "Boolean(document.getElementById('dni'))");
  assert.equal(await n.evaluar(a, "document.getElementById('dni').value"), "");
  await n.escribir(a, "dni", "01234567"); await n.evaluar(a, "document.querySelector('form').requestSubmit()");
  await n.esperar(a, "document.body.innerText.includes('ya emitió su voto')");
  await n.evaluar(a, "document.querySelector('dialog button').click()");
  await identificar(a, "44444444");
  await n.enviar(a, "Page.navigate", { url: demo.url + "/" });
  await n.esperar(a, "Boolean(document.querySelector('.bv-opcion-administrador'))");
  await n.evaluar(a, "history.back()"); await n.esperar(a, "Boolean(document.getElementById('dni'))");
  assert.equal(await n.evaluar(a, "document.getElementById('dni').value"), "");
  assert.equal(await n.evaluar(a, "document.body.innerText.includes('Diego Demo')"), false);
  // Revocar un puesto no altera el otro ni los votos ya registrados.
  await listo(); await n.evaluar(admin, "document.querySelector('[aria-label=\"Revocar PC-02\"]').click()"); await listo();
  await n.click(b, "Consultar estado"); await n.esperar(b, "document.body.innerText.includes('Revocada')");
  assert.equal((await demo.db.query("SELECT count(*)::int AS n FROM votos")).rows[0].n, 2);
  console.log("Etapa 5 aprobada: administrador y dos puestos aislados, grado incorrecto, papeletas y confirmación, lista y blanco simultáneos, limpieza de identidad/selección, botón Atrás, doble voto y revocación. Solo base en memoria.");
} finally { n?.cerrar(); if (demo) await demo.cerrar(); }
