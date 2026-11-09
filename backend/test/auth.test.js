const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE } = require("../config/auth");

const secret = "secreto-exclusivo-para-pruebas-no-usar-en-produccion";
const password = "Clave de prueba 2026";
const administrador = { id: 7, usuario: "admin", activo: true, version_token: 0, password_hash: bcrypt.hashSync(password, 4) };
const queries = [];
const pool = {
  async query(sql, values) {
    queries.push({ sql, values });
    if (values?.[0] === "sin-base") throw new Error("Detalle privado de PostgreSQL");
    return { rows: [administrador.usuario, administrador.id].includes(values?.[0]) ? [administrador] : [] };
  },
};
let server;
let baseUrl;

before(async () => {
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

async function login(body) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

function signClaims(payload, options = {}) {
  return jwt.sign(payload, secret, {
    algorithm: "HS256", subject: "7", issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE, expiresIn: 3600, ...options,
  });
}

test("el servidor mantiene disponible la ruta de estado", async () => {
  const response = await fetch(`${baseUrl}/api/estado`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).estado, "activo");
});

test("datos incompletos, tipos incorrectos y contraseñas truncables no consultan SQL", async () => {
  for (const body of [{}, { usuario: 123, password }, { usuario: "admin", password: "á".repeat(37) }]) {
    const count = queries.length;
    const result = await login(body);
    assert.equal(result.response.status, 400);
    assert.equal(queries.length, count);
  }
});

test("el login verifica bcrypt y emite un JWT sin exponer el hash", async () => {
  const result = await login({ usuario: " admin ", password });
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(result.body.administrador, { id: 7, usuario: "admin" });
  assert.equal(result.body.expiraEn, 3600);
  assert.equal(JSON.stringify(result.body).includes(administrador.password_hash), false);
  const claims = jwt.verify(result.body.token, secret, { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE });
  assert.equal(claims.sub, "7");
  assert.equal(claims.rol, "administrador");
  assert.equal(claims.exp - claims.iat, 3600);
});

test("contraseña incorrecta y usuario inexistente reciben el mismo rechazo", async () => {
  const wrongPassword = await login({ usuario: "admin", password: "otra clave" });
  const unknownUser = await login({ usuario: "no-existe", password });
  assert.equal(wrongPassword.response.status, 401);
  assert.equal(unknownUser.response.status, 401);
  assert.deepEqual(wrongPassword.body, unknownUser.body);
});

test("el usuario se envía como parámetro SQL, sin interpolarlo", async () => {
  const usuario = "admin' OR '1'='1";
  const result = await login({ usuario, password });
  assert.equal(result.response.status, 401);
  const query = queries.at(-1);
  assert.match(query.sql, /WHERE usuario = \$1/);
  assert.equal(query.sql.includes(usuario), false);
  assert.deepEqual(query.values, [usuario]);
});

test("la identidad solo se entrega con un token válido de administrador", async () => {
  const { body } = await login({ usuario: "admin", password });
  const response = await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${body.token}` } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { administrador: { id: 7, usuario: "admin" } });
});

test("se rechazan tokens ausentes, vencidos, alterados o de otro rol", async () => {
  const valid = signClaims({ usuario: "admin", rol: "administrador" });
  const [header, payload, signature] = valid.split(".");
  const altered = `${header}.${payload}.${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  for (const token of [null, altered, signClaims({ usuario: "admin", rol: "administrador" }, { expiresIn: -1 }), signClaims({ usuario: "admin", rol: "estudiante" })]) {
    const response = await fetch(`${baseUrl}/api/auth/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, 401);
    await response.json();
  }
});

test("un fallo de PostgreSQL no expone detalles internos", async () => {
  const result = await login({ usuario: "sin-base", password });
  assert.equal(result.response.status, 503);
  assert.equal(JSON.stringify(result.body).includes("Detalle privado"), false);
});

test("la configuración rechaza un secreto JWT ausente o demasiado corto", () => {
  for (const jwtSecret of [undefined, "corto"]) {
    assert.throws(() => createApp({ pool, jwtSecret }), /JWT_SECRET/);
  }
});
