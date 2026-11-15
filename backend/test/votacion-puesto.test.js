const { before, beforeEach, afterEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const { crearEntorno } = require("../test-support/entorno-votacion-puesto");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");
const { gradoSecundaria } = require("../services/grado-secundaria");
let entorno, db, server, url, admin;
const secret = "pruebas-aisladas-votacion-puesto-no-produccion";
async function request(ruta, { method = "GET", body, cookie, token, headers = {} } = {}) {
  const r = await fetch(url + ruta, { method, headers: { Origin: "http://localhost:5173", "Content-Type": "application/json", "X-Puesto-CSRF": "1",
    ...(cookie ? { Cookie: cookie } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: await r.json(), cookie: r.headers.get("set-cookie"), cache: r.headers.get("cache-control") };
}
async function vincular(id = 1) {
  const autorizacion = await request(`/api/computadoras/${id}/autorizaciones`, { method: "POST", token: admin, body: {} });
  assert.equal(autorizacion.status, 201);
  const r = await request("/api/puesto/vincular", { method: "POST", body: { codigo: autorizacion.body.codigo } });
  assert.equal(r.status, 201); return r.cookie.split(";")[0];
}
const identificar = (cookie, dni = "01234567") => request("/api/puesto/identificar", { method: "POST", cookie, body: { dni } });
const votar = (cookie, token, listaId = 10) => request("/api/puesto/votos", { method: "POST", cookie, token, body: { listaId } });
const total = async () => (await db.query("SELECT count(*)::int AS n FROM votos")).rows[0].n;
before(async () => { entorno = await crearEntorno(); db = entorno.db; });
beforeEach(async () => {
  // Solo base en memoria o esquema aleatorio nuevo, nunca public de PostgreSQL instalado.
  await db.exec(`TRUNCATE vinculaciones_puesto,autorizaciones_puesto,computadoras,votos,candidatos,listas,estudiantes,administradores RESTART IDENTITY CASCADE;
    UPDATE configuracion_votacion SET votacion_abierta=TRUE,voto_blanco_habilitado=TRUE,automatica=FALSE;
    INSERT INTO administradores(usuario,password_hash) VALUES ('admin-fixture','solo-fixture');
    INSERT INTO computadoras(identificador,nombre,grado) VALUES ('PC-01','Aula A',3),('PC-02','Aula B',3),('PC-03','Aula C',2);
    INSERT INTO estudiantes(codigo,nombre,grado) VALUES ('01234567','Ana de prueba','3°'),('12345678','Bruno de prueba','3'),('33333333','Carla de prueba','2');
    INSERT INTO listas(id,nombre,logo_url) VALUES (10,'Lista A','/api/archivos/imagen.webp'),(20,'Lista B',NULL);
    INSERT INTO candidatos(nombre,lista_id,foto_url) VALUES ('Candidata A',10,'/api/archivos/foto.webp'),('Candidato B',20,NULL);`);
  admin = jwt.sign({ rol: "administrador", usuario: "admin-fixture", version_token: 0 }, secret, { issuer: JWT_ISSUER, audience: JWT_AUDIENCE, subject: "1", expiresIn: 3600 });
  server = createApp({ pool: entorno.pool, jwtSecret: secret, puesto: { secure: false } }).listen(0, "127.0.0.1");
  await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { if (server) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
after(async () => { if (entorno) await entorno.cerrar(); });

test("normaliza grados existentes sin aceptar texto arbitrario ni modificar el padrón", () => {
  for (const g of ["3", "3°", "3º", "3.º", "3° de secundaria", " 3 secundaria "]) assert.equal(gradoSecundaria(g), 3);
  for (const g of [null, "", "6", "primero", "3 primaria", "3 o 4", 3]) assert.equal(gradoSecundaria(g), null);
});
test("todos los endpoints del puesto exigen su cookie, incluso con JWT de estudiante", async () => {
  const token = jwt.sign({ rol: "estudiante" }, secret, { issuer: JWT_ISSUER, audience: STUDENT_JWT_AUDIENCE, subject: "1", expiresIn: 900 });
  for (const [ruta, method, body] of [["configuracion", "GET"], ["listas", "GET"], ["identificar", "POST", { dni: "01234567" }], ["votos", "POST", { listaId: 10 }]]) {
    const r = await request(`/api/puesto/${ruta}`, { method, body, token }); assert.equal(r.status, 401);
  }
  assert.equal(await total(), 0);
});
test("identificación vinculada, papeleta e imágenes reutilizadas y voto secreto", async () => {
  const cookie = await vincular();
  const s = await identificar(cookie); assert.equal(s.status, 200); assert.equal(s.body.estudiante.dni, "01234567");
  const claims = jwt.verify(s.body.token, secret); assert.equal(typeof claims.vinculacionId, "string");
  const listas = await request("/api/puesto/listas", { cookie, token: s.body.token });
  assert.equal(listas.status, 200); assert.equal(listas.body.listas[0].logoUrl, "/api/archivos/imagen.webp");
  assert.equal(listas.body.listas[0].candidatos[0].fotoUrl, "/api/archivos/foto.webp");
  const r = await votar(cookie, s.body.token); assert.equal(r.status, 201); assert.equal(r.cache, "no-store");
  assert.deepEqual(r.body, { mensaje: "Voto registrado correctamente.", sesionFinalizada: true });
  assert.deepEqual((await db.query("SELECT lista_id,candidato_id FROM votos")).rows, [{ lista_id: 10, candidato_id: null }]);
  const columnas = (await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='votos' AND table_schema=current_schema()")).rows.map(r => r.column_name);
  assert.ok(!columnas.includes("estudiante_id") && !columnas.includes("computadora_id"));
});
test("rechaza grado incorrecto, campos falsificados y cambio de grado después de identificar", async () => {
  const cookie = await vincular(); assert.equal((await identificar(cookie, "33333333")).status, 403);
  assert.equal((await request("/api/puesto/identificar", { method: "POST", cookie, body: { dni: "33333333", grado: 3 } })).status, 400);
  const s = await identificar(cookie);
  await db.query("UPDATE computadoras SET grado=2 WHERE id=1");
  assert.equal((await votar(cookie, s.body.token)).status, 403); assert.equal(await total(), 0);
});
test("un token no se puede trasladar a otro puesto ni reutilizar tras revocar y volver a vincular", async () => {
  const a = await vincular(1), b = await vincular(2); const s = await identificar(a);
  const antiguo = jwt.sign({ rol: "estudiante" }, secret, { issuer: JWT_ISSUER, audience: STUDENT_JWT_AUDIENCE, subject: "1", expiresIn: 900 });
  assert.equal((await votar(a, antiguo)).status, 401);
  assert.equal((await votar(b, s.body.token)).status, 401);
  await request("/api/computadoras/1/revocar", { method: "POST", token: admin, body: {} });
  const nuevo = await vincular(1);
  assert.equal((await votar(nuevo, s.body.token)).status, 401); assert.equal(await total(), 0);
});
test("puesto revocado, deshabilitado o vencido bloquea lecturas y voto", async () => {
  for (const [id, modo, dni] of [[1, "revocado", "01234567"], [2, "deshabilitado", "12345678"], [3, "vencido", "33333333"]]) {
    const cookie = await vincular(id), s = await identificar(cookie, dni); assert.equal(s.status, 200);
    if (modo === "revocado") await request(`/api/computadoras/${id}/revocar`, { method: "POST", token: admin, body: {} });
    else if (modo === "deshabilitado") await db.query("UPDATE computadoras SET activo=FALSE WHERE id=$1", [id]);
    else await db.query("UPDATE vinculaciones_puesto SET vinculada_en=clock_timestamp()-interval '13 hours',vence_en=clock_timestamp()-interval '1 minute' WHERE computadora_id=$1", [id]);
    for (const ruta of ["configuracion", "listas"]) assert.equal((await request(`/api/puesto/${ruta}`, { cookie, token: s.body.token })).status, 401);
    assert.equal((await votar(cookie, s.body.token)).status, 401);
  }
  assert.equal(await total(), 0);
});
test("estudiante inactivo o que ya votó no recupera una papeleta utilizable", async () => {
  const cookie = await vincular(), s = await identificar(cookie);
  assert.equal((await votar(cookie, s.body.token)).status, 201);
  assert.equal((await identificar(cookie)).status, 409);
  assert.equal((await request("/api/puesto/listas", { cookie, token: s.body.token })).status, 409);
  assert.equal((await votar(cookie, s.body.token)).status, 409);
  await db.query("UPDATE estudiantes SET activo=FALSE WHERE codigo='12345678'");
  assert.equal((await identificar(cookie, "12345678")).status, 401);
  assert.equal(await total(), 1);
});
test("dos solicitudes simultáneas del mismo estudiante registran exactamente un voto", async () => {
  const cookie = await vincular(), s = await identificar(cookie);
  const r = await Promise.all([votar(cookie, s.body.token, 10), votar(cookie, s.body.token, 20)]);
  assert.deepEqual(r.map(r => r.status).sort(), [201, 409]); assert.equal(await total(), 1);
});
test("dos puestos del mismo grado votan simultáneamente por estudiantes distintos", async () => {
  const a = await vincular(1), b = await vincular(2);
  const [sa, sb] = await Promise.all([identificar(a), identificar(b, "12345678")]);
  const r = await Promise.all([votar(a, sa.body.token), votar(b, sb.body.token, null)]);
  assert.deepEqual(r.map(r => r.status), [201, 201]); assert.equal(await total(), 2);
});
test("voto en blanco respeta la configuración y una lista inexistente revierte ya_voto", async () => {
  const cookie = await vincular(), s = await identificar(cookie);
  await db.query("UPDATE configuracion_votacion SET voto_blanco_habilitado=FALSE");
  assert.equal((await votar(cookie, s.body.token, null)).status, 409);
  assert.equal((await votar(cookie, s.body.token, 999)).status, 400);
  assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id=1")).rows[0].ya_voto, false);
  await db.query("UPDATE configuracion_votacion SET voto_blanco_habilitado=TRUE");
  assert.equal((await votar(cookie, s.body.token, null)).status, 201);
});
test("cierre entre identificación y confirmación impide registrar el voto", async () => {
  const cookie = await vincular(), s = await identificar(cookie);
  await db.query("UPDATE configuracion_votacion SET votacion_abierta=FALSE");
  assert.equal((await identificar(cookie, "12345678")).status, 409);
  assert.equal((await request("/api/puesto/configuracion", { cookie })).body.votacionAbierta, false);
  assert.equal((await votar(cookie, s.body.token)).status, 409); assert.equal(await total(), 0);
});
test("la aplicación real bloquea rutas antiguas aun con cookie y token válidos", async () => {
  const cookie = await vincular(), s = await identificar(cookie);
  for (const [ruta, method, body] of [["/api/auth/estudiante", "POST", { dni: "01234567" }], ["/api/listas", "GET"], ["/api/votos", "POST", { listaId: 10 }]]) {
    const r = await request(ruta, { method, body, cookie, token: s.body.token });
    assert.equal(r.status, 401); assert.equal(r.body.codigo, "RUTA_REEMPLAZADA");
  }
  assert.equal(await total(), 0);
});
test("CSRF y campos adicionales no permiten falsificar identidad o equipo", async () => {
  const cookie = await vincular(), s = await identificar(cookie);
  for (const headers of [{ Origin: "" }, { Origin: "http://ajeno:5173" }, { "X-Puesto-CSRF": "" }, { "Content-Type": "text/plain" }]) {
    assert.equal((await request("/api/puesto/votos", { method: "POST", cookie, token: s.body.token, body: { listaId: 10 }, headers })).status, 403);
  }
  assert.equal((await request("/api/puesto/votos", { method: "POST", cookie, token: s.body.token, body: { listaId: 10, estudianteId: 2, computadoraId: 1 } })).status, 400);
  assert.equal(await total(), 0);
});
test("cookie y JWT de estudiante no abren resultados ni funciones administrativas", async () => {
  const cookie = await vincular(), s = await identificar(cookie);
  for (const ruta of ["/api/resultados", "/api/computadoras", "/api/auth/me", "/api/administradores"]) assert.equal((await request(ruta, { cookie, token: s.body.token })).status, 401);
  assert.equal((await request("/api/puesto/votos", { method: "POST", cookie, token: admin, body: { listaId: 10 } })).status, 401);
});
test("revocación concurrente con voto tiene un orden consistente y no habilita votos posteriores", async () => {
  const cookie = await vincular(), s = await identificar(cookie);
  const [voto, revocado] = await Promise.all([votar(cookie, s.body.token), request("/api/computadoras/1/revocar", { method: "POST", token: admin, body: {} })]);
  assert.ok([201, 401].includes(voto.status)); assert.equal(revocado.status, 200);
  assert.equal((await votar(cookie, s.body.token)).status, 401);
  assert.equal(await total(), voto.status === 201 ? 1 : 0);
});
