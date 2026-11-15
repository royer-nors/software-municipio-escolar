// PostgreSQL embebido y carpeta temporal: nunca lee .env ni conecta a DB_*.
const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const path = require("node:path");
const { tmpdir } = require("node:os");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const { PGlite } = require("@electric-sql/pglite");
const { createLegacyRouterHarness: createApp } = require("../test-support/legacy-router-harness");
const { migrar } = require("../database/migrar");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");
let db, server, url, directory;
const secret = "programacion-electoral-pruebas-aisladas-secreto";
// Una conexión PGlite serializada; no simula varios backends de PostgreSQL.
let cola = Promise.resolve();
async function reservar() { const previo = cola; let liberar; cola = new Promise(r => { liberar = r; }); await previo; return liberar; }
const pool = {
  async query(sql, values) { const liberar = await reservar(); try { return await db.query(sql, values); } finally { liberar(); } },
  async connect() {
    const liberar = await reservar();
    return { async query(sql, values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values); }, release: liberar };
  },
};
function token(admin = true, id = 1) {
  return jwt.sign(admin ? { rol: "administrador", usuario: "admin", version_token: 0 } : { rol: "estudiante" }, secret,
    { algorithm: "HS256", subject: String(id), issuer: JWT_ISSUER, audience: admin ? JWT_AUDIENCE : STUDENT_JWT_AUDIENCE, expiresIn: 900 });
}
async function iniciar() {
  server = createApp({ pool, jwtSecret: secret }).listen(0,"127.0.0.1"); await once(server,"listening"); url = `http://127.0.0.1:${server.address().port}/api`;
}
async function cerrar() { await new Promise((resolve,reject) => server.close(e => e ? reject(e) : resolve())); }
async function api(ruta, body, credential = token()) {
  const response = await fetch(url + ruta, { method: body === undefined ? "GET" : ruta === "/auth/estudiante" || ruta === "/votos" ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json", ...(credential ? { Authorization: `Bearer ${credential}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
}
const programa = (extra = {}) => ({ institucion: "I.E. de pruebas", ubicacion: "Abancay", anio: 2099, fecha: "2099-11-12", horaInicio: "08:00", horaFin: "15:00", automatica: true, revision: 0, ...extra });
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(),"municipio-programacion-"));
  db = await PGlite.create({ dataDir: directory }); await migrar(pool); await iniciar();
});
beforeEach(async () => {
  await db.exec(`TRUNCATE votos, candidatos, listas, estudiantes, administradores, auditoria_configuracion_electoral RESTART IDENTITY CASCADE;
    UPDATE configuracion_votacion SET votacion_abierta=FALSE, voto_blanco_habilitado=TRUE, automatica=FALSE,
      institucion=NULL, ubicacion=NULL, anio_electoral=NULL, fecha_votacion=NULL, hora_inicio=NULL, hora_fin=NULL, revision=0;
    INSERT INTO administradores(usuario,password_hash) VALUES ('admin','hash-aislado');
    INSERT INTO listas(nombre) VALUES ('Lista de prueba');
    INSERT INTO estudiantes(codigo,nombre) SELECT lpad(n::text,8,'0'),'Estudiante '||n FROM generate_series(1,5) n;`);
});
after(async () => {
  if(server) await cerrar(); if(db && !db.closed) await db.close();
  if (directory && path.dirname(directory) === path.resolve(tmpdir()) && path.basename(directory).startsWith("municipio-programacion-")) await rm(directory,{recursive:true,force:true});
});
async function activarHoy() {
  await db.exec(`UPDATE configuracion_votacion SET automatica=TRUE, institucion='I.E.', ubicacion='Abancay',
    fecha_votacion=(clock_timestamp() AT TIME ZONE 'America/Lima')::date,
    anio_electoral=EXTRACT(YEAR FROM clock_timestamp() AT TIME ZONE 'America/Lima'), hora_inicio='00:00',hora_fin='24:00'`);
}

test("programa, recupera datos y audita el administrador sin modificar padrón ni listas", async () => {
  const result = await api("/votacion/configuracion", programa());
  assert.equal(result.status,200); assert.equal(result.body.configuracion.estado,"Programada");
  const guardada = (await api("/votacion/configuracion")).body;
  for(const key of ["institucion","ubicacion","anio","fecha","horaInicio","horaFin","automatica"]) assert.equal(guardada[key],programa()[key]);
  assert.equal(guardada.zonaHoraria,"America/Lima"); assert.equal(guardada.revision,1);
  const audit = (await db.query("SELECT * FROM auditoria_configuracion_electoral")).rows[0];
  assert.equal(audit.administrador_id,1); assert.equal(audit.administrador_usuario,"admin");
  assert.equal(audit.anterior.automatica,false); assert.equal(audit.nueva.automatica,true);
  assert.equal((await db.query("SELECT count(*)::int n FROM estudiantes")).rows[0].n,5);
});

