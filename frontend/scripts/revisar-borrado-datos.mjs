// Borrados exclusivamente sobre PostgreSQL embebido en memoria y perfiles nuevos.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { navegadorPuestos } from "./soporte-navegador-puestos.mjs";
const require = createRequire(import.meta.url);
const { iniciarDemo } = require("../../backend/scripts/demo-votacion-puestos.js");
let demo, n;
const claves = ["NODE_ENV", "BORRADO_DATOS_HABILITADO", "BORRADO_DATOS_DB_PRUEBAS"];
const previos = Object.fromEntries(claves.map(k => [k, process.env[k]]));
try {
  process.env.NODE_ENV = "test"; process.env.BORRADO_DATOS_HABILITADO = "true"; process.env.BORRADO_DATOS_DB_PRUEBAS = "postgres";
  demo = await iniciarDemo({ port: 0 });
  await demo.db.exec("UPDATE configuracion_votacion SET votacion_abierta=FALSE; INSERT INTO votos(lista_id) VALUES (10); UPDATE estudiantes SET ya_voto=TRUE WHERE id=1;");
  n = await navegadorPuestos(); const s = await n.abrir(demo.url);
  await n.esperar(s, "Boolean(document.querySelector('.bv-opcion-administrador'))");
  await n.evaluar(s, "document.querySelector('.bv-opcion-administrador').click()");
  await n.esperar(s, "Boolean(document.getElementById('usuario'))");
  await n.escribir(s, "usuario", "admin-demo"); await n.escribir(s, "password", "SoloPruebas2026!");
  await n.evaluar(s, "document.querySelector('form').requestSubmit()");
  await n.esperar(s, "Boolean(document.querySelector('.admin-panel .admin-datos button'))");
  await n.evaluar(s, "document.querySelector('.admin-panel .admin-datos button').click()");
  await n.esperar(s, "Boolean(document.getElementById('borrar-operacion')) && document.body.innerText.includes('Excel identificados')");
  assert.equal(await n.evaluar(s, "Boolean(document.getElementById('borrar-autorizacion'))"), false);
  await n.evaluar(s, "(()=>{const e=document.getElementById('borrar-operacion');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,'reinicio_pruebas');e.dispatchEvent(new Event('change',{bubbles:true}));})()");
  async function simular() {
    await n.click(s, "Simular operación");
    await n.esperar(s, "Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Revisar y confirmar'&&!b.disabled)");
    await n.click(s, "Revisar y confirmar"); await n.esperar(s, "Boolean(document.getElementById('borrar-password'))");
  }
  await simular();
  assert.equal((await demo.db.query("SELECT count(*)::int n FROM votos")).rows[0].n, 1);
  await n.escribir(s, "borrar-password", "Incorrecta!");
  await n.evaluar(s, "document.querySelector('dialog [type=checkbox]').click();document.querySelector('dialog form').requestSubmit()");
  await n.esperar(s, "document.body.innerText.includes('contraseña administrativa es incorrecta')");
  assert.equal((await demo.db.query("SELECT count(*)::int n FROM votos")).rows[0].n, 1);
  await simular(); await n.escribir(s, "borrar-password", "SoloPruebas2026!");
  assert.equal(await n.evaluar(s, "Boolean(document.getElementById('borrar-confirmacion'))"), false);
  await n.evaluar(s, "document.querySelector('dialog [type=checkbox]').click();const f=document.querySelector('dialog form');f.requestSubmit();f.requestSubmit()");
  await n.esperar(s, "document.body.innerText.includes('Operación completada y auditada')");
  for (const tabla of ["estudiantes", "listas", "candidatos", "votos"]) assert.equal((await demo.db.query(`SELECT count(*)::int n FROM ${tabla}`)).rows[0].n, 0);
  assert.equal((await demo.db.query("SELECT count(*)::int n FROM administradores")).rows[0].n, 1);
  assert.equal((await demo.db.query("SELECT count(*)::int n FROM computadoras")).rows[0].n, 2);
  assert.equal((await demo.db.query("SELECT count(*)::int n FROM auditoria_borrado_datos WHERE resultado='ejecutado'")).rows[0].n, 1);
  console.log("Borrar datos aprobado en navegador: build compilado, vista previa, contraseña incorrecta sin borrado, confirmación con contraseña sin códigos externos, doble envío bloqueado, auditoría atómica y conservación de administradores/computadoras. Solo base efímera en memoria.");
} finally {
  n?.cerrar(); if (demo) await demo.cerrar();
  for (const k of claves) { if (previos[k] === undefined) delete process.env[k]; else process.env[k] = previos[k]; }
}
