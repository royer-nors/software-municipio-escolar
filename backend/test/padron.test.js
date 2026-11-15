const { before, beforeEach, afterEach, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');
const writeExcelFile = require('write-excel-file/node');
const { crearEntorno } = require('../test-support/entorno-votacion-puesto');
const { createApp } = require('../app');
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require('../config/auth');
const { leerPadronExcel, MAX_ARCHIVO_BYTES, MAX_ESTUDIANTES } = require('../services/padron-excel');
const { validarGrado } = require('../repositories/votacion-puesto.repository');
let entorno, db, server, url;
const secreto = 'padron-por-grados-solo-pruebas-aisladas-2026';
const excel = filas => writeExcelFile(filas).toBuffer();
function token(id = 1, rol = 'administrador') { return jwt.sign({ usuario: 'admin', rol, version_token: 0 }, secreto,
  { subject: String(id), issuer: JWT_ISSUER, audience: rol === 'administrador' ? JWT_AUDIENCE : STUDENT_JWT_AUDIENCE, expiresIn: 900 }); }
async function enviar(ruta, { body, credential = token(), headers = {} } = {}) {
  const r = await fetch(url + '/api/padron/' + ruta, { method: 'POST', headers: { Authorization: `Bearer ${credential}`, Origin: 'http://localhost:5173', 'X-Padron-CSRF': '1',
    ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body instanceof FormData ? body : JSON.stringify(body) });
  return { status: r.status, body: await r.json(), cache: r.headers.get('cache-control') };
}
async function vista({ grado = 3, modo = 'agregar', filas, buffer, credential, headers, extra, nombre = 'padron.xlsx' } = {}) {
  const body = new FormData(); body.append('grado', String(grado)); body.append('modo', modo);
  if (buffer !== null) body.append('archivo', new Blob([buffer || await excel(filas || [['DNI', 'Nombre completo', 'Grado', 'Sección'], ['01234567', 'Estudiante ficticio', grado, 'A']])]), nombre);
  if (extra) body.append('otro', 'rechazar');
  return enviar('previsualizar', { body, credential, headers });
}
const confirmar = (id, opciones = {}) => enviar('importar', { body: { vistaPreviaId: id, confirmar: true }, ...opciones });
const padron = async () => (await db.query('SELECT * FROM estudiantes ORDER BY id')).rows;
async function identidad() {
  const r = {};
  for (const tabla of ['administradores', 'consultores_resultados', 'listas', 'candidatos', 'configuracion_votacion', 'computadoras']) r[tabla] = (await db.query(`SELECT * FROM ${tabla} ORDER BY id`)).rows;
  return r;
}
before(async () => {
  entorno = await crearEntorno({ real: false }); db = entorno.db;
  await db.query("UPDATE consultores_resultados SET usuario='consulta'||id,password_hash='hash-ficticio',activo=TRUE");
});
beforeEach(async () => {
  await db.exec(`TRUNCATE auditoria_importaciones_padron,vistas_previas_padron,votos,candidatos,listas,estudiantes,administradores RESTART IDENTITY CASCADE;
    UPDATE configuracion_votacion SET votacion_abierta=FALSE,automatica=FALSE,fecha_votacion=NULL,hora_inicio=NULL,hora_fin=NULL,anio_electoral=NULL;
    INSERT INTO administradores(usuario,password_hash) VALUES('admin','fixture'),('otro','fixture');
    INSERT INTO estudiantes(codigo,nombre,grado,seccion,origen_registro)
      VALUES('11111111','Uno','1°','A','manual'),('22222222','Dos','2','A','manual'),('33333333','Tres','3','A','manual'),('44444444','Cuatro','4','A','manual'),('55555555','Cinco','5','A','manual');
    INSERT INTO listas(id,nombre) VALUES(10,'Lista ficticia'); INSERT INTO candidatos(nombre,lista_id) VALUES('Candidata ficticia',10);`);
  server = createApp({ pool: entorno.pool, jwtSecret: secreto, puesto: { secure: false } }).listen(0, '127.0.0.1');
  await once(server, 'listening'); url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); }); });
after(async () => { await entorno?.cerrar(); });

