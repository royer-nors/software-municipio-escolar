const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readdir, rm } = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const bcrypt = require("bcryptjs");
const sharp = require("sharp");
const { PGlite } = require("@electric-sql/pglite");
const { migrar } = require("../database/migrar");
const { createLegacyRouterHarness: createApp } = require("../test-support/legacy-router-harness");
const { createImagenesStorage, normalizarImagen } = require("../services/imagenes-listas");
let db, carpeta, storage, server, url, token, png;
const pool = {
  query: (sql, values) => db.query(sql, values),
  async connect() { return { async query(sql, values) { return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values); }, release() {} }; },
};
function app() { return createApp({ pool, jwtSecret: "secreto-candidaturas-aislado-no-usar-en-produccion", imagenesStorage: storage }); }
before(async () => {
  db = await PGlite.create();
  carpeta = await mkdtemp(path.join(os.tmpdir(), "municipio-imagenes-test-"));
  storage = createImagenesStorage(carpeta);
  await migrar(pool);
  await db.query("INSERT INTO administradores(usuario,password_hash) VALUES ($1,$2)", ["admin", bcrypt.hashSync("ClaveSoloPruebas", 4)]);
  server = app().listen(0, "127.0.0.1"); await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(url + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "admin", password: "ClaveSoloPruebas" }) });
  token = (await login.json()).token;
  png = await sharp({ create: { width: 30, height: 30, channels: 3, background: "#1255aa" } }).png().toBuffer();
});
beforeEach(async () => {
  await db.exec("TRUNCATE votos, candidatos, listas, estudiantes RESTART IDENTITY CASCADE; UPDATE configuracion_votacion SET votacion_abierta=FALSE WHERE id=1;");
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.close();
  // Solo la carpeta efímera creada por esta prueba.
  if (carpeta && path.dirname(carpeta) === path.resolve(os.tmpdir()) && path.basename(carpeta).startsWith("municipio-imagenes-test-")) await rm(carpeta, { recursive: true, force: true });
});
async function registrar({ credencial = token, numero = "7", nombre = "Lista real en memoria", imagen = png, mime = "image/png", filename = "logo.png" } = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries({ numeroLista: numero, nombreLista: nombre, candidatoAlcalde: "Candidata de prueba", propuesta1: "Mejorar la biblioteca", propuesta2: "" })) body.append(k, v);
  body.append("logo", new Blob([imagen], { type: mime }), filename);
  body.append("foto", new Blob([png], { type: "image/png" }), "foto.png");
  const response = await fetch(url + "/api/candidaturas", { method: "POST", headers: credencial ? { Authorization: `Bearer ${credencial}` } : {}, body });
  return { status: response.status, body: await response.json() };
}
test("guarda lista y candidato relacionados y recupera dos imágenes diferentes", async () => {
  const result = await registrar();
  assert.equal(result.status, 201, JSON.stringify(result.body));
  const lista = result.body.lista;
  assert.equal(lista.numero, 7);
  assert.notEqual(lista.logo_url, lista.candidatos[0].foto_url);
  assert.equal((await db.query("SELECT lista_id FROM candidatos")).rows[0].lista_id, lista.id);
  const imagen = await fetch(url + lista.logo_url);
  assert.equal(imagen.status, 200);
  assert.equal(imagen.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await sharp(Buffer.from(await imagen.arrayBuffer())).metadata()).format, "webp");
});
test("las referencias sobreviven a recrear la aplicación y aparecen en papeleta y resultados", async () => {
  const registro = await registrar();
  await db.query("INSERT INTO estudiantes(codigo,nombre) VALUES ('01234567','Estudiante de prueba')");
  const login = await fetch(url + "/api/auth/estudiante", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dni: "01234567" }) });
  const estudiante = (await login.json()).token;
  await new Promise(resolve => server.close(resolve));
  server = app().listen(0, "127.0.0.1"); await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(url + registro.body.lista.logo_url)).status, 200);
  const papeleta = await (await fetch(url + "/api/listas", { headers: { Authorization: `Bearer ${estudiante}` } })).json();
  assert.equal(papeleta.listas[0].logoUrl, registro.body.lista.logo_url);
  assert.equal(papeleta.listas[0].candidatos[0].nombre, "Candidata de prueba");
  assert.deepEqual(papeleta.listas[0].propuestas, ["Mejorar la biblioteca"]);
  const resultados = await (await fetch(url + "/api/resultados", { headers: { Authorization: `Bearer ${token}` } })).json();
  assert.equal(resultados.listas[0].candidatos[0].fotoUrl, registro.body.lista.candidatos[0].foto_url);
  assert.equal(resultados.listas[0].votos, 0);
});
test("rechaza falta de JWT administrativo antes de guardar archivos", async () => {
  const previos = (await readdir(carpeta)).length;
  assert.equal((await registrar({ credencial: null })).status, 401);
  const login = await db.query("INSERT INTO estudiantes(codigo,nombre) VALUES ('12345678','Solo estudiante') RETURNING id");
  assert.ok(login.rows[0].id);
  const res = await fetch(url + "/api/auth/estudiante", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dni: "12345678" }) });
  assert.equal((await registrar({ credencial: (await res.json()).token })).status, 401);
  assert.equal((await readdir(carpeta)).length, previos);
});
test("rechaza número duplicado, revierte la lista y limpia archivos de esa petición", async () => {
  assert.equal((await registrar()).status, 201);
  const total = (await readdir(carpeta)).length;
  assert.equal((await registrar({ nombre: "Otro nombre" })).status, 409);
  assert.equal((await readdir(carpeta)).length, total);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM listas")).rows[0].total, 1);
});
test("un fallo del candidato revierte también la lista y las imágenes", async () => {
  const total = (await readdir(carpeta)).length;
  await db.exec("CREATE FUNCTION fallo_candidatura() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Fallo controlado'; END; $$; CREATE TRIGGER fallo_candidatura BEFORE INSERT ON candidatos FOR EACH ROW EXECUTE FUNCTION fallo_candidatura();");
  try {
    assert.equal((await registrar()).status, 503);
    assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM listas")).rows[0].total, 0);
    assert.equal((await readdir(carpeta)).length, total);
  } finally { await db.exec("DROP TRIGGER fallo_candidatura ON candidatos; DROP FUNCTION fallo_candidatura();"); }
});
test("rechaza archivos falsificados, truncados, formatos y tamaños inválidos", async () => {
  assert.equal((await registrar({ imagen: Buffer.from('<script>alert(1)</script>') })).status, 400);
  assert.equal((await registrar({ imagen: png.subarray(0, 12) })).status, 400);
  assert.equal((await registrar({ filename: "imagen.svg", mime: "image/svg+xml" })).status, 400);
  assert.equal((await registrar({ mime: "image/jpeg" })).status, 400);
  assert.equal((await registrar({ imagen: Buffer.alloc(2 * 1024 * 1024 + 1) })).status, 413);
  const enorme = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: "#fff" } }).png().toBuffer();
  await assert.rejects(normalizarImagen({ originalname: "enorme.png", mimetype: "image/png", buffer: enorme }), /dimensiones/);
  assert.equal((await fetch(url + "/api/archivos/no-es-un-uuid.webp")).status, 404);
});
test("acepta JPG y WebP reales, y bloquea el registro cuando la elección está abierta", async () => {
  for (const format of ["jpeg", "webp"]) {
    const buffer = await sharp(png).toFormat(format).toBuffer();
    assert.ok(await normalizarImagen({ originalname: `foto.${format}`, mimetype: `image/${format}`, buffer }));
  }
  await db.exec("UPDATE configuracion_votacion SET votacion_abierta=TRUE WHERE id=1");
  assert.equal((await registrar()).status, 409);
});