test("voto en blanco se guarda, se recupera y su cambio se bloquea durante votación abierta",async()=>{
  const cambiado=await api("/votacion/configuracion",{votoBlancoHabilitado:false,revision:0});
  assert.equal(cambiado.status,200);
  assert.equal((await api("/votacion/configuracion")).body.votoBlancoHabilitado,false);
  await activarHoy();
  const denegado=await api("/votacion/configuracion",{votoBlancoHabilitado:true,revision:1});
  assert.equal(denegado.status,409);
  assert.equal((await api("/votos",{listaId:null},token(false))).status,409);
  assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id=1")).rows[0].ya_voto,false);
  assert.equal((await api("/votacion/configuracion")).body.votoBlancoHabilitado,false);
});

test("límites exactos, cambio de fecha y zona de sesión distinta usan America/Lima", async () => {
  await api("/votacion/configuracion",programa());
  await db.exec("SET TIME ZONE 'Asia/Tokyo'");
  try {
    for(const [hora,esperado] of [["2099-11-12T12:59:59.999999Z","Programada"],["2099-11-12T13:00:00Z","Abierta"],["2099-11-12T19:59:59.999999Z","Abierta"],["2099-11-12T20:00:00Z","Finalizada"],["2099-11-13T13:00:00Z","Finalizada"],["2099-11-11T20:00:00Z","Programada"]]) {
      assert.equal((await db.query("SELECT estado_votacion(c,$1::timestamptz) estado FROM configuracion_votacion c",[hora])).rows[0].estado,esperado);
    }
  } finally { await db.exec("SET TIME ZONE 'UTC'"); }
});

test("autenticación y cada voto respetan antes, durante y después, aun con JWT previo", async () => {
  await api("/votacion/configuracion",programa());
  assert.equal((await api("/auth/estudiante",{dni:"00000001"},null)).status,409);
  assert.equal((await api("/votos",{listaId:1},token(false))).status,409);
  await activarHoy();
  const login = await api("/auth/estudiante",{dni:"00000001"},null);
  assert.equal(login.status,200);
  assert.equal((await api("/votos",{listaId:1},login.body.token)).status,201);
  assert.equal((await api("/votos",{listaId:1},login.body.token)).status,409);
  await db.exec("UPDATE estudiantes SET activo=FALSE WHERE id=2");
  assert.equal((await api("/votos",{listaId:1},token(false,2))).status,409);
  await db.exec("UPDATE configuracion_votacion SET fecha_votacion='2001-01-01',anio_electoral=2001");
  assert.equal((await api("/auth/estudiante",{dni:"00000003"},null)).status,409);
  assert.equal((await api("/votos",{listaId:1},token(false,3))).status,409);
  assert.equal((await db.query("SELECT count(*)::int n FROM votos")).rows[0].n,1);
  assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id=3")).rows[0].ya_voto,false);
});

test("jornada 12 de noviembre 22:00–23:00: límites exactos, UTC equivalente y emergencia manual", async () => {
  await db.query(`UPDATE configuracion_votacion SET institucion='I.E.',ubicacion='Abancay',anio_electoral=2026,
    fecha_votacion='2026-11-12',hora_inicio='22:00',hora_fin='23:00',automatica=TRUE`);
  for (const [instante, esperado] of [
    ["2026-11-12T21:59:59.999999-05:00","Programada"],
    ["2026-11-12T22:00:00-05:00","Abierta"],
    ["2026-11-12T22:30:19-05:00","Abierta"],
    ["2026-11-13T03:30:19Z","Abierta"],
    ["2026-11-12T22:59:59.999999-05:00","Abierta"],
    ["2026-11-12T23:00:00-05:00","Finalizada"],
    ["2026-11-13T00:00:00-05:00","Finalizada"],
  ]) assert.equal((await db.query("SELECT estado_votacion(c,$1::timestamptz) estado FROM configuracion_votacion c",[instante])).rows[0].estado,esperado);
  // La fecha realmente hallada en pgAdmin es diciembre, para ella Programada es correcto.
  await db.query("UPDATE configuracion_votacion SET fecha_votacion='2026-12-11'");
  assert.equal((await db.query("SELECT estado_votacion(c,'2026-11-12T22:30:19-05:00') estado FROM configuracion_votacion c")).rows[0].estado,"Programada");
  const manual = await api("/votacion/configuracion",{votacionAbierta:true,confirmarCambioActivo:true,motivo:"Emergencia de pruebas"});
  assert.equal(manual.status,200); assert.equal(manual.body.configuracion.automatica,false);
  assert.equal((await db.query("SELECT estado_votacion(c,'2026-11-12T22:30:19-05:00') estado FROM configuracion_votacion c")).rows[0].estado,"Abierta");
});

