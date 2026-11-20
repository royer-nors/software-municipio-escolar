const { before, beforeEach, afterEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { crearEntorno } = require("../test-support/entorno-votacion-puesto");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");
const { FRASE_CONFIRMACION, FRASE_REINICIO } = require("../services/borrado-datos.service");
const { createPadronRepository } = require("../repositories/padron.repository");
let entorno, db, server, url, token;
const real = process.env.BORRADO_PG_REAL === "true";
const secreto = "secreto-borrado-aislado-no-usar-produccion";
const password = "ClaveSoloPruebas!";
const claves = ["NODE_ENV", "BORRADO_DATOS_HABILITADO", "BORRADO_DATOS_DB_PRUEBAS"];
const originales = Object.fromEntries(claves.map(k => [k, process.env[k]]));
async function pedir(ruta, { body, credential = token, headers = {}, method = body === undefined ? "GET" : "POST" } = {}) {
  const r = await fetch(`${url}/api/borrado-datos/${ruta}`, { method, headers: { Origin: "http://localhost:5173", "X-Borrado-CSRF": "1", "Content-Type": "application/json",
    ...(credential ? { Authorization: `Bearer ${credential}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json() };
}
async function simular(operacion) { return pedir("simulacion", { body: { operacion } }); }
async function ejecutar(op, extra = {}) {
  const sim = await simular(op);
  return pedir("ejecutar", { body: { operacion: op, simulacionId: sim.body.simulacionId,
    confirmacion: op === "reinicio_pruebas" ? FRASE_REINICIO : FRASE_CONFIRMACION, password, ...extra } });
}
async function conteos() {
  return (await db.query(`SELECT (SELECT count(*)::int FROM estudiantes) estudiantes,(SELECT count(*)::int FROM listas) listas,
    (SELECT count(*)::int FROM candidatos) candidatos,(SELECT count(*)::int FROM votos) votos`)).rows[0];
}
before(async () => { entorno = await crearEntorno({ real }); db = entorno.db; });
beforeEach(async () => {
  process.env.NODE_ENV = "test"; process.env.BORRADO_DATOS_HABILITADO = "true";
  process.env.BORRADO_DATOS_DB_PRUEBAS = real ? "db_municipio_escolar_pruebas" : "postgres";
  // Exclusivamente la instancia efímera o esquema aleatorio nuevo del helper.
  await db.exec(`TRUNCATE auditoria_importaciones_padron,vistas_previas_padron,votos,candidatos,listas,estudiantes,vinculaciones_puesto,autorizaciones_puesto,computadoras,administradores,auditoria_borrado_datos RESTART IDENTITY CASCADE;
    UPDATE configuracion_votacion SET votacion_abierta=FALSE,automatica=FALSE,fecha_votacion=NULL,hora_inicio=NULL,hora_fin=NULL,anio_electoral=NULL;
    INSERT INTO computadoras(identificador,nombre,grado) VALUES ('PC-01','Equipo prueba',3);
    INSERT INTO estudiantes(codigo,nombre,grado,origen_registro,ya_voto) VALUES ('01234567','Excel','3','excel',TRUE),('12345678','Manual','3','manual',FALSE),('22222222','Anterior','3','desconocido',FALSE);
    INSERT INTO listas(nombre) VALUES ('Lista prueba');
    INSERT INTO candidatos(nombre,lista_id) VALUES ('Candidata A',1),('Candidato B',1);
    INSERT INTO votos(candidato_id) VALUES (1);`);
  await db.query("INSERT INTO administradores(usuario,password_hash) VALUES ($1,$2)", ["admin", bcrypt.hashSync(password, 4)]);
  token = jwt.sign({ rol: "administrador", usuario: "admin", version_token: 0 }, secreto, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, subject: "1", expiresIn: 3600 });
  server = createApp({ pool: entorno.pool, jwtSecret: secreto, puesto: { secure: false } }).listen(0, "127.0.0.1");
  await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
after(async () => {
  await entorno?.cerrar();
  for (const k of claves) { if (originales[k] === undefined) delete process.env[k]; else process.env[k] = originales[k]; }
});
test("administrador puede reiniciar sin autorización externa ni código adicional y conserva cuentas/equipos", async () => {
  await db.query("UPDATE configuracion_votacion SET automatica=TRUE,institucion='IE prueba',ubicacion='Lugar',fecha_votacion='2099-01-01',anio_electoral=2099,hora_inicio='08:00',hora_fin='16:00'");
  const a = (await db.query("SELECT * FROM administradores")).rows, c = (await db.query("SELECT * FROM computadoras")).rows;
  const s = await simular("reinicio_pruebas"); assert.equal(s.body.requiereAutorizacionAdicional, false); assert.equal(s.body.bloqueada, false);
  assert.deepEqual(s.body.proyeccion, { estudiantes: 3, listas: 1, candidatos: 2, votos: 1, marcasYaVotoRestablecidas: 0 });
  const r = await ejecutar("reinicio_pruebas"); assert.equal(r.status, 200);
  assert.deepEqual(await conteos(), { estudiantes: 0, listas: 0, candidatos: 0, votos: 0 });
  assert.deepEqual((await db.query("SELECT * FROM administradores")).rows, a); assert.deepEqual((await db.query("SELECT * FROM computadoras")).rows, c);
  assert.deepEqual((await db.query("SELECT automatica,fecha_votacion,hora_inicio,hora_fin,anio_electoral FROM configuracion_votacion")).rows[0], { automatica: false, fecha_votacion: null, hora_inicio: null, hora_fin: null, anio_electoral: null });
});
test("solo votos restablece participación y mantiene padrón/listas/candidatos", async () => {
  assert.equal((await ejecutar("solo_votos")).status, 200);
  assert.deepEqual(await conteos(), { estudiantes: 3, listas: 1, candidatos: 2, votos: 0 });
  assert.equal((await db.query("SELECT count(*)::int n FROM estudiantes WHERE ya_voto")).rows[0].n, 0);
});
test("reinicio retira datos temporales Excel sin eliminar vistas auditadas, consultores ni migraciones", async () => {
  const pendiente = '10000000-0000-4000-8000-000000000001', consumida = '10000000-0000-4000-8000-000000000002';
  await db.query(`INSERT INTO vistas_previas_padron(id,administrador_id,grado,modo,estudiantes,huella)
    VALUES($1,1,3,'agregar',$2::jsonb,repeat('a',64))`, [pendiente, JSON.stringify([{ dni: '88888888', nombre: 'Temporal ficticio', grado: '3' }])]);
  await db.query(`INSERT INTO vistas_previas_padron(id,administrador_id,grado,modo,estudiantes,huella,consumida_en)
    VALUES($1,1,3,'agregar',NULL,repeat('b',64),clock_timestamp())`, [consumida]);
  await db.query(`INSERT INTO auditoria_importaciones_padron(administrador_id,administrador_usuario,vista_previa_id,grado,modo,cantidades)
    VALUES(1,'admin',$1,3,'agregar','{"agregados":1}')`, [consumida]);
  const auditoria = (await db.query('SELECT * FROM auditoria_importaciones_padron')).rows;
  const consultores = (await db.query('SELECT * FROM consultores_resultados ORDER BY id')).rows;
  const migraciones = (await db.query('SELECT * FROM esquema_migraciones ORDER BY version')).rows;
  const r = await ejecutar('reinicio_pruebas'); assert.equal(r.status, 200); assert.equal(r.body.revocaciones.vistasPrevias, 1);
  const vistas = (await db.query('SELECT estudiantes,consumida_en FROM vistas_previas_padron')).rows;
  assert.equal(vistas.length, 2); assert.ok(vistas.every(v => v.estudiantes === null && v.consumida_en));
  assert.deepEqual((await db.query('SELECT * FROM auditoria_importaciones_padron')).rows, auditoria);
  assert.deepEqual((await db.query('SELECT * FROM consultores_resultados ORDER BY id')).rows, consultores);
  assert.deepEqual((await db.query('SELECT * FROM esquema_migraciones ORDER BY version')).rows, migraciones);
});
test("impide operaciones inconsistentes y permite eliminar candidatos y listas juntos", async () => {
  for (const op of ["estudiantes", "estudiantes_importados", "solo_candidatos", "solo_listas"]) assert.equal((await simular(op)).body.bloqueada, true);
  assert.equal((await ejecutar("candidatos_listas")).status, 200);
  assert.deepEqual(await conteos(), { estudiantes: 3, listas: 0, candidatos: 0, votos: 0 });
});
test("borrar candidatos separados permite después borrar sus listas; nunca deja huérfanos", async () => {
  await ejecutar("solo_votos");
  assert.equal((await simular("solo_listas")).body.bloqueada, true);
  assert.equal((await ejecutar("solo_candidatos")).status, 200);
  assert.equal((await ejecutar("solo_listas")).status, 200);
  assert.equal((await conteos()).listas, 0);
});
test("selección de importados conserva manuales y registros de origen desconocido", async () => {
  await ejecutar("solo_votos");
  const r = await ejecutar("estudiantes_importados"); assert.equal(r.status, 200); assert.equal(r.body.cantidades.estudiantes, 1);
  assert.deepEqual((await db.query("SELECT origen_registro FROM estudiantes ORDER BY id")).rows.map(r => r.origen_registro), ["manual", "desconocido"]);
});
test("nuevas importaciones se identifican como Excel y se puede preparar otra elección tras reinicio", async () => {
  await ejecutar("reinicio_pruebas");
  const repository = createPadronRepository(entorno.pool);
  const administrador = { id: 1, usuario: 'admin' };
  const vista = await repository.previsualizar([{ dni: "88888888", nombre: "Nuevo", grado: "3", seccion: "A" }], 3, 'agregar', administrador);
  await repository.confirmar(vista.vistaPreviaId, administrador);
  assert.equal((await db.query("SELECT origen_registro FROM estudiantes")).rows[0].origen_registro, "excel");
  await db.query("INSERT INTO listas(nombre) VALUES ('Nueva elección')");
  await db.query("INSERT INTO candidatos(nombre,lista_id) SELECT 'Nueva candidata',id FROM listas");
  const r = await fetch(url + "/api/votacion/configuracion", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ votacionAbierta: true }) });
  assert.equal(r.status, 200);
});
test("bloquea una elección abierta, también cuando está abierta por programación automática", async () => {
  await db.query("UPDATE configuracion_votacion SET votacion_abierta=TRUE");
  assert.equal((await simular("reinicio_pruebas")).body.bloqueada, true);
  await db.query(`UPDATE configuracion_votacion SET votacion_abierta=FALSE,automatica=TRUE,institucion='IE',ubicacion='Lugar',
    fecha_votacion=(clock_timestamp() AT TIME ZONE 'America/Lima')::date,anio_electoral=extract(year from clock_timestamp() AT TIME ZONE 'America/Lima'),hora_inicio='00:00',hora_fin='24:00'`);
  assert.equal((await pedir("resumen")).body.votacionAbierta, true);
  assert.equal((await ejecutar("reinicio_pruebas")).status, 409); assert.equal((await conteos()).votos, 1);
});
test("contraseña, confirmación, sesión administrativa y CSRF son obligatorios", async () => {
  const antes = await conteos();
  assert.equal((await ejecutar("reinicio_pruebas", { password: "incorrecta" })).status, 401);
  assert.equal((await ejecutar("reinicio_pruebas", { confirmacion: "sí" })).status, 400);
  assert.equal((await pedir("resumen", { credential: null })).status, 401);
  const estudiante = jwt.sign({ rol: "estudiante" }, secreto, { issuer: JWT_ISSUER, audience: STUDENT_JWT_AUDIENCE, subject: "1", expiresIn: 900 });
  assert.equal((await pedir("resumen", { credential: estudiante })).status, 401);
  for (const headers of [{ Origin: "" }, { Origin: "null" }, { "X-Borrado-CSRF": "" }]) assert.equal((await pedir("simulacion", { body: { operacion: "solo_votos" }, headers })).status, 403);
  assert.deepEqual(await conteos(), antes);
});
test("simulación de un solo uso, vencida, ajena o modificada es rechazada", async () => {
  let s = (await simular("solo_votos")).body;
  await db.query("UPDATE auditoria_borrado_datos SET creado_en=clock_timestamp()-interval '11 minutes' WHERE id=$1", [s.simulacionId]);
  let r = await pedir("ejecutar", { body: { operacion: "solo_votos", simulacionId: s.simulacionId, password, confirmacion: FRASE_CONFIRMACION } }); assert.equal(r.status, 409);
  s = (await simular("solo_votos")).body;
  await db.query("UPDATE auditoria_borrado_datos SET administrador_id=999 WHERE id=$1", [s.simulacionId]);
  assert.equal((await pedir("ejecutar", { body: { operacion: "solo_votos", simulacionId: s.simulacionId, password, confirmacion: FRASE_CONFIRMACION } })).status, 409);
  s = (await simular("solo_votos")).body;
  await db.query("UPDATE estudiantes SET nombre='Cambio con mismos conteos' WHERE id=2");
  r = await pedir("ejecutar", { body: { operacion: "solo_votos", simulacionId: s.simulacionId, password, confirmacion: FRASE_CONFIRMACION } }); assert.equal(r.status, 409);
  s = (await simular("solo_votos")).body;
  const body = { operacion: "solo_votos", simulacionId: s.simulacionId, password, confirmacion: FRASE_CONFIRMACION };
  assert.equal((await pedir("ejecutar", { body })).status, 200); assert.equal((await pedir("ejecutar", { body })).status, 409);
});
test("ejecuciones simultáneas de una vista previa solo confirman una transacción", async () => {
  const s = (await simular("reinicio_pruebas")).body;
  const body = { operacion: "reinicio_pruebas", simulacionId: s.simulacionId, password, confirmacion: FRASE_REINICIO };
  const r = await Promise.all([pedir("ejecutar", { body }), pedir("ejecutar", { body })]);
  assert.deepEqual(r.map(r => r.status).sort(), [200, 409]);
  assert.equal((await db.query("SELECT count(*)::int n FROM auditoria_borrado_datos WHERE resultado='ejecutado'")).rows[0].n, 1);
});
test("un fallo de auditoría de éxito revierte eliminación, configuración y consumo de simulación", async () => {
  const antes = await conteos(), s = (await simular("reinicio_pruebas")).body;
  await db.query(`INSERT INTO vistas_previas_padron(id,administrador_id,grado,modo,estudiantes,huella)
    VALUES('20000000-0000-4000-8000-000000000001',1,3,'agregar','[]',repeat('c',64))`);
  const vistasAntes = (await db.query('SELECT * FROM vistas_previas_padron')).rows;
  await db.exec(`CREATE FUNCTION bloquear_auditoria_exito() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.resultado='ejecutado' THEN RAISE EXCEPTION 'fallo de prueba'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fallo_auditoria BEFORE INSERT ON auditoria_borrado_datos FOR EACH ROW EXECUTE FUNCTION bloquear_auditoria_exito();`);
  try {
    assert.equal((await pedir("ejecutar", { body: { operacion: "reinicio_pruebas", simulacionId: s.simulacionId, password, confirmacion: FRASE_REINICIO } })).status, 503);
    assert.deepEqual(await conteos(), antes);
    assert.deepEqual((await db.query('SELECT * FROM vistas_previas_padron')).rows, vistasAntes);
    assert.equal((await db.query("SELECT consumida_en FROM auditoria_borrado_datos WHERE id=$1", [s.simulacionId])).rows[0].consumida_en, null);
  } finally { await db.exec("DROP TRIGGER fallo_auditoria ON auditoria_borrado_datos; DROP FUNCTION bloquear_auditoria_exito();"); }
});
test("auditoría conserva actor, fecha y cantidades sin contraseña ni códigos externos", async () => {
  await ejecutar("reinicio_pruebas");
  const r = await pedir("auditoria");
  const a = r.body.auditoria.find(a => a.resultado === "ejecutado");
  assert.equal(a.administrador_usuario, "admin"); assert.equal(a.cantidades.votos, 1); assert.ok(a.creado_en);
  const texto = JSON.stringify((await db.query("SELECT detalle FROM auditoria_borrado_datos")).rows);
  assert.ok(!texto.includes(password) && !texto.includes("password_hash"));
});
test("producción, base distinta, cuenta desactivada y campos extra se bloquean", async () => {
  process.env.NODE_ENV = "production"; assert.equal((await ejecutar("reinicio_pruebas")).status, 403);
  process.env.NODE_ENV = "test"; process.env.BORRADO_DATOS_DB_PRUEBAS = "otra_base";
  assert.equal((await ejecutar("reinicio_pruebas")).status, 403);
  process.env.BORRADO_DATOS_DB_PRUEBAS = real ? "db_municipio_escolar_pruebas" : "postgres";
  assert.equal((await ejecutar("reinicio_pruebas", { autorizacionAdicional: "no-se-admite" })).status, 400);
  await db.query("UPDATE administradores SET activo=FALSE"); assert.equal((await pedir("resumen")).status, 401);
  assert.equal((await conteos()).votos, 1);
});
test("borrado revoca credenciales, conserva computadoras y no reactiva sesiones al abrir de nuevo", async () => {
  await db.query("UPDATE configuracion_votacion SET votacion_abierta=TRUE");
  const headers = { Origin: "http://localhost:5173", "Content-Type": "application/json", "X-Puesto-CSRF": "1", Authorization: `Bearer ${token}` };
  let r = await fetch(url + "/api/computadoras/1/autorizaciones", { method: "POST", headers, body: "{}" }); const codigo = (await r.json()).codigo;
  r = await fetch(url + "/api/puesto/vincular", { method: "POST", headers, body: JSON.stringify({ codigo }) }); const cookie = r.headers.get("set-cookie").split(";")[0]; await r.json();
  r = await fetch(url + "/api/puesto/identificar", { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ dni: "12345678" }) }); const sesion = await r.json(); assert.equal(r.status, 200);
  await db.query("UPDATE configuracion_votacion SET votacion_abierta=FALSE");
  assert.equal((await ejecutar("solo_votos")).status, 409, "una sesión activa impide el borrado aunque se cierre la elección");
  r = await fetch(url + "/api/computadoras/1/revocar", { method: "POST", headers, body: "{}" }); assert.equal(r.status, 200); await r.json();
  assert.equal((await ejecutar("solo_votos")).status, 200);
  await db.query("UPDATE configuracion_votacion SET votacion_abierta=TRUE");
  r = await fetch(url + "/api/puesto/listas", { headers: { ...headers, Cookie: cookie, Authorization: `Bearer ${sesion.token}` } }); assert.equal(r.status, 401); await r.json();
  assert.equal((await db.query("SELECT count(*)::int n FROM computadoras")).rows[0].n, 1);
});


test("reinicio real en produccion conserva cuentas y exige habilitacion vigente", async () => {
  // Solo la base efimera: adaptar su nombre observado, nunca conectar la real.
  const valores = { NODE_ENV: "production", REINICIO_ELECTORAL_HABILITADO: "true", REINICIO_ELECTORAL_BASE: "db_municipio_escolar" };
  const anteriores = Object.fromEntries(Object.keys(valores).map(k => [k, process.env[k]]));
  const adaptar = cliente => ({
    async query(...args) { const r = await cliente.query(...args); for (const fila of r.rows || []) if (Object.hasOwn(fila, "nombre_base")) fila.nombre_base = "db_municipio_escolar"; return r; },
    release() { cliente.release?.(); }
  });
  try {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    const pool = { query: (...args) => adaptar(entorno.pool).query(...args), connect: async () => adaptar(await entorno.pool.connect()) };
    Object.assign(process.env, valores);
    server = createApp({ pool, jwtSecret: secreto, puesto: { secure: false } }).listen(0, "127.0.0.1");
    await once(server, "listening"); url = 'http://127.0.0.1:' + server.address().port;
    const cuentas = (await db.query("SELECT * FROM administradores ORDER BY id")).rows;
    const consultores = (await db.query("SELECT * FROM consultores_resultados ORDER BY id")).rows;
    const migraciones = (await db.query("SELECT * FROM esquema_migraciones ORDER BY version")).rows;
    const equipos = (await db.query("SELECT * FROM computadoras ORDER BY id")).rows;
    const tablas = (await db.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")).rows;
    const previa = (await simular("reinicio_pruebas")).body; assert.equal(previa.bloqueada, false);
    process.env.REINICIO_ELECTORAL_HABILITADO = "false";
    assert.equal((await pedir("ejecutar", { body: { operacion: "reinicio_pruebas", simulacionId: previa.simulacionId, password, confirmacion: FRASE_REINICIO } })).status, 403);
    assert.equal((await conteos()).votos, 1);
    process.env.REINICIO_ELECTORAL_HABILITADO = "true";
    assert.equal((await ejecutar("reinicio_pruebas")).status, 200);
    assert.deepEqual(await conteos(), { estudiantes: 0, listas: 0, candidatos: 0, votos: 0 });
    assert.deepEqual((await db.query("SELECT * FROM administradores ORDER BY id")).rows, cuentas);
    assert.deepEqual((await db.query("SELECT * FROM consultores_resultados ORDER BY id")).rows, consultores);
    assert.deepEqual((await db.query("SELECT * FROM esquema_migraciones ORDER BY version")).rows, migraciones);
    assert.deepEqual((await db.query("SELECT * FROM computadoras ORDER BY id")).rows, equipos);
    assert.deepEqual((await db.query("SELECT tablename FROM pg_tables WHERE schemaname=current_schema() ORDER BY tablename")).rows, tablas);
    const a = (await db.query("SELECT detalle FROM auditoria_borrado_datos WHERE resultado='ejecutado'")).rows[0];
    assert.equal(a.detalle.autorizacion.tipo, "administrativa"); assert.equal(a.detalle.autorizacion.base, "db_municipio_escolar");
  } finally { for (const [k,v] of Object.entries(anteriores)) { if(v === undefined) delete process.env[k]; else process.env[k]=v; } }
});
