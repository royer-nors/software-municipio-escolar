const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const { createApp } = require("../app");
const { JWT_ISSUER, STUDENT_JWT_AUDIENCE } = require("../config/auth");
const secret = "secreto-de-pruebas-estudiante-no-usar-en-produccion";
let queryCount = 0;
let lastValues;
const pool = {
  async query(sql, values) {
    queryCount++;
    lastValues = values;
    if (values[0] === "99999999") throw new Error("Detalle privado de PostgreSQL");
    const estudiantes = {
      "01234567": { id: 8, dni: "01234567", nombre: "Estudiante de prueba", ya_voto: false, activo: true },
      "12345678": { id: 9, dni: "12345678", nombre: "Ya votó", ya_voto: true, activo: true },
    };
    return { rows: estudiantes[values[0]] ? [estudiantes[values[0]]] : [] };
  },
};
let server, baseUrl;
before(async () => {
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
async function identificar(body) {
  const response = await fetch(`${baseUrl}/api/auth/estudiante`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test("el estudiante accede solo con DNI y conserva sus ceros iniciales", async () => {
  const result = await identificar({ dni: " 01234567 " });
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(result.body.estudiante, { id: 8, dni: "01234567", nombre: "Estudiante de prueba" });
  assert.deepEqual(lastValues, ["01234567"]);
  assert.equal(result.body.habilitadoParaVotar, true);
  const claims = jwt.verify(result.body.token, secret, { issuer: JWT_ISSUER, audience: STUDENT_JWT_AUDIENCE, algorithms: ["HS256"] });
  assert.equal(claims.sub, "8");
  assert.equal(claims.rol, "estudiante");
  assert.equal(claims.exp - claims.iat, 900);
});

test("rechaza DNI incompletos o numéricos antes de consultar el padrón", async () => {
  for (const body of [{}, { dni: 12345678 }, { dni: "123" }, { dni: "1234567X" }]) {
    const count = queryCount;
    assert.equal((await identificar(body)).response.status, 400);
    assert.equal(queryCount, count);
  }
});

test("no emite tokens para estudiantes ajenos al padrón o que ya votaron", async () => {
  const missing = await identificar({ dni: "11111111" });
  assert.equal(missing.response.status, 401);
  assert.equal(missing.body.token, undefined);
  const voted = await identificar({ dni: "12345678" });
  assert.equal(voted.response.status, 409);
  assert.equal(voted.body.token, undefined);
});

test("el token del estudiante no abre las funciones del administrador", async () => {
  const { body } = await identificar({ dni: "01234567" });
  const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(response.status, 401);
  await response.json();
});

test("los errores de base de datos no revelan información interna", async () => {
  const result = await identificar({ dni: "99999999" });
  assert.equal(result.response.status, 503);
  assert.equal(JSON.stringify(result.body).includes("Detalle privado"), false);
});
