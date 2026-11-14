// Reloj controlado SOLO dentro de PGlite temporal. No lee .env ni conecta a DB_*.
// Las migraciones y el código de producción se ejecutan sin modificar sus funciones.
const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const { PGlite } = require("@electric-sql/pglite");
const { createLegacyRouterHarness: createApp } = require("../test-support/legacy-router-harness");
const { migrar } = require("../database/migrar");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");
let db, server, url, directory;
const secret = "reloj-controlado-electoral-secreto-de-pruebas";
let cola = Promise.resolve();
async function reservar() { const previa = cola; let liberar; cola = new Promise(r => { liberar = r; }); await previa; return liberar; }
const pool = {
  async query(sql, values) { const liberar = await reservar(); try { return await db.query(sql,values); } finally { liberar(); } },
  async connect() {
    const liberar = await reservar();
    return { async query(sql,values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql,values); }, release: liberar };
  },
};
function token(admin = true, id = 1) {
  return jwt.sign(admin ? {rol:"administrador",usuario:"admin",version_token:0} : {rol:"estudiante"},secret,
    {algorithm:"HS256",subject:String(id),issuer:JWT_ISSUER,audience:admin ? JWT_AUDIENCE : STUDENT_JWT_AUDIENCE,expiresIn:900});
}
async function iniciar() { server=createApp({pool,jwtSecret:secret}).listen(0,"127.0.0.1"); await once(server,"listening"); url=`http://127.0.0.1:${server.address().port}/api`; }
async function cerrar() { await new Promise((resolve,reject)=>server.close(e=>e ? reject(e) : resolve())); }
async function api(ruta, body, credencial=token()) {
  const response=await fetch(url+ruta,{method:body===undefined ? "GET" : ["/auth/estudiante","/votos"].includes(ruta) ? "POST" : "PATCH",
    headers:{"Content-Type":"application/json",...(credencial ? {Authorization:`Bearer ${credencial}`} : {})},...(body===undefined ? {} : {body:JSON.stringify(body)})});
  return {status:response.status,body:await response.json()};
}
async function reloj(instante) { await db.query("UPDATE reloj_pruebas.instante SET valor=$1::timestamptz",[instante]); }
function mover(instante,minutos) { return new Date(Date.parse(instante)+minutos*60000).toISOString(); }
function datos(fecha,inicio,fin,revision=0) { return {institucion:"I.E. de pruebas",ubicacion:"Abancay",anio:Number(fecha.slice(0,4)),fecha,horaInicio:inicio,horaFin:fin,automatica:true,revision}; }
before(async()=>{
  directory=await mkdtemp(path.join(tmpdir(),"municipio-reloj-"));
  db=await PGlite.create({dataDir:directory});
  await db.exec(`CREATE SCHEMA reloj_pruebas;
    CREATE TABLE reloj_pruebas.instante(valor TIMESTAMPTZ NOT NULL);
    INSERT INTO reloj_pruebas.instante VALUES ('2030-01-01T00:00:00-05:00');
    CREATE FUNCTION reloj_pruebas.clock_timestamp() RETURNS TIMESTAMPTZ LANGUAGE sql VOLATILE
      AS 'SELECT valor FROM reloj_pruebas.instante';
    SET search_path = public, reloj_pruebas, pg_catalog;`);
  // La resolución de clock_timestamp se controla únicamente en esta instancia aislada.
  await migrar(pool); await iniciar();
});
beforeEach(async()=>{
  await db.exec(`TRUNCATE votos,candidatos,listas,estudiantes,administradores,auditoria_configuracion_electoral RESTART IDENTITY CASCADE;
    UPDATE configuracion_votacion SET automatica=FALSE,votacion_abierta=FALSE,voto_blanco_habilitado=TRUE,
      institucion=NULL,ubicacion=NULL,fecha_votacion=NULL,anio_electoral=NULL,hora_inicio=NULL,hora_fin=NULL,revision=0;
    INSERT INTO administradores(usuario,password_hash) VALUES ('admin','hash-aislado');
    INSERT INTO listas(nombre) VALUES ('Lista de pruebas');
    INSERT INTO estudiantes(codigo,nombre) SELECT lpad(n::text,8,'0'),'Estudiante '||n FROM generate_series(1,10) n;`);
  await reloj("2030-01-01T00:00:00-05:00");
});
after(async()=>{
  if(server) await cerrar(); if(db && !db.closed) await db.close();
  if(directory && path.dirname(directory)===path.resolve(tmpdir()) && path.basename(directory).startsWith("municipio-reloj-")) await rm(directory,{recursive:true,force:true});
});