test('carga sucesiva de los cinco grados conserva todos los demás grados y sus identidades', async () => {
  const anteriores = await padron(), cuentas = await identidad();
  for (let grado = 1; grado <= 5; grado++) {
    const s = await vista({ grado, filas: [['DNI', 'Nombres', 'Sección'], [String(10000000 + grado), `Nuevo ${grado}`, 'B']] });
    assert.equal(s.status, 200, JSON.stringify(s.body)); assert.equal(s.cache, 'no-store');
    assert.equal(s.body.estudiantes[0].grado, String(grado)); assert.equal(s.body.cantidades.agregados, 1);
    const r = await confirmar(s.body.vistaPreviaId); assert.equal(r.status, 200, JSON.stringify(r.body));
    validarGrado(s.body.estudiantes[0], { grado });
    assert.throws(() => validarGrado(s.body.estudiantes[0], { grado: grado === 5 ? 1 : grado + 1 }), e => e.status === 403);
  }
  const actuales = await padron(); assert.equal(actuales.length, 10);
  assert.deepEqual(actuales.filter(e => e.id <= 5), anteriores); assert.deepEqual(await identidad(), cuentas);
  await db.query('UPDATE configuracion_votacion SET votacion_abierta=TRUE');
  for (let grado = 1; grado <= 5; grado++) {
    const pc = (await db.query('INSERT INTO computadoras(identificador,nombre,grado) VALUES($1,$2,$3) RETURNING id', [`PC-${grado}`, 'Puesto ficticio', grado])).rows[0];
    const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json', 'X-Puesto-CSRF': '1', Authorization: `Bearer ${token()}` };
    let r = await fetch(`${url}/api/computadoras/${pc.id}/autorizaciones`, { method: 'POST', headers, body: '{}' }); const autorizacion = await r.json(); assert.equal(r.status, 201);
    r = await fetch(`${url}/api/puesto/vincular`, { method: 'POST', headers, body: JSON.stringify({ codigo: autorizacion.codigo }) }); assert.equal(r.status, 201); const cookie = r.headers.get('set-cookie').split(';')[0]; await r.json();
    r = await fetch(`${url}/api/puesto/identificar`, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ dni: String(10000000 + grado) }) }); const estudiante = await r.json(); assert.equal(r.status, 200);
    r = await fetch(`${url}/api/puesto/votos`, { method: 'POST', headers: { ...headers, Cookie: cookie, Authorization: `Bearer ${estudiante.token}` }, body: JSON.stringify({ listaId: 10 }) }); assert.equal(r.status, 201); await r.json();
  }
  assert.equal((await db.query('SELECT count(*)::int n FROM votos')).rows[0].n, 5);
});
test('reemplazo selectivo muestra cantidades exactas, conserva IDs existentes y otros cuatro grados', async () => {
  await db.query("INSERT INTO estudiantes(codigo,nombre,grado) VALUES('33333334','Sale de tercero','3º')");
  const antes = await padron(), cuentas = await identidad();
  const s = await vista({ modo: 'reemplazar', filas: [['DNI', 'Nombres', 'Apellidos', 'Grado', 'Sección'], ['33333333', 'Nombre', 'Actualizado', '3.º', 'B'], ['01234567', 'Nuevo', 'Tercero', 3, 'A']] });
  assert.equal(s.status, 200); assert.deepEqual(s.body.cantidades, { agregados: 1, actualizados: 1, eliminados: 1, sinCambios: 0 });
  assert.deepEqual(await padron(), antes, 'la vista previa no cambia estudiantes');
  assert.equal(s.body.eliminados[0].dni, '33333334');
  assert.equal((await confirmar(s.body.vistaPreviaId)).status, 200);
  const despues = await padron(); assert.deepEqual(despues.filter(e => e.grado !== '3'), antes.filter(e => !['3', '3º'].includes(e.grado)));
  const actualizado = despues.find(e => e.codigo === '33333333'); assert.equal(actualizado.id, 3); assert.equal(actualizado.nombre, 'Nombre Actualizado');
  assert.deepEqual(await identidad(), cuentas);
  const audit = (await db.query('SELECT cantidades,administrador_usuario FROM auditoria_importaciones_padron')).rows[0];
  assert.equal(audit.administrador_usuario, 'admin'); assert.deepEqual(audit.cantidades, s.body.cantidades);
  assert.equal((await db.query('SELECT estudiantes FROM vistas_previas_padron WHERE id=$1', [s.body.vistaPreviaId])).rows[0].estudiantes, null);
});
test('duplicados internos y contra otros grados o grados históricos desconocidos se rechazan', async () => {
  const antes = await padron();
  for (const filas of [
    [['DNI', 'Nombres'], ['01234567', 'A'], ['01234567', 'B']],
    [['DNI', 'Nombres'], ['22222222', 'Está en segundo']],
    [['DNI', 'Nombres'], ['33333333', 'Ya existe en tercero']],
  ]) assert.equal((await vista({ filas })).status, 422);
  await db.query("UPDATE estudiantes SET grado=NULL WHERE codigo='22222222'");
  assert.equal((await vista({ filas: [['DNI', 'Nombres'], ['22222222', 'Desconocido']] })).status, 422);
  assert.deepEqual((await padron()).filter(e => e.id !== 2), antes.filter(e => e.id !== 2));
});
test('valida grado elegido, columna Grado y ausencia: nunca reasigna grados silenciosamente', async () => {
  for (const grado of [0, 6, '', '3 o 4']) assert.equal((await vista({ grado })).status, 400);
  for (const valor of [0, 6, '', 'primero', '2', '3 primaria']) assert.equal((await vista({ filas: [['DNI', 'Nombres', 'Grado'], ['01234567', 'Prueba', valor]] })).status, 422);
  const s = await vista({ filas: [['DNI', 'Nombre completo'], ['01234567', 'Prueba']] }); assert.equal(s.status, 200); assert.equal(s.body.estudiantes[0].grado, '3');
});
test('impide previsualizar o confirmar con elección abierta manual o automáticamente', async () => {
  const antes = await padron(), s = await vista();
  await db.query('UPDATE configuracion_votacion SET votacion_abierta=TRUE');
  assert.equal((await vista()).status, 409); assert.equal((await confirmar(s.body.vistaPreviaId)).status, 409);
  await db.query(`UPDATE configuracion_votacion SET votacion_abierta=FALSE,automatica=TRUE,institucion='IE',ubicacion='Prueba',fecha_votacion=(clock_timestamp() AT TIME ZONE 'America/Lima')::date,
    anio_electoral=extract(year from clock_timestamp() AT TIME ZONE 'America/Lima'),hora_inicio='00:00',hora_fin='24:00'`);
  assert.equal((await vista()).status, 409); assert.deepEqual(await padron(), antes);
});
test('votos y marcas de participación de cualquier grado bloquean carga y reemplazo sin borrarlos', async () => {
  const s = await vista(); await db.query('INSERT INTO votos(lista_id) VALUES(10)');
  assert.equal((await vista()).status, 409); assert.equal((await confirmar(s.body.vistaPreviaId)).status, 409);
  assert.equal((await db.query('SELECT count(*)::int n FROM votos')).rows[0].n, 1);
});
test('una marca ya_voto aislada también bloquea aun sin votos', async () => {
  await db.query('UPDATE estudiantes SET ya_voto=TRUE WHERE id=1');
  assert.equal((await vista({ grado: 5 })).status, 409); assert.equal((await db.query('SELECT ya_voto FROM estudiantes WHERE id=1')).rows[0].ya_voto, true);
});
test('vista previa propia, vigente, de un solo uso e invalidada si cambian registros o configuración', async () => {
  let s = await vista(); assert.equal((await confirmar(s.body.vistaPreviaId, { credential: token(2) })).status, 409);
  await db.query("UPDATE vistas_previas_padron SET creada_en=clock_timestamp()-interval '11 minutes',vence_en=clock_timestamp()-interval '1 minute' WHERE id=$1", [s.body.vistaPreviaId]);
  assert.equal((await confirmar(s.body.vistaPreviaId)).status, 409);
  s = await vista(); await db.query("UPDATE estudiantes SET nombre='Cambio mismo conteo' WHERE id=1"); assert.equal((await confirmar(s.body.vistaPreviaId)).status, 409);
  s = await vista(); await db.query('UPDATE configuracion_votacion SET revision=revision+1'); assert.equal((await confirmar(s.body.vistaPreviaId)).status, 409);
  s = await vista(); const otra = await vista(); assert.equal((await confirmar(s.body.vistaPreviaId)).status, 409);
  assert.equal((await confirmar(otra.body.vistaPreviaId)).status, 200); assert.equal((await confirmar(otra.body.vistaPreviaId)).status, 409);
});
test('dos confirmaciones simultáneas realizan una sola carga y una sola auditoría', async () => {
  const s = await vista(); const r = await Promise.all([confirmar(s.body.vistaPreviaId), confirmar(s.body.vistaPreviaId)]);
  assert.deepEqual(r.map(e => e.status).sort(), [200, 409]); assert.equal((await db.query('SELECT count(*)::int n FROM auditoria_importaciones_padron')).rows[0].n, 1);
});
test('fallo de auditoría revierte altas, cambios, bajas y consumo de vista previa', async () => {
  const antes = await padron(), s = await vista({ modo: 'reemplazar' });
  await db.exec("CREATE FUNCTION fallo_importacion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fallo ficticio'; END $$; CREATE TRIGGER fallo_importacion BEFORE INSERT ON auditoria_importaciones_padron FOR EACH ROW EXECUTE FUNCTION fallo_importacion();");
  try {
    assert.equal((await confirmar(s.body.vistaPreviaId)).status, 503); assert.deepEqual(await padron(), antes);
    assert.equal((await db.query('SELECT consumida_en FROM vistas_previas_padron WHERE id=$1', [s.body.vistaPreviaId])).rows[0].consumida_en, null);
  } finally { await db.exec('DROP TRIGGER fallo_importacion ON auditoria_importaciones_padron; DROP FUNCTION fallo_importacion();'); }
});
test('JWT administrativo, Origin permitido y CSRF son obligatorios; endpoint global antiguo no importa', async () => {
  const antes = await padron();
  for (const credential of ['invalido', token(1, 'estudiante')]) assert.equal((await vista({ credential })).status, 401);
  for (const headers of [{ Origin: '' }, { Origin: 'null' }, { 'X-Padron-CSRF': '' }]) assert.equal((await vista({ headers })).status, 403);
  assert.equal((await enviar('importar', { body: new FormData() })).status, 400);
  assert.equal((await enviar('importar', { body: { grado: 3, estudiantes: [] } })).status, 400);
  assert.deepEqual(await padron(), antes);
});
test('conserva validaciones de archivo, campos, encabezados, DNI, límites y nombres', async () => {
  for (const opciones of [{ buffer: null }, { buffer: Buffer.from('no-excel') }, { nombre: 'archivo.csv' }, { extra: true }, { buffer: Buffer.alloc(MAX_ARCHIVO_BYTES + 1) }]) assert.ok((await vista(opciones)).status >= 400);
  for (const filas of [[], [['DNI', 'Nombres']], [['Otra', 'Nombres'], ['01234567', 'A']], [['DNI', 'Nombres'], ['123', 'A']], [['DNI', 'Nombres'], ['01234567', 'a'.repeat(101)]]]) assert.ok((await vista({ filas })).status >= 400);
  const filas = [['DNI', 'Nombres']]; for (let i = 0; i <= MAX_ESTUDIANTES; i++) filas.push([String(10000000 + i), 'Nombre']);
  await assert.rejects(leerPadronExcel(await excel(filas), 3), e => e.status === 422);
});
test('el límite de fallos protege la carga y no elimina la vista previa ni el padrón', async () => {
  const antes = await padron();
  for (let n = 0; n < 20; n++) assert.equal((await enviar('importar', { body: {} })).status, 400);
  assert.equal((await enviar('importar', { body: {} })).status, 429); assert.deepEqual(await padron(), antes);
});
test('plantilla descargable compatible con cualquiera de los cinco grados y sección conservada', async () => {
  const buffer = await require('node:fs/promises').readFile(require('node:path').join(__dirname, '../../frontend/public/plantilla_padron_por_grado.xlsx'));
  for (let grado = 1; grado <= 5; grado++) {
    const filas = await leerPadronExcel(buffer, grado);
    assert.equal(filas[0].grado, String(grado)); assert.equal(filas[0].seccion, 'A'); assert.equal(filas[0].dni, '01234567');
  }
});
test('una apertura durante las escrituras revierte la carga al volver a comprobar el estado', async () => {
  const antes = await padron(), s = await vista();
  await db.exec("CREATE FUNCTION abrir_durante_carga() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE configuracion_votacion SET votacion_abierta=TRUE; RETURN NEW; END $$; CREATE TRIGGER abrir_durante_carga BEFORE INSERT ON estudiantes FOR EACH ROW EXECUTE FUNCTION abrir_durante_carga();");
  try {
    assert.equal((await confirmar(s.body.vistaPreviaId)).status, 409); assert.deepEqual(await padron(), antes);
    assert.equal((await db.query('SELECT votacion_abierta FROM configuracion_votacion')).rows[0].votacion_abierta, false);
  } finally { await db.exec('DROP TRIGGER abrir_durante_carga ON estudiantes; DROP FUNCTION abrir_durante_carga();'); }
});
test('reemplazar no reactiva estudiantes deshabilitados ni cambia su identidad', async () => {
  await db.query('UPDATE estudiantes SET activo=FALSE WHERE id=3');
  const s = await vista({ modo: 'reemplazar', filas: [['DNI', 'Nombres'], ['33333333', 'Nombre actualizado']] });
  assert.equal((await confirmar(s.body.vistaPreviaId)).status, 200);
  const e = (await db.query('SELECT id,activo,ya_voto FROM estudiantes WHERE codigo=$1', ['33333333'])).rows[0];
  assert.deepEqual(e, { id: 3, activo: false, ya_voto: false });
});
