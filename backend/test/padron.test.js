const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { PGlite } = require("@electric-sql/pglite");
const writeExcelFile = require("write-excel-file/node");
const jwt = require("jsonwebtoken");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");
const { leerPadronExcel, MAX_ARCHIVO_BYTES, MAX_ESTUDIANTES } = require("../services/padron-excel");
const secret = "secreto-de-pruebas-padron-no-usar-en-produccion";
let db, server, url, consultas = 0;
const pool = {
  async query(sql, values) { consultas++; return db.query(sql, values); },
  async connect() {
    return { async query(sql, values) {
      consultas++;
      return values === undefined ? (await db.exec(sql)).at(-1) : db.query(sql, values);
    }, release() {} };
  },
};
function token(rol = "administrador") {
  return jwt.sign({ rol, ...(rol === "administrador" ? { usuario: "admin" } : {}) }, secret, {
    algorithm: "HS256", subject: "1", issuer: JWT_ISSUER,
    audience: rol === "administrador" ? JWT_AUDIENCE : STUDENT_JWT_AUDIENCE, expiresIn: 900,
  });
}
const excel = filas => writeExcelFile(filas).toBuffer();
const filasValidas = [["DNI", "Nombres", "Grado", "Sección"], ["01234567", "Estudiante nuevo", 3, "A"]];
before(async () => {
  db = await PGlite.create();
  await migrar(pool);
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  url = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(async () => {
  await db.exec(`
    TRUNCATE votos, candidatos, listas, estudiantes RESTART IDENTITY CASCADE;
    INSERT INTO estudiantes (codigo, nombre, grado, seccion) VALUES ('11111111', 'Estudiante anterior', '1', 'B');
    INSERT INTO listas (id, nombre) VALUES (10, 'Lista A');
    INSERT INTO candidatos (nombre, lista_id) VALUES ('Candidata A', 10);
  `);
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  if (db) await db.close();
});
async function importar(buffer, { credential = token(), nombre = "padron.xlsx", campo = "archivo", extra = false } = {}) {
  const form = new FormData();
  if (buffer) form.append(campo, new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), nombre);
  if (extra) form.append("no-permitido", "dato");
  const response = await fetch(`${url}/api/padron/importar`, {
    method: "POST", headers: credential ? { Authorization: `Bearer ${credential}` } : {}, body: form,
  });
  return { response, body: await response.json() };
}
async function padronActual() {
  return (await db.query("SELECT codigo, nombre, grado, seccion, ya_voto FROM estudiantes ORDER BY codigo")).rows;
}
async function comprobarPadronAnterior() {
  assert.deepEqual(await padronActual(), [{ codigo: "11111111", nombre: "Estudiante anterior", grado: "1", seccion: "B", ya_voto: false }]);
}

test("un Excel real reemplaza todo el padrón y permite ingresar solo con DNI", async () => {
  const buffer = await excel([
    [" DNI ", "Nombres", "Apellidos", "Grado", "SECCIÓN"],
    ["01234567", "Ana María", "Torres Quispe", 3, "A"],
    [null, null, null, null, null],
    [23456789, "Luis", "Pérez", "4", "B"],
  ]);
  const result = await importar(buffer, { nombre: "PADRON.XLSX" });
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.deepEqual(result.body, { mensaje: "Padrón reemplazado correctamente.", total: 2, reemplazados: 1 });
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await padronActual(), [
    { codigo: "01234567", nombre: "Ana María Torres Quispe", grado: "3", seccion: "A", ya_voto: false },
    { codigo: "23456789", nombre: "Luis Pérez", grado: "4", seccion: "B", ya_voto: false },
  ]);
  const oldVote = await fetch(`${url}/api/votos`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token("estudiante")}` }, body: JSON.stringify({ listaId: 10 }),
  });
  assert.equal(oldVote.status, 409);
  await oldVote.json();
  const login = await fetch(`${url}/api/auth/estudiante`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dni: "01234567" }) });
  const session = await login.json();
  assert.equal(login.status, 200);
  assert.equal(session.estudiante.nombre, "Ana María Torres Quispe");
  assert.notEqual(session.estudiante.id, 1);
  const vote = await fetch(`${url}/api/votos`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ listaId: 10 }),
  });
  assert.equal(vote.status, 201);
  await vote.json();
});

test("un DNI inválido produce errores por fila y no importa las filas correctas", async () => {
  const result = await importar(await excel([["DNI", "Nombre completo"], ["01234567", "Válido"], [1234567, "Se perdió el cero"]]));
  assert.equal(result.response.status, 422);
  assert.equal(result.body.errores[0].fila, 3);
  assert.equal(result.body.errores[0].campo, "dni");
  await comprobarPadronAnterior();
});

test("los DNI duplicados dentro del Excel rechazan el archivo completo", async () => {
  const result = await importar(await excel([["DNI", "Nombres"], ["01234567", "Uno"], ["01234567", "Otro"]]));
  assert.equal(result.response.status, 422);
  assert.match(result.body.errores[0].mensaje, /repetido/);
  await comprobarPadronAnterior();
});

test("valida encabezados y no acepta vaciar el padrón con un archivo sin alumnos", async () => {
  for (const [filas, status] of [
    [[["Documento", "Nombres"], ["01234567", "Uno"]], 400],
    [[["DNI", "dni", "Nombres"], ["01234567", "01234567", "Uno"]], 400],
    [[["DNI", "Nombres"]], 422],
  ]) {
    assert.equal((await importar(await excel(filas))).response.status, status);
    await comprobarPadronAnterior();
  }
});

test("rechaza nombres o datos opcionales que exceden las columnas SQL", async () => {
  const result = await importar(await excel([["DNI", "Nombres", "Grado", "Sección"], ["01234567", "X".repeat(101), "G".repeat(21), "S".repeat(11)]]));
  assert.equal(result.response.status, 422);
  assert.deepEqual(result.body.errores.map(e => e.campo), ["nombre", "grado", "seccion"]);
  await comprobarPadronAnterior();
});

test("solo el administrador puede enviar el padrón y los rechazos no consultan SQL", async () => {
  const buffer = await excel(filasValidas);
  for (const credential of [null, "invalido", token("estudiante")]) {
    const count = consultas;
    assert.equal((await importar(buffer, { credential })).response.status, 401);
    assert.equal(consultas, count);
  }
});

test("rechaza archivos corruptos, extensiones incorrectas y campos inesperados", async () => {
  const buffer = await excel(filasValidas);
  for (const [data, options] of [[Buffer.from("archivo inválido"), {}], [buffer, { nombre: "padron.xls" }], [null, {}], [buffer, { campo: "padron" }], [buffer, { extra: true }]]) {
    assert.equal((await importar(data, options)).response.status, 400);
    await comprobarPadronAnterior();
  }
});

test("no admite archivos mayores a 5 MiB", async () => {
  assert.equal((await importar(Buffer.alloc(MAX_ARCHIVO_BYTES + 1))).response.status, 413);
  await comprobarPadronAnterior();
});

test("limita el número de filas del padrón antes de modificar datos", async () => {
  const filas = [["DNI", "Nombres"], ...Array.from({ length: MAX_ESTUDIANTES + 1 }, (_, i) => [String(i).padStart(8, "0"), "Estudiante"] )];
  await assert.rejects(leerPadronExcel(await excel(filas)), { status: 422 });
  await comprobarPadronAnterior();
});

test("después del primer voto el padrón no puede reemplazarse", async () => {
  await db.query("SELECT registrar_voto($1, $2)", [1, 10]);
  const result = await importar(await excel(filasValidas));
  assert.equal(result.response.status, 409);
  assert.equal((await padronActual())[0].codigo, "11111111");
  assert.equal((await padronActual())[0].ya_voto, true);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 1);
});

test("un estado ya_voto previo también bloquea el reemplazo", async () => {
  await db.query("UPDATE estudiantes SET ya_voto = TRUE WHERE id = 1");
  assert.equal((await importar(await excel(filasValidas))).response.status, 409);
  assert.equal((await padronActual())[0].ya_voto, true);
});

test("un fallo durante la inserción revierte la eliminación del padrón anterior", async () => {
  await db.exec(`CREATE FUNCTION fallo_importacion() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Detalle privado de inserción'; END; $$;
    CREATE TRIGGER fallo_importacion BEFORE INSERT ON estudiantes FOR EACH ROW EXECUTE FUNCTION fallo_importacion();`);
  try {
    const result = await importar(await excel(filasValidas));
    assert.equal(result.response.status, 503);
    assert.equal(JSON.stringify(result.body).includes("Detalle privado"), false);
    await comprobarPadronAnterior();
  } finally { await db.exec("DROP TRIGGER fallo_importacion ON estudiantes; DROP FUNCTION fallo_importacion();"); }
});
