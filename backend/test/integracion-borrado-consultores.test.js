const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { readdir, readFile } = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const bcrypt = require("bcryptjs");
const writeExcelFile = require("write-excel-file/node");
const { crearEntorno } = require("../test-support/entorno-votacion-puesto");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { FRASE_REINICIO } = require("../services/borrado-datos.service");
const real = process.env.VALIDACION_PG_REAL === "true";
const directorio = path.join(__dirname, "../../database/migrations");
const password = "ClaveFicticiaValidacion!";
const variables = ["NODE_ENV", "BORRADO_DATOS_HABILITADO", "BORRADO_DATOS_DB_PRUEBAS"];
const previos = Object.fromEntries(variables.map(k => [k, process.env[k]]));
let entorno, db, server, url, admin, control, baseline, esquema, anteriores;
const cookies = [], sesiones = [];
let consultoresAntes, adminsAntes, pcsAntes;
const sha = texto => createHash("sha256").update(texto).digest("hex");
async function snapshotPublico() {
  const c = await control.connect();
  try {
    await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    assert.equal((await c.query("SELECT current_database() nombre")).rows[0].nombre, "db_municipio_escolar_pruebas");
    const tablas = (await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
    const huellas = [];
    for (const { tablename } of tablas) {
      const identificador = '"' + tablename.replaceAll('"', '""') + '"';
      const filas = (await c.query(`SELECT to_jsonb(t)::text dato FROM public.${identificador} t ORDER BY to_jsonb(t)::text`)).rows;
      huellas.push({ tabla: tablename, cantidad: filas.length, huella: sha(JSON.stringify(filas)) });
    }
    const columnas = (await c.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
    await c.query("COMMIT"); return { huellas, columnas };
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
async function prepararAnterior(pool) {
  // Solo el esquema recién creado o la instancia nueva en memoria.
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query("CREATE TABLE esquema_migraciones(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,aplicada_en TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const archivos = (await readdir(directorio)).filter(n => /^\d{3}_.*\.sql$/.test(n) && Number(n.slice(0, 3)) <= 11).sort();
    for (const nombre of archivos) {
      const sql = (await readFile(path.join(directorio, nombre), "utf8")).replace(/\r\n/g, "\n");
      await c.query(sql); await c.query("INSERT INTO esquema_migraciones(version,checksum) VALUES($1,$2)", [nombre, sha(sql)]);
    }
    await c.query("INSERT INTO administradores(usuario,password_hash) VALUES($1,$2)", ["admin-validacion", bcrypt.hashSync(password, 4)]);
    await c.query(`INSERT INTO estudiantes(codigo,nombre,grado,ya_voto) VALUES ('01234567','Anterior ficticio','3',TRUE),('12345678','Nuevo ficticio','3',FALSE);
      INSERT INTO listas(nombre) VALUES ('Lista ficticia'); INSERT INTO candidatos(nombre,lista_id) VALUES ('Candidata ficticia',1);
      INSERT INTO votos(lista_id) VALUES(1); INSERT INTO computadoras(identificador,nombre,grado) VALUES ('PC-01','Puesto ficticio A',3),('PC-02','Puesto ficticio B',3);`);
    anteriores = {};
    for (const tabla of ["estudiantes", "listas", "candidatos", "votos", "administradores", "computadoras"]) anteriores[tabla] = (await c.query(`SELECT * FROM ${tabla} ORDER BY id`)).rows;
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
before(async () => {
  if (real) {
    require("dotenv").config({ quiet: true });
    const { Pool } = require("pg");
    control = new Pool({ host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 5432),
      database: "db_municipio_escolar_pruebas", user: process.env.DB_USER, password: process.env.DB_PASSWORD,
      options: "-c default_transaction_read_only=on", connectionTimeoutMillis: 5000 });
    baseline = await snapshotPublico();
  }
  entorno = await crearEntorno({ real, antesDeMigrar: prepararAnterior }); db = entorno.db;
  esquema = (await db.query("SELECT current_schema() nombre")).rows[0].nombre;
  if (real) assert.match(esquema, /^prueba_votacion_puesto_[a-f0-9]{32}$/);
  process.env.NODE_ENV = "test"; process.env.BORRADO_DATOS_HABILITADO = "true";
  process.env.BORRADO_DATOS_DB_PRUEBAS = real ? "db_municipio_escolar_pruebas" : "postgres";
  server = createApp({ pool: entorno.pool, jwtSecret: "secreto-integracion-aislada-no-produccion-2026", puesto: { secure: false } }).listen(0, "127.0.0.1");
  await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  try {
    if (server) await new Promise(r => { server.close(r); server.closeAllConnections(); });
    await entorno?.cerrar();
    if (baseline) {
      assert.deepEqual(await snapshotPublico(), baseline, "El esquema público debe conservar exactamente sus tablas, columnas y datos");
      assert.equal((await control.query("SELECT to_regnamespace($1) IS NULL eliminado", [esquema])).rows[0].eliminado, true);
      console.log("Seguridad: esquema temporal eliminado; datos y columnas de todas las tablas públicas sin cambios.");
    }
  } finally {
    await control?.end();
    for (const k of variables) { if (previos[k] === undefined) delete process.env[k]; else process.env[k] = previos[k]; }
  }
});
async function pedir(ruta, { token = admin, method = "GET", body, cookie } = {}) {
  const r = await fetch(url + ruta, { method, headers: { Origin: "http://localhost:5173", "Content-Type": "application/json",
    "X-Consultor-CSRF": "1", "X-Borrado-CSRF": "1", "X-Puesto-CSRF": "1", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json(), cookie: r.headers.get("set-cookie") };
}
async function importar(nombre, dni) {
  const buffer = await writeExcelFile([["DNI", "Nombres", "Grado", "Sección"], [dni, nombre, 3, "A"]]).toBuffer();
  const body = new FormData(); body.append("archivo", new Blob([buffer]), "padron-ficticio.xlsx"); body.append('grado', '3'); body.append('modo', 'reemplazar');
  const r = await fetch(url + "/api/padron/previsualizar", { method: "POST", headers: { Authorization: `Bearer ${admin}`, Origin: 'http://localhost:5173', 'X-Padron-CSRF': '1' }, body });
  const vista = await r.json(); assert.equal(r.status, 200, JSON.stringify(vista));
  const confirmado = await fetch(url + '/api/padron/importar', { method: 'POST', headers: { Authorization: `Bearer ${admin}`, Origin: 'http://localhost:5173', 'X-Padron-CSRF': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ vistaPreviaId: vista.vistaPreviaId, confirmar: true }) });
  assert.equal(confirmado.status, 200, JSON.stringify(await confirmado.json()));
}
async function tablasIdentidad() {
  return { administradores: (await db.query("SELECT * FROM administradores ORDER BY id")).rows,
    consultores: (await db.query("SELECT * FROM consultores_resultados ORDER BY id")).rows,
    computadoras: (await db.query("SELECT * FROM computadoras ORDER BY id")).rows };
}
test("validación integral aislada de migraciones, consultores y reinicio electoral", async t => {
  await t.test("001–014 ordenadas conservan registros anteriores, checksums e idempotencia", async () => {
    assert.deepEqual(entorno.aplicadas, ["012_reinicio_electoral.sql", "013_consultores_resultados.sql", "014_importacion_padron_grados.sql"]);
    const registros = (await db.query("SELECT version,checksum FROM esquema_migraciones ORDER BY version")).rows;
    assert.equal(registros.length, 14);
    const fresco = await crearEntorno({ real });
    try {
      assert.deepEqual(fresco.aplicadas, registros.map(r => r.version), "El ejecutor instala 001–014 también desde cero");
      assert.deepEqual(await migrar(fresco.pool), []);
    } finally { await fresco.cerrar(); }
    for (const r of registros) assert.equal(r.checksum, sha((await readFile(path.join(directorio, r.version), "utf8")).replace(/\r\n/g, "\n")));
    assert.deepEqual(await migrar(entorno.pool), []);
    for (const tabla of Object.keys(anteriores)) {
      const actuales = (await db.query(`SELECT * FROM ${tabla} ORDER BY id`)).rows;
      if (tabla === "estudiantes") actuales.forEach(e => { assert.equal(e.origen_registro, "desconocido"); delete e.origen_registro; });
      assert.deepEqual(actuales, anteriores[tabla], tabla);
    }
    await assert.rejects(db.query("UPDATE estudiantes SET origen_registro='no_valido' WHERE id=1"), e => e.code === "23514");
    await assert.rejects(db.query("INSERT INTO votos(lista_id) VALUES(99999)"), e => e.code === "23503");
    await assert.rejects(db.query("INSERT INTO auditoria_consultores_resultados(administrador_id,consultor_id,accion) VALUES(1,99,'prueba')"), e => e.code === "23503");
  });
  await t.test("login administrativo real y creación de los dos consultores mediante API", async () => {
    const r = await pedir("/api/auth/login", { method: "POST", token: null, body: { usuario: "admin-validacion", password } });
    assert.equal(r.status, 200); admin = r.body.token;
    for (const id of [1, 2]) {
      const c = await pedir(`/api/consultores/administracion/${id}`, { method: "PUT", body: { usuario: `consulta${id}`, password, activo: true } });
      assert.equal(c.status, 200, JSON.stringify(c.body)); assert.ok(!JSON.stringify(c.body).includes("password_hash"));
      const login = await pedir("/api/consultores/login", { method: "POST", token: null, body: { usuario: `consulta${id}`, password } });
      assert.equal(login.status, 200); sesiones.push(login.body.token);
    }
    const cuentas = await pedir("/api/consultores/administracion"); assert.equal(cuentas.body.consultores.length, 2);
  });
  await t.test("tercera cuenta, duplicados y acceso administrativo de consultores rechazados", async () => {
    assert.equal((await pedir("/api/consultores/administracion/3", { method: "PUT", body: { usuario: "tercero", password, activo: true } })).status, 400);
    await assert.rejects(db.query("INSERT INTO consultores_resultados(id,usuario,password_hash,activo) VALUES(3,'tercero','solo_fixture',TRUE)"), e => e.code === "23514");
    assert.equal((await pedir("/api/consultores/administracion/2", { method: "PUT", body: { usuario: "CONSULTA1", activo: true } })).status, 409);
    for (const token of sesiones) for (const ruta of ["/api/resultados", "/api/consultores/administracion", "/api/borrado-datos/resumen", "/api/administradores"]) assert.equal((await pedir(ruta, { token })).status, 401);
  });
  await t.test("elección abierta: resultados administrativos, bloqueo de consultores y borrado", async () => {
    await db.query("UPDATE configuracion_votacion SET votacion_abierta=TRUE,automatica=FALSE");
    assert.equal((await pedir("/api/resultados")).body.resumen.votosEmitidos, 1);
    for (const token of sesiones) {
      const r = await pedir("/api/consultores/resultados", { token }); assert.equal(r.status, 403);
      assert.deepEqual(r.body, { mensaje: "Los resultados estarán disponibles cuando finalice la elección", codigo: "RESULTADOS_NO_PUBLICADOS" });
    }
    const s = await pedir("/api/borrado-datos/simulacion", { method: "POST", body: { operacion: "reinicio_pruebas" } });
    assert.equal(s.body.bloqueada, true);
    assert.equal((await pedir("/api/borrado-datos/ejecutar", { method: "POST", body: { operacion: "reinicio_pruebas", simulacionId: s.body.simulacionId, password, confirmacion: FRASE_REINICIO } })).status, 409);
  });
  await t.test("dos puestos vinculados emiten votos simultáneos; permanecen privados para consultores", async () => {
    await db.query("INSERT INTO estudiantes(codigo,nombre,grado) VALUES('22222222','Otro ficticio','3')");
    const estudiantes = ["12345678", "22222222"], tokens = [];
    for (const id of [1, 2]) {
      const a = await pedir(`/api/computadoras/${id}/autorizaciones`, { method: "POST", body: {} }); assert.equal(a.status, 201);
      const v = await pedir("/api/puesto/vincular", { method: "POST", token: null, body: { codigo: a.body.codigo } }); assert.equal(v.status, 201);
      const cookie = v.cookie.split(";")[0]; cookies.push(cookie);
      const s = await pedir("/api/puesto/identificar", { method: "POST", token: null, cookie, body: { dni: estudiantes[id - 1] } });
      assert.equal(s.status, 200); tokens.push(s.body.token);
    }
    const r = await Promise.all(cookies.map((cookie, i) => pedir("/api/puesto/votos", { method: "POST", token: tokens[i], cookie, body: { listaId: 1 } })));
    assert.deepEqual(r.map(x => x.status), [201, 201]);
    assert.equal((await pedir("/api/puesto/votos", { method: "POST", token: tokens[0], cookie: cookies[0], body: { listaId: 1 } })).status, 409);
    assert.equal((await pedir("/api/resultados")).body.resumen.votosEmitidos, 3);
    assert.equal((await pedir("/api/consultores/resultados", { token: sesiones[0] })).status, 403);
  });
  await t.test("publicación automática solo tras fin del horario; cierre manual y programación futura no publican", async () => {
    await db.query("UPDATE configuracion_votacion SET votacion_abierta=FALSE");
    assert.equal((await pedir("/api/consultores/resultados", { token: sesiones[0] })).status, 403);
    await db.query(`UPDATE configuracion_votacion SET automatica=TRUE,institucion='IE ficticia',ubicacion='Prueba',
      fecha_votacion=((clock_timestamp() AT TIME ZONE 'America/Lima')::date+1),
      anio_electoral=extract(year from (clock_timestamp() AT TIME ZONE 'America/Lima')::date+1),hora_inicio='08:00',hora_fin='16:00'`);
    assert.equal((await pedir("/api/consultores/resultados", { token: sesiones[0] })).status, 403);
    await db.query(`UPDATE configuracion_votacion SET fecha_votacion=((clock_timestamp() AT TIME ZONE 'America/Lima')::date-1),
      anio_electoral=extract(year from (clock_timestamp() AT TIME ZONE 'America/Lima')::date-1)`);
    for (const token of sesiones) {
      const r = await pedir("/api/consultores/resultados", { token }); assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.resumen.votosEmitidos, 3);
    }
  });
  await t.test("reinicio completo atómico conserva las identidades y revoca ambos puestos", async () => {
    ({ consultores: consultoresAntes, administradores: adminsAntes, computadoras: pcsAntes } = await tablasIdentidad());
    const s = await pedir("/api/borrado-datos/simulacion", { method: "POST", body: { operacion: "reinicio_pruebas" } }); assert.equal(s.body.bloqueada, false);
    const r = await pedir("/api/borrado-datos/ejecutar", { method: "POST", body: { operacion: "reinicio_pruebas", simulacionId: s.body.simulacionId, password, confirmacion: FRASE_REINICIO } });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.revocaciones.vinculaciones, 2);
    for (const tabla of ["estudiantes", "votos", "listas", "candidatos"]) assert.equal((await db.query(`SELECT count(*)::int n FROM ${tabla}`)).rows[0].n, 0);
    assert.deepEqual(await tablasIdentidad(), { consultores: consultoresAntes, administradores: adminsAntes, computadoras: pcsAntes });
    for (const cookie of cookies) assert.equal((await pedir("/api/puesto/estado", { cookie, token: null })).status, 401);
    for (const token of sesiones) assert.equal((await pedir("/api/consultores/resultados", { token })).status, 403);
    const auditoria = (await pedir("/api/borrado-datos/auditoria")).body.auditoria.find(a => a.resultado === "ejecutado");
    assert.equal(auditoria.administrador_usuario, "admin-validacion"); assert.equal(auditoria.cantidades.votos, 3);
  });
  await t.test("reimportación Excel y nueva candidatura no eliminan consultores y permiten otra elección", async () => {
    await importar("Padrón nuevo ficticio", "33333333");
    await importar("Padrón reemplazado ficticio", "44444444");
    assert.deepEqual((await db.query("SELECT codigo,origen_registro FROM estudiantes")).rows, [{ codigo: "44444444", origen_registro: "excel" }]);
    assert.deepEqual(await tablasIdentidad(), { consultores: consultoresAntes, administradores: adminsAntes, computadoras: pcsAntes });
    const body = new FormData();
    for (const [k, v] of Object.entries({ numeroLista: "2", nombreLista: "Lista posterior ficticia", candidatoAlcalde: "Nueva candidata ficticia", propuesta1: "Biblioteca" })) body.append(k, v);
    const r = await fetch(url + "/api/candidaturas", { method: "POST", headers: { Authorization: `Bearer ${admin}` }, body });
    assert.equal(r.status, 201, JSON.stringify(await r.json()));
    assert.equal((await pedir("/api/votacion/configuracion", { method: "PATCH", body: { votacionAbierta: true } })).status, 200);
    assert.equal((await pedir("/api/resultados")).status, 200);
    assert.equal((await pedir("/api/consultores/resultados", { token: sesiones[0] })).status, 403);
    assert.equal((await pedir("/api/puesto/identificar", { method: "POST", token: null, cookie: cookies[0], body: { dni: "44444444" } })).status, 401);
  });
});