for(const jornada of [
  {nombre:"mañana",fecha:"2032-05-18",inicio:"07:13",fin:"10:47"},
  {nombre:"tarde",fecha:"2035-12-31",inicio:"13:25",fin:"17:42"},
  {nombre:"noche",fecha:"2036-02-29",inicio:"21:17",fin:"23:51"},
  {nombre:"caso reportado 22:00–23:00",fecha:"2026-11-12",inicio:"22:00",fin:"23:00"},
]) test(`reloj controlado: ${jornada.nombre}, consulta, DNI y voto en todos los límites`,async()=>{
  const inicio=`${jornada.fecha}T${jornada.inicio}:00-05:00`,fin=`${jornada.fecha}T${jornada.fin}:00-05:00`;
  await reloj(mover(inicio,-2));
  assert.equal((await api("/votacion/configuracion",datos(jornada.fecha,jornada.inicio,jornada.fin))).status,200);
  const medio=new Date((Date.parse(inicio)+Date.parse(fin))/2).toISOString();
  for(const [instante,estado] of [[mover(inicio,-1),"Programada"],[inicio,"Abierta"],[medio,"Abierta"],[fin,"Finalizada"],[mover(fin,1),"Finalizada"]]) {
    await reloj(instante);
    assert.equal((await db.query("SELECT clock_timestamp()::text valor")).rows[0].valor.slice(0,4),jornada.fecha.slice(0,4));
    const configuracion=(await api("/votacion/configuracion")).body;
    assert.equal(configuracion.estado,estado,instante); assert.equal(configuracion.votacionAbierta,estado==="Abierta");
    assert.equal(configuracion.horaInicio,jornada.inicio); assert.equal(configuracion.horaFin,jornada.fin);
    const acceso=await api("/auth/estudiante",{dni:"00000006"},null);
    assert.equal(acceso.status,estado==="Abierta" ? 200 : 409);
    if(estado!=="Abierta") {
      assert.equal((await api("/votos",{listaId:1},token(false,6))).status,409);
      assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id=6")).rows[0].ya_voto,false);
    } else if(instante===inicio) {
      assert.equal((await api("/votos",{listaId:1},token(false,7))).status,201);
    } else {
      // Cinco identidades distintas, no cinco reintentos del mismo alumno.
      const sesiones=await Promise.all([1,2,3,4,5].map(id=>api("/auth/estudiante",{dni:String(id).padStart(8,"0")},null)));
      assert.ok(sesiones.every(s=>s.status===200));
      const votos=await Promise.all(sesiones.map(s=>api("/votos",{listaId:1},s.body.token)));
      assert.deepEqual(votos.map(v=>v.status),[201,201,201,201,201]);
      assert.equal((await api("/votos",{listaId:1},sesiones[0].body.token)).status,409);
    }
  }
  assert.equal((await db.query("SELECT count(*)::int n FROM votos")).rows[0].n,6);
});

test("cambiar fecha y horario con el transporte del formulario persiste sin conversión UTC",async()=>{
  const {fechaIsoDesdeTexto}=await import("../../frontend/src/utils/horario-electoral.js");
  const {guardarConfiguracionElectoral}=await import("../../frontend/src/api/control-votacion.js");
  const fetchOriginal=globalThis.fetch;
  // Redirige solamente el transporte del formulario a esta API local aislada.
  globalThis.fetch=(destino,opciones)=>fetchOriginal(String(destino).replace("http://localhost:3000/api",url),opciones);
  try {
    let config=await guardarConfiguracionElectoral(datos(fechaIsoDesdeTexto("18/05/2032"),"07:13","10:47"),token());
    assert.equal(config.fecha,"2032-05-18");
    config=await guardarConfiguracionElectoral(datos(fechaIsoDesdeTexto("29/02/2036"),"14:09","18:32",config.revision),token());
    assert.equal(config.fecha,"2036-02-29"); assert.equal(config.horaInicio,"14:09");
    await reloj("2036-02-29T14:09:00-05:00");
    assert.equal((await api("/votacion/configuracion")).body.estado,"Abierta");
    await reloj("2036-02-29T18:32:00-05:00");
    assert.equal((await api("/votacion/configuracion")).body.estado,"Finalizada");
  } finally { globalThis.fetch=fetchOriginal; }
});

test("reinicio antes de abrir conserva horario y abre/cierra sin sesión administrativa ni navegador",async()=>{
  await api("/votacion/configuracion",datos("2034-08-09","09:26","16:14"));
  await reloj("2034-08-09T09:25:00-05:00");
  await cerrar(); await db.close(); db=await PGlite.create({dataDir:directory});
  await db.exec("SET search_path = public, reloj_pruebas, pg_catalog"); await iniciar();
  assert.equal((await api("/votacion/configuracion",undefined,null)).body.estado,"Programada");
  await reloj("2034-08-09T09:26:00-05:00");
  assert.equal((await api("/votacion/configuracion",undefined,null)).body.estado,"Abierta");
  assert.equal((await api("/votos",{listaId:1},token(false))).status,201);
  await reloj("2034-08-09T16:14:00-05:00");
  assert.equal((await api("/votos",{listaId:1},token(false,2))).status,409);
});

test("un booleano manual antiguo no interfiere con automático; emergencia explícita y auditada sí",async()=>{
  await api("/votacion/configuracion",datos("2032-05-18","07:13","10:47"));
  await db.query("UPDATE configuracion_votacion SET votacion_abierta=TRUE");
  await reloj("2032-05-18T07:12:00-05:00");
  assert.equal((await api("/votacion/configuracion")).body.estado,"Programada");
  await db.query("UPDATE configuracion_votacion SET votacion_abierta=FALSE");
  await reloj("2032-05-18T07:13:00-05:00");
  assert.equal((await api("/votacion/configuracion")).body.estado,"Abierta");
  assert.equal((await api("/votacion/configuracion",{votacionAbierta:false})).status,409);
  assert.equal((await api("/votacion/configuracion",{votacionAbierta:false,confirmarCambioActivo:true,motivo:"Emergencia explícita"})).status,200);
  const config=(await api("/votacion/configuracion")).body;
  assert.equal(config.automatica,false); assert.equal(config.estado,"Cerrada");
  assert.equal((await api("/votos",{listaId:1},token(false))).status,409);
});