test("edición activa y emergencia exigen confirmación, motivo y auditoría; reactivar devuelve el control al horario", async () => {
  await activarHoy();
  assert.equal((await api("/votacion/configuracion",programa())).status,409);
  assert.equal((await api("/votacion/configuracion",{votacionAbierta:false})).status,409);
  assert.equal((await api("/votacion/configuracion",{votacionAbierta:false,confirmarCambioActivo:true,motivo:"Incidencia en un puesto"})).status,200);
  let actual = (await api("/votacion/configuracion")).body;
  assert.equal(actual.automatica,false); assert.equal(actual.votacionAbierta,false);
  assert.equal((await api("/votacion/configuracion",programa({revision:actual.revision}))).status,200);
  actual = (await api("/votacion/configuracion")).body;
  assert.equal(actual.automatica,true); assert.equal(actual.estado,"Programada");
  assert.equal((await db.query("SELECT count(*)::int n FROM auditoria_configuracion_electoral")).rows[0].n,2);
});

test("persistencia tras cerrar y recrear servidor y motor de base embebida", async () => {
  await api("/votacion/configuracion",programa());
  await cerrar(); await db.close();
  db = await PGlite.create({dataDir:directory}); await iniciar();
  const config = (await api("/votacion/configuracion")).body;
  assert.equal(config.fecha,"2099-11-12"); assert.equal(config.estado,"Programada"); assert.equal(config.automatica,true);
});

test("un cambio activo confirmado se audita y un fallo de auditoría revierte el cambio completo", async () => {
  await activarHoy();
  const result = await api("/votacion/configuracion",programa({confirmarCambioActivo:true,motivo:"Acuerdo de reprogramación"}));
  assert.equal(result.status,200);
  assert.equal((await db.query("SELECT motivo FROM auditoria_configuracion_electoral")).rows[0].motivo,"Acuerdo de reprogramación");
  const antes = (await api("/votacion/configuracion")).body;
  await db.exec(`CREATE FUNCTION impedir_auditoria_prueba() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo aislado'; END; $$;
    CREATE TRIGGER fallo_auditoria BEFORE INSERT ON auditoria_configuracion_electoral FOR EACH ROW EXECUTE FUNCTION impedir_auditoria_prueba();`);
  try {
    assert.equal((await api("/votacion/configuracion",{votacionAbierta:true,confirmarCambioActivo:true,motivo:"Emergencia"})).status,503);
    assert.deepEqual((await api("/votacion/configuracion")).body,antes);
  } finally { await db.exec("DROP TRIGGER fallo_auditoria ON auditoria_configuracion_electoral; DROP FUNCTION impedir_auditoria_prueba()"); }
});

test("cinco puestos concurrentes conservan un voto por identidad y cierre impide nuevas escrituras", async () => {
  await activarHoy();
  const results = await Promise.all(Array.from({length:5},()=>api("/votos",{listaId:1},token(false))));
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409,409,409,409]);
  await api("/votacion/configuracion",{votacionAbierta:false,confirmarCambioActivo:true,motivo:"Cierre de emergencia"});
  const cerrados = await Promise.all([2,3,4,5].map(id=>api("/votos",{listaId:1},token(false,id))));
  assert.ok(cerrados.every(r=>r.status===409));
  assert.equal((await db.query("SELECT count(*)::int n FROM votos")).rows[0].n,1);
});

test("ediciones simultáneas con la misma revisión no se sobrescriben", async () => {
  const resultados = await Promise.all([api("/votacion/configuracion",programa()),api("/votacion/configuracion",programa({fecha:"2099-11-13"}))]);
  assert.deepEqual(resultados.map(r=>r.status).sort(),[200,409]);
  assert.equal((await db.query("SELECT count(*)::int n FROM auditoria_configuracion_electoral")).rows[0].n,1);
});

test("rechaza fechas, horas y años inválidos y modificaciones sin JWT administrativo", async () => {
  for (const extra of [{fecha:"2099-02-30"},{anio:2098},{horaFin:"08:00"},{horaInicio:"24:00"},{horaFin:"07:00"},{revision:-1},{automatica:"true"}]) {
    assert.equal((await api("/votacion/configuracion",programa(extra))).status,400);
  }
  assert.equal((await api("/votacion/configuracion",programa(),null)).status,401);
  assert.equal((await api("/votacion/configuracion",programa(),token(false))).status,401);
  assert.equal((await db.query("SELECT count(*)::int n FROM auditoria_configuracion_electoral")).rows[0].n,0);
});
