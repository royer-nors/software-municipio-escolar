const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const { createLegacyRouterHarness: createApp } = require("../test-support/legacy-router-harness");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");
const { createListasService } = require("../services/listas.service");
const secret = "secreto-para-pruebas-de-listas-no-usar-en-produccion";
let consultas = 0, lastValues;
let papeleta = {
  estudiante: { yaVoto: false, activo: true },
  candidatos: [
    { id: 4, nombre: "Candidata B", lista: "Unidos por el cambio", listaId: 20 },
    { id: 2, nombre: "Candidato A", lista: "Unidos por el cambio", listaId: 20 },
    { id: 3, nombre: "Candidata C", lista: "Ideas que transforman", listaId: 10 },
  ],
};
const pool = { async query(sql, values) { consultas++; lastValues = values; return { rows: [papeleta] }; } };
let server, baseUrl;
function token(rol = "estudiante", extra = {}) {
  return jwt.sign({ rol, ...(rol === "administrador" ? { usuario: "admin" } : {}) }, secret, {
    algorithm: "HS256", subject: "8", issuer: JWT_ISSUER,
    audience: rol === "estudiante" ? STUDENT_JWT_AUDIENCE : JWT_AUDIENCE, expiresIn: 900, ...extra,
  });
}
before(async () => {
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
async function consultar(credential = token(), path = "/api/listas") {
  const response = await fetch(baseUrl + path, { headers: credential ? { Authorization: `Bearer ${credential}` } : {} });
  return { response, body: await response.json() };
}

test("solo un token vigente de estudiante permite consultar las listas", async () => {
  for (const credential of [null, "invalido", token("administrador"), token("estudiante", { expiresIn: -1 })]) {
    const count = consultas;
    assert.equal((await consultar(credential)).response.status, 401);
    assert.equal(consultas, count);
  }
});

test("devuelve listas completas sin mezclar candidatos ni inventar datos", async () => {
  const result = await consultar();
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(lastValues, [8]);
  assert.deepEqual(result.body, { listas: [
    { id: 10, nombre: "Ideas que transforman", candidatos: [{ id: 3, nombre: "Candidata C" }] },
    { id: 20, nombre: "Unidos por el cambio", candidatos: [{ id: 2, nombre: "Candidato A" }, { id: 4, nombre: "Candidata B" }] },
  ] });
});

test("un token emitido antes de votar deja de habilitar la papeleta tras el voto", async () => {
  const original = papeleta;
  try {
    papeleta = { ...original, estudiante: { yaVoto: true, activo: true } };
    assert.equal((await consultar()).response.status, 409);
    papeleta = { ...original, estudiante: null };
    assert.equal((await consultar()).response.status, 401);
  } finally { papeleta = original; }
});

test("el token del estudiante no permite consultar los resultados del administrador", async () => {
  const count = consultas;
  assert.equal((await consultar(token(), "/api/resultados")).response.status, 401);
  assert.equal(consultas, count);
});

test("una elección sin candidatos devuelve listas vacías", async () => {
  const service = createListasService({ async obtenerPapeleta() { return { estudiante: { yaVoto: false, activo: true }, candidatos: [] }; } });
  assert.deepEqual(await service.obtenerListas(8), { estado: "habilitado", listas: [] });
});

test("los datos incompletos no se presentan como una lista válida", async () => {
  const original = papeleta;
  try {
    papeleta = { ...original, candidatos: [{ id: 1, nombre: "Candidato", lista: null }] };
    const result = await consultar();
    assert.equal(result.response.status, 503);
    assert.deepEqual(result.body, { mensaje: "Las listas electorales no están disponibles." });
  } finally { papeleta = original; }
});
