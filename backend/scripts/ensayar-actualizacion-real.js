// Ensayo explícito del respaldo histórico. Nunca migra una base preexistente.
const assert = require("node:assert/strict");
const path = require("node:path");
const { readFile, stat } = require("node:fs/promises");
const { createHash, randomUUID, randomBytes } = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { Pool } = require("pg");
const jwt = require("jsonwebtoken");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE } = require("../config/auth");
require("dotenv").config({ path: path.join(__dirname, "../.env"), quiet: true });
const respaldo = "C:/Users/usuario/Documents/RespaldosMunicipioEscolar/municipio_real_antes_migraciones.backup";
const restore = "C:/Program Files/PostgreSQL/18/bin/pg_restore.exe";
const protegidas = ["db_municipio_escolar", "db_municipio_escolar_pruebas"];
const negocio = ["administradores", "estudiantes", "listas", "candidatos", "votos"];
const conexion = { host: "localhost", port: 5432, user: process.env.DB_USER, password: process.env.DB_PASSWORD, connectionTimeoutMillis: 5000 };
const temporal = "municipio_ensayo_" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "_" + randomUUID().replaceAll("-", "").slice(0, 16);
const sha = texto => createHash("sha256").update(texto).digest("hex");
const ident = nombre => '"' + nombre.replaceAll('"', '""') + '"';
let control, temporalPool, appPool, server, creada = false, oid, resultado = { temporal };
async function huellasBase(nombre) {
  assert.ok(protegidas.includes(nombre));
  const p = new Pool({ ...conexion, database: nombre, options: "-c default_transaction_read_only=on" });
  const c = await p.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal((await c.query("SELECT current_database() nombre")).rows[0].nombre, nombre);
    const tablas = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const datos = [];
    for (const { tablename } of tablas) {
      const r = (await c.query(`SELECT to_jsonb(t)::text dato FROM public.${ident(tablename)} t ORDER BY to_jsonb(t)::text`)).rows;
      datos.push({ tabla: tablename, cantidad: r.length, huella: sha(JSON.stringify(r)) });
    }
    const columnas = (await c.query("SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
    const restricciones = (await c.query("SELECT conrelid::regclass::text tabla,conname,pg_get_constraintdef(oid) definicion FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2")).rows;
    const secuencias = (await c.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
    const funciones = (await c.query("SELECT p.oid::regprocedure::text nombre,pg_get_functiondef(p.oid) definicion FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' ORDER BY 1")).rows;
    await c.query("COMMIT");
    return { datos, columnas, restricciones, secuencias, funciones };
  } finally { c.release(); await p.end(); }
}
async function columnasYDatos(pool, columnasPrevias) {
  const r = {};
  for (const tabla of negocio) {
    const columnas = columnasPrevias?.[tabla]?.columnas || (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [tabla])).rows.map(c => c.column_name);
    const filas = (await pool.query(`SELECT ${columnas.map(ident).join(",")} FROM public.${ident(tabla)} ORDER BY id`)).rows;
    r[tabla] = { columnas, cantidad: filas.length, huella: sha(JSON.stringify(filas)) };
  }
  return r;
}
async function ejecutarRestore() {
  const p = spawn(restore, ["--host", conexion.host, "--port", String(conexion.port), "--username", conexion.user,
    "--dbname", temporal, "--no-owner", "--no-privileges", "--no-password", "--exit-on-error", "--single-transaction", respaldo],
  { windowsHide: true, env: { ...process.env, PGPASSWORD: conexion.password, PGOPTIONS: "-c statement_timeout=60000" }, stdio: ["ignore", "ignore", "pipe"] });
  let errores = ""; p.stderr.on("data", d => { errores += d; });
  const [codigo] = await once(p, "exit");
  if (codigo !== 0) throw new Error("Falló pg_restore sobre la copia temporal: " + errores.replaceAll(conexion.password || "\0", "[oculto]"));
}
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--crear-temporal") throw new Error("Requiere autorización explícita y --crear-temporal. Crea y elimina únicamente una base nueva de ensayo.");
  assert.match(temporal, /^municipio_ensayo_\d{8}_[a-f0-9]{16}$/); assert.ok(!protegidas.includes(temporal));
  assert.ok(conexion.user && typeof conexion.password === "string", "Faltan credenciales locales; no se cambiarán.");
  const archivo = await stat(respaldo); assert.ok(archivo.isFile() && archivo.size > 0);
  const backupHash = sha(await readFile(respaldo));
  const antes = {};
  for (const nombre of protegidas) antes[nombre] = await huellasBase(nombre);
  const realRead = new Pool({ ...conexion, database: protegidas[0], options: "-c default_transaction_read_only=on" });
  let original;
  try {
    original = await columnasYDatos(realRead);
    const versiones = (await realRead.query("SELECT version,checksum FROM public.esquema_migraciones ORDER BY version")).rows;
    assert.deepEqual(versiones.map(v => v.version.slice(0, 3)), ["001", "002", "003"]);
  } finally { await realRead.end(); }
  assert.deepEqual(Object.fromEntries(negocio.map(t => [t, original[t].cantidad])), { administradores: 2, estudiantes: 3, listas: 1, candidatos: 0, votos: 1 });
  control = new Pool({ ...conexion, database: "postgres" });
  assert.equal((await control.query("SELECT current_database() nombre")).rows[0].nombre, "postgres");
  assert.equal((await control.query("SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1) existe", [temporal])).rows[0].existe, false);
  try {
    await control.query(`CREATE DATABASE ${ident(temporal)} TEMPLATE template0`); creada = true;
    oid = (await control.query("SELECT oid FROM pg_database WHERE datname=$1", [temporal])).rows[0].oid;
    console.log("Base temporal nueva:", temporal);
    await ejecutarRestore();
    temporalPool = new Pool({ ...conexion, database: temporal });
    assert.equal((await temporalPool.query("SELECT current_database() nombre")).rows[0].nombre, temporal);
    const restaurado = await columnasYDatos(temporalPool, original);
    assert.deepEqual(restaurado, original, "El respaldo debe coincidir exactamente con los registros actuales de la base real");
    resultado.respaldo = { bytes: archivo.size, sha256: backupHash, restauradoCoincideConOriginal: true };
    const historicas = (await temporalPool.query("SELECT version FROM public.esquema_migraciones ORDER BY version")).rows;
    assert.deepEqual(historicas.map(v => v.version.slice(0, 3)), ["001", "002", "003"]);
    resultado.migracionesAplicadas = await migrar(temporalPool);
    assert.deepEqual(resultado.migracionesAplicadas.map(n => n.slice(0, 3)), ["004", "005", "006", "007", "008", "009", "010", "011", "012", "013"]);
    assert.deepEqual(await migrar(temporalPool), []);
    assert.deepEqual(await columnasYDatos(temporalPool, original), original, "La actualización conserva exactamente las columnas y valores históricos");
    resultado.conteosConservados = Object.fromEntries(negocio.map(t => [t, original[t].cantidad]));
    const cs = (await temporalPool.query("SELECT id,usuario,password_hash,activo FROM consultores_resultados ORDER BY id")).rows;
    assert.equal(cs.length, 2); assert.ok(cs.every(c => c.usuario === null && c.password_hash === null && c.activo === false));
    const invalidas = (await temporalPool.query("SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated")).rows;
    assert.equal(invalidas.length, 0);
    resultado.tablas = (await temporalPool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows.map(t => t.tablename);
    assert.equal(resultado.tablas.length, 14);
    assert.equal((await temporalPool.query("SELECT count(*)::int n FROM estudiantes WHERE origen_registro='desconocido'")).rows[0].n, 3);
    const c = await temporalPool.connect();
    try {
      await c.query("BEGIN");
      for (const [sql, codigo] of [
        ["UPDATE estudiantes SET origen_registro='invalido'", "23514"],
        ["INSERT INTO computadoras(identificador,nombre,grado) VALUES('PC-INVALIDA','Prueba',6)", "23514"],
        ["INSERT INTO consultores_resultados(id) VALUES(3)", "23514"],
        ["INSERT INTO autorizaciones_puesto(computadora_id,codigo_hash,vence_en) VALUES(99999,repeat('a',64),clock_timestamp()+interval '10 minutes')", "23503"],
      ]) {
        await c.query("SAVEPOINT comprobacion"); let rechazado = false;
        try { await c.query(sql); } catch (e) { rechazado = e.code === codigo; }
        await c.query("ROLLBACK TO SAVEPOINT comprobacion"); assert.ok(rechazado, "Restricción no rechaza el dato inválido esperado");
      }
    } finally { await c.query("ROLLBACK"); c.release(); }
    resultado.restricciones = "validadas; cuatro intentos inválidos rechazados y revertidos";
    appPool = new Pool({ ...conexion, database: temporal, options: "-c default_transaction_read_only=on" });
    const secret = randomBytes(32).toString("hex");
    const cuenta = (await appPool.query("SELECT id,usuario,version_token FROM administradores WHERE activo=TRUE ORDER BY id LIMIT 1")).rows[0];
    assert.ok(cuenta, "Se requiere un administrador histórico activo para verificar la API");
    const token = jwt.sign({ usuario: cuenta.usuario, rol: "administrador", version_token: cuenta.version_token }, secret,
      { subject: String(cuenta.id), issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: 120 });
    server = createApp({ pool: appPool, jwtSecret: secret }).listen(0, "127.0.0.1"); await once(server, "listening");
    resultado.api = {};
    for (const ruta of ["/api/estado", "/api/database", "/api/auth/me", "/api/resultados", "/api/votacion/configuracion", "/api/consultores/administracion"]) {
      const r = await fetch(`http://127.0.0.1:${server.address().port}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
      const datos = await r.json(); assert.equal(r.status, 200, "La API debe responder en " + ruta);
      if (ruta === "/api/database") assert.equal(datos.datos.base_datos, temporal);
      if (ruta === "/api/resultados") assert.equal(datos.resumen.votosEmitidos, 1);
      if (ruta === "/api/votacion/configuracion") assert.equal(datos.votacionAbierta, false);
      resultado.api[ruta] = r.status;
    }
    assert.deepEqual(await columnasYDatos(temporalPool, original), original);
    assert.equal(sha(await readFile(respaldo)), backupHash);
    resultado.respaldoIntacto = true;
  } finally {
    if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); });
    await appPool?.end(); await temporalPool?.end();
    if (creada) {
      assert.match(temporal, /^municipio_ensayo_\d{8}_[a-f0-9]{16}$/); assert.ok(!protegidas.includes(temporal));
      const actual = (await control.query("SELECT oid FROM pg_database WHERE datname=$1", [temporal])).rows[0];
      assert.equal(actual?.oid, oid, "No eliminar una base distinta a la creada por esta ejecución");
      await control.query(`DROP DATABASE ${ident(temporal)}`);
      resultado.temporalEliminada = true;
    }
    await control?.end();
    for (const nombre of protegidas) assert.deepEqual(await huellasBase(nombre), antes[nombre], "La base instalada debe permanecer intacta: " + nombre);
    resultado.basesInstaladasIntactas = true;
  }
  resultado.estado = "LISTA PARA ACTUALIZAR";
  console.log(JSON.stringify(resultado, null, 2));
}
main().catch(e => { console.error("Ensayo detenido:", e.message); process.exitCode = 1; });
