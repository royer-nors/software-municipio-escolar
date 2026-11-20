const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { createHash } = require("node:crypto");
const { once } = require("node:events");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { crearPoolPGlite } = require("../config/db-pglite");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { configurarRed } = require("../config/red");
const { FRASE_CONFIRMACION, FRASE_REINICIO } = require("../services/borrado-datos.modelo");
const { JWT_ISSUER, JWT_AUDIENCE } = require("../config/auth");
let carpeta, pool, server, url, token;
const secreto = "secreto-exclusivo-de-pruebas-instalador-no-real";
const password = "ContrasenaFicticiaTemporal!";
const cookie = "sme_puesto=" + "b".repeat(64);
async function abrir(p = pool, modoInstalador = true) {
  server = createApp({ pool: p, jwtSecret: secreto, modoInstalador,
    red: configurarRed({ HOST: "127.0.0.1", PORT: "3000", MODO_LAN: "true" }), puesto: { secure: false, modoLan: true } }).listen(0, "127.0.0.1");
  await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
}
async function cerrarServidor() { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); }
async function pedir(ruta, body, extra = {}) {
  const r = await fetch(url + ruta, { method: body === undefined ? "GET" : "POST",
    headers: { Origin: "http://localhost:3000", "Content-Type": "application/json", "X-Borrado-CSRF": "1", "X-Puesto-CSRF": "1", Authorization: `Bearer ${token}`, ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
}
const simular = op => pedir("/api/borrado-datos/simulacion", { operacion: op });
async function ejecutar(op, simulacion, cambios = {}, headers = {}) {
  const s = simulacion || (await simular(op)).body;
  return pedir("/api/borrado-datos/ejecutar", { operacion: op, simulacionId: s.simulacionId,
    password, confirmacion: op === "reinicio_pruebas" ? FRASE_REINICIO : FRASE_CONFIRMACION, ...cambios }, headers);
}
const conteos = async () => (await pool.query(`SELECT (SELECT count(*)::int FROM estudiantes) estudiantes,
  (SELECT count(*)::int FROM listas) listas,(SELECT count(*)::int FROM candidatos) candidatos,(SELECT count(*)::int FROM votos) votos`)).rows[0];
async function protegidos() {
  const r = {};
  for (const tabla of ["administradores", "consultores_resultados", "computadoras", "esquema_migraciones"])
    r[tabla] = (await pool.query(`SELECT * FROM ${tabla} ORDER BY 1`)).rows;
  r.tablas = (await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  return r;
}
async function identificar() {
  await pool.query("UPDATE configuracion_votacion SET votacion_abierta=TRUE");
  const r = await pedir("/api/puesto/identificar", { dni: "00000007" }, { Cookie: cookie });
  assert.equal(r.status, 200); return r.body.token;
}
before(async () => {
  carpeta = await fs.mkdtemp(path.join(os.tmpdir(), "sme-borrado-instalador-"));
  pool = await crearPoolPGlite({ dataDir: path.join(carpeta, "db") });
  await migrar(pool);
  token = jwt.sign({ usuario: "ficticio", rol: "administrador", version_token: 0 }, secreto,
    { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, subject: "1", expiresIn: 3600 });
  await abrir();
});
beforeEach(async () => {
  await pool.query(`TRUNCATE sesiones_votacion_puesto,auditoria_importaciones_padron,vistas_previas_padron,votos,candidatos,listas,estudiantes,
    vinculaciones_puesto,autorizaciones_puesto,computadoras,administradores,auditoria_borrado_datos RESTART IDENTITY CASCADE;
    UPDATE configuracion_votacion SET votacion_abierta=FALSE,automatica=FALSE,voto_blanco_habilitado=TRUE,institucion='Colegio ficticio',ubicacion='Local ficticio',anio_electoral=2099,fecha_votacion='2099-01-01',hora_inicio='08:00',hora_fin='16:00';
    INSERT INTO estudiantes(codigo,nombre,grado,origen_registro,ya_voto) SELECT lpad(n::text,8,'0'),'Ficticio '||n,'3',CASE WHEN n<=20 THEN 'excel' ELSE 'manual' END,n<=6 FROM generate_series(1,30)n;
    INSERT INTO listas(nombre)VALUES('Lista ficticia');INSERT INTO candidatos(nombre,lista_id)VALUES('Candidato ficticio',1);
    INSERT INTO votos(lista_id)SELECT 1 FROM generate_series(1,6);
    INSERT INTO computadoras(identificador,nombre,grado)VALUES('PC-PRUEBA','Puesto ficticio',3);
    INSERT INTO autorizaciones_puesto(computadora_id,codigo_hash,vence_en)VALUES(1,repeat('a',64),clock_timestamp()+interval'10 minutes');
    INSERT INTO autorizaciones_puesto(computadora_id,codigo_hash,vence_en,consumida_en)VALUES(1,repeat('c',64),clock_timestamp()+interval'10 minutes',clock_timestamp());
    INSERT INTO vinculaciones_puesto(computadora_id,autorizacion_id,credencial_hash,vence_en)VALUES(1,2,encode(sha256(convert_to(repeat('b',64),'UTF8')),'hex'),clock_timestamp()+interval'12 hours');
    INSERT INTO vistas_previas_padron(id,administrador_id,grado,modo,estudiantes,huella)VALUES('10000000-0000-4000-8000-000000000001',1,3,'agregar','[]',repeat('a',64));`);
  const hash = bcrypt.hashSync(password, 4);
  await pool.query("INSERT INTO administradores(usuario,password_hash)VALUES('ficticio',$1),('segundo-ficticio',$1)", [hash]);
  await pool.query("UPDATE consultores_resultados SET usuario='consultor-ficticio-'||id,password_hash=$1,activo=TRUE", [hash]);
});
after(async () => {
  await cerrarServidor(); await pool?.close();
  if (carpeta) {
    assert.ok(path.resolve(carpeta).startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(carpeta, { recursive: true, force: true });
  }
});

for (const [op, esperados] of [
  ["solo_votos", [30, 1, 1, 0]], ["estudiantes_importados", [10, 1, 1, 0]], ["estudiantes", [0, 1, 1, 0]],
  ["solo_candidatos", [30, 1, 0, 0]], ["solo_listas", [30, 0, 0, 0]],
  ["candidatos_listas", [30, 0, 0, 0]], ["reinicio_pruebas", [0, 0, 0, 0]],
]) test(`PGlite instalado: ${op} elimina solo lo previsto y conserva cuentas, equipos y estructura`, async () => {
  if (["estudiantes_importados", "estudiantes", "solo_candidatos", "solo_listas"].includes(op))
    await pool.query("DELETE FROM votos;UPDATE estudiantes SET ya_voto=FALSE");
  if (op === "solo_listas") await pool.query("DELETE FROM candidatos");
  const antes = await protegidos();
  const s = (await simular(op)).body;
  assert.equal(s.bloqueada, false); assert.equal(s.autorizacionReinicio.tipo, "instalador");
  assert.equal((await ejecutar(op, s)).status, 200);
  assert.deepEqual(Object.values(await conteos()), esperados);
  assert.deepEqual(await protegidos(), antes);
  assert.equal((await pool.query("SELECT count(*)::int n FROM estudiantes WHERE ya_voto")).rows[0].n, 0);
  assert.ok((await pool.query("SELECT revocada_en FROM vinculaciones_puesto")).rows.every(r => r.revocada_en));
  assert.ok((await pool.query("SELECT revocada_en FROM autorizaciones_puesto WHERE consumida_en IS NULL")).rows.every(r => r.revocada_en));
  assert.equal((await pool.query("SELECT estudiantes FROM vistas_previas_padron")).rows[0].estudiantes, null);
  const cfg = (await pool.query("SELECT * FROM configuracion_votacion")).rows[0];
  assert.equal(cfg.votacion_abierta, false); assert.equal(cfg.automatica, false);
  assert.equal(cfg.institucion, "Colegio ficticio"); assert.equal(cfg.voto_blanco_habilitado, true);
  if (op === "reinicio_pruebas") for (const k of ["anio_electoral", "fecha_votacion", "hora_inicio", "hora_fin"]) assert.equal(cfg[k], null);
  assert.equal((await pool.query("SELECT count(*)::int n FROM auditoria_borrado_datos WHERE resultado='ejecutado'")).rows[0].n, 1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM auditoria_borrado_datos WHERE modo='simulacion'")).rows[0].n, 1);
});

test("bloquea elección abierta e integridad; ninguna vista bloqueada se ejecuta", async () => {
  const antes = await conteos();
  for (const op of ["estudiantes", "estudiantes_importados", "solo_candidatos", "solo_listas"]) {
    const s = (await simular(op)).body; assert.equal(s.bloqueada, true); assert.equal((await ejecutar(op, s)).status, 409);
  }
  await pool.query("UPDATE configuracion_votacion SET votacion_abierta=TRUE");
  for (const op of ["solo_votos", "candidatos_listas", "reinicio_pruebas"]) assert.equal((await simular(op)).body.bloqueada, true);
  assert.deepEqual(await conteos(), antes);
});
test("sesión activa bloquea las siete opciones incluso cerrada; una sesión vencida deja de bloquear", async () => {
  const previa = (await simular("reinicio_pruebas")).body;
  const sesion = await identificar();
  await pool.query("UPDATE configuracion_votacion SET votacion_abierta=FALSE");
  assert.equal((await pedir("/api/borrado-datos/resumen")).body.sesionesVotacionActivas, 1);
  for (const op of ["solo_votos", "estudiantes_importados", "estudiantes", "solo_candidatos", "solo_listas", "candidatos_listas", "reinicio_pruebas"])
    assert.ok((await simular(op)).body.bloqueos.some(b => b.includes("sesiones de votación activas")));
  assert.equal((await ejecutar("reinicio_pruebas", previa)).status, 409);
  assert.equal((await conteos()).votos, 6);
  await pool.query("UPDATE sesiones_votacion_puesto SET creada_en=clock_timestamp()-interval'2 minutes',vence_en=clock_timestamp()-interval'1 minute'");
  assert.equal((await pedir("/api/puesto/listas", undefined, { Cookie: cookie, Authorization: `Bearer ${sesion}` })).status, 401);
  assert.equal((await simular("reinicio_pruebas")).body.bloqueada, false);
});
test("sesión persiste tras reiniciar backend/PGlite y una vinculación sin estudiante no bloquea", async () => {
  assert.equal((await simular("reinicio_pruebas")).body.bloqueada, false);
  await identificar(); await pool.query("UPDATE configuracion_votacion SET votacion_abierta=FALSE");
  await cerrarServidor(); await pool.close(); pool = await crearPoolPGlite({ dataDir: path.join(carpeta, "db") }); await abrir();
  assert.equal((await pedir("/api/borrado-datos/resumen")).body.sesionesVotacionActivas, 1);
  assert.equal((await simular("reinicio_pruebas")).body.bloqueada, true);
});
for (const listaId of [1, null]) test(`voto ${listaId === null ? "blanco" : "válido"} finaliza sesión y permite posteriormente el reinicio`, async () => {
  const sesion = await identificar();
  assert.equal((await pedir("/api/puesto/votos", { listaId }, { Cookie: cookie, Authorization: `Bearer ${sesion}` })).status, 201);
  assert.equal((await pool.query("SELECT count(*)::int n FROM sesiones_votacion_puesto WHERE estudiante_id=7")).rows[0].n, 0);
  await pool.query("UPDATE configuracion_votacion SET votacion_abierta=FALSE");
  assert.equal((await pedir("/api/borrado-datos/resumen")).body.sesionesVotacionActivas, 0);
  assert.equal((await ejecutar("reinicio_pruebas")).status, 200);
});
test("contraseña, JWT, CSRF, vista previa y doble envío mantienen sus restricciones", async () => {
  const s = (await simular("reinicio_pruebas")).body;
  assert.equal((await ejecutar("reinicio_pruebas", s, { password: "incorrecta" })).status, 401);
  assert.equal((await ejecutar("reinicio_pruebas", s, {}, { Authorization: "" })).status, 401);
  assert.equal((await ejecutar("reinicio_pruebas", s, {}, { "X-Borrado-CSRF": "" })).status, 403);
  assert.equal((await ejecutar("reinicio_pruebas", s, { confirmacion: "" })).status, 400);
  assert.equal((await ejecutar("reinicio_pruebas", s, { simulacionId: 999 })).status, 409);
  // Reiniciar el router de prueba evita que la limitación eclipse el control de concurrencia.
  await cerrarServidor(); await abrir();
  const r = await Promise.all([ejecutar("reinicio_pruebas", s), ejecutar("reinicio_pruebas", s)]);
  assert.deepEqual(r.map(x => x.status).sort(), [200, 409]);
});
test("no basta llamarse postgres ni enviar modoInstalador: solo la fábrica y el arranque interno habilitan", async () => {
  await cerrarServidor();
  const falso = { query: (...args) => pool.query(...args), connect: () => pool.connect() };
  await abrir(falso, true);
  assert.equal((await pedir("/api/borrado-datos/resumen")).body.habilitado, false);
  await cerrarServidor(); await abrir(pool, false);
  assert.equal((await pedir("/api/borrado-datos/resumen")).body.habilitado, false);
  await cerrarServidor(); await abrir();
  const s = (await simular("reinicio_pruebas")).body;
  assert.equal((await ejecutar("reinicio_pruebas", s, { modoInstalador: true })).status, 400);
});
test("fallo de auditoría revierte todos los cambios y no consume la simulación", async () => {
  const antes = await conteos(), cuentas = await protegidos();
  const s = (await simular("reinicio_pruebas")).body;
  await pool.query(`CREATE FUNCTION fallo_auditoria_instalador() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resultado='ejecutado' THEN RAISE EXCEPTION 'Fallo ficticio';END IF;RETURN NEW;END $$;
    CREATE TRIGGER fallo_auditoria_instalador BEFORE INSERT ON auditoria_borrado_datos FOR EACH ROW EXECUTE FUNCTION fallo_auditoria_instalador()`);
  try {
    assert.equal((await ejecutar("reinicio_pruebas", s)).status, 503);
    assert.deepEqual(await conteos(), antes); assert.deepEqual(await protegidos(), cuentas);
    assert.equal((await pool.query("SELECT consumida_en FROM auditoria_borrado_datos WHERE id=$1", [s.simulacionId])).rows[0].consumida_en, null);
    assert.equal((await pool.query("SELECT revocada_en FROM vinculaciones_puesto")).rows[0].revocada_en, null);
  } finally { await pool.query("DROP TRIGGER fallo_auditoria_instalador ON auditoria_borrado_datos;DROP FUNCTION fallo_auditoria_instalador()"); }
});

test("015 es aditiva sobre 001–014 con datos históricos ficticios y es idempotente", async () => {
  const p = await crearPoolPGlite({ dataDir: path.join(carpeta, "actualizacion-aislada") });
  try {
    const directorio = path.join(__dirname, "../../database/migrations");
    const anteriores = (await fs.readdir(directorio)).filter(n => /^\d{3}_[a-z0-9_]+\.sql$/.test(n) && Number(n.slice(0, 3)) <= 14).sort();
    await p.query("CREATE TABLE esquema_migraciones(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())");
    for (const n of anteriores) {
      const sql = (await fs.readFile(path.join(directorio, n), "utf8")).replace(/\r\n/g, "\n");
      await p.query(sql); await p.query("INSERT INTO esquema_migraciones(version,checksum)VALUES($1,$2)", [n, createHash("sha256").update(sql).digest("hex")]);
    }
    await p.query(`INSERT INTO estudiantes(codigo,nombre,grado,ya_voto)SELECT lpad(n::text,8,'0'),'Historico ficticio '||n,'3',n<=6 FROM generate_series(1,30)n;
      INSERT INTO listas(nombre)VALUES('Lista anterior ficticia');INSERT INTO candidatos(nombre,lista_id)VALUES('Candidato anterior ficticio',1);
      INSERT INTO votos(lista_id)SELECT 1 FROM generate_series(1,6);
      INSERT INTO computadoras(identificador,nombre,grado)VALUES('PC-01','Ficticio 1',3),('PC-02','Ficticio 2',3)`);
    await p.query("INSERT INTO administradores(usuario,password_hash)VALUES('anterior-1',$1),('anterior-2',$1)", [bcrypt.hashSync(password, 4)]);
    const tablas = (await p.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const antes = {};
    for (const { tablename } of tablas) antes[tablename] = (await p.query(`SELECT to_jsonb(t)::text fila FROM ${tablename} t ORDER BY to_jsonb(t)::text`)).rows;
    assert.deepEqual(await migrar(p), ["015_sesiones_votacion_puesto.sql"]);
    assert.deepEqual(await migrar(p), []);
    for (const { tablename } of tablas.filter(t => t.tablename !== "esquema_migraciones"))
      assert.deepEqual((await p.query(`SELECT to_jsonb(t)::text fila FROM ${tablename} t ORDER BY to_jsonb(t)::text`)).rows, antes[tablename], tablename);
    assert.equal((await p.query("SELECT count(*)::int n FROM sesiones_votacion_puesto")).rows[0].n, 0);
    assert.equal((await p.query("SELECT count(*)::int n FROM esquema_migraciones")).rows[0].n, anteriores.length + 1);
  } finally { await p.close(); }
});
