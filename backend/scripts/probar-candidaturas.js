// Prueba REAL opt-in, limitada a la base de pruebas y backend 3001.
// Deja una lista de integración con sus imágenes. No registra votos.
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const { randomBytes } = require("node:crypto");
const { migrar } = require("../database/migrar");

async function main() {
  if (!process.argv.includes("--confirmar-base-pruebas")) throw new Error("Se requiere --confirmar-base-pruebas. Este comando escribe únicamente datos de integración en db_municipio_escolar_pruebas.");
  const base = "db_municipio_escolar_pruebas", api = "http://127.0.0.1:3001/api";
  const pool = new Pool({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: base });
  let adminId;
  const usuario = "revision-listas-" + Date.now();
  try {
    const destino = (await pool.query("SELECT current_database() AS base")).rows[0].base;
    const remoto = await (await fetch(api + "/database")).json();
    if (destino !== base || remoto.datos?.base_datos !== base) throw new Error("Destino distinto de pruebas. No se permite continuar.");
    const estado = (await pool.query("SELECT votacion_abierta, (SELECT COUNT(*)::int FROM votos) AS votos FROM configuracion_votacion WHERE id=1")).rows[0];
    if (!estado || estado.votacion_abierta || estado.votos) throw new Error("La elección de pruebas debe estar cerrada y sin votos; no se cambiará su estado.");
    console.log("Destino verificado: " + base + " / puerto 3001");
    console.log("Migraciones aplicadas en pruebas: " + JSON.stringify(await migrar(pool)));
    const password = randomBytes(24).toString("base64url");
    adminId = (await pool.query("INSERT INTO administradores(usuario,password_hash) VALUES ($1,$2) RETURNING id", [usuario, await bcrypt.hash(password, 12)])).rows[0].id;
    const login = await fetch(api + "/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, password }) });
    const sesion = await login.json();
    if (!login.ok || !sesion.token) throw new Error("No se pudo autenticar la cuenta temporal de pruebas.");
    const numero = Number((await pool.query("SELECT COALESCE(MAX(numero),0)+1 AS numero FROM listas")).rows[0].numero);
    const nombre = "Lista integración " + Date.now();
    const logo = await sharp({ create: { width: 80, height: 80, channels: 3, background: "#145aa6" } }).png().toBuffer();
    const foto = await sharp({ create: { width: 90, height: 110, channels: 3, background: "#14864c" } }).jpeg().toBuffer();
    const form = new FormData();
    for (const [k,v] of Object.entries({ numeroLista: String(numero), nombreLista: nombre, candidatoAlcalde: "Candidatura de integración", propuesta1: "Propuesta de integración", propuesta2: "" })) form.append(k,v);
    form.append("logo", new Blob([logo], { type: "image/png" }), "logo-prueba.png");
    form.append("foto", new Blob([foto], { type: "image/jpeg" }), "foto-prueba.jpg");
    const respuesta = await fetch(api + "/candidaturas", { method: "POST", headers: { Authorization: "Bearer " + sesion.token }, body: form });
    const datos = await respuesta.json();
    if (respuesta.status !== 201) throw new Error(JSON.stringify(datos));
    const id = datos.lista.id;
    const guardada = (await pool.query("SELECT l.id,l.numero,l.nombre,l.logo_url,c.nombre AS candidato,c.foto_url FROM listas l JOIN candidatos c ON c.lista_id=l.id WHERE l.id=$1", [id])).rows[0];
    if (!guardada?.logo_url || !guardada.foto_url || guardada.logo_url === guardada.foto_url) throw new Error("Referencias incompletas.");
    for (const ruta of [guardada.logo_url, guardada.foto_url]) {
      const r = await fetch("http://127.0.0.1:3001" + ruta);
      if (!r.ok || (await sharp(Buffer.from(await r.arrayBuffer())).metadata()).format !== "webp") throw new Error("No se pudo recuperar una imagen.");
      if (!(await fetch("http://127.0.0.1:3001" + ruta)).ok) throw new Error("La imagen no persiste.");
    }
    const resultados = await (await fetch(api + "/resultados", { headers: { Authorization: "Bearer " + sesion.token } })).json();
    const lista = resultados.listas?.find(l => l.id === id);
    if (!lista?.logoUrl || !lista.candidatos?.[0]?.fotoUrl || lista.votos !== 0) throw new Error("Resultados sin metadatos o votos inconsistentes.");
    console.log("Lista y candidato persistidos: " + JSON.stringify(guardada));
    console.log("Imágenes WebP recuperadas y resultados verificados. Cero votos registrados.");
  } finally {
    if (adminId) await pool.query("DELETE FROM administradores WHERE id=$1 AND usuario=$2", [adminId, usuario]);
    await pool.end();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
