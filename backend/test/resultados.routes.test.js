const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const jwt = require("jsonwebtoken");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE } = require("../config/auth");

const secret = "secreto-para-pruebas-de-resultados-no-usar-en-produccion";
let queryCount = 0;
let databaseUnavailable = false;
const pool = {
  async query(sql) {
    queryCount++;
    if (databaseUnavailable) throw new Error("Contraseña y detalles privados de PostgreSQL");
    if (sql.includes("FROM administradores")) return { rows: [{ id: 7, usuario: "admin", activo: true, version_token: 0 }] };
    return { rows: [{ habilitados: "10", emitidos: "5", blancos: "1", listas: [{ nombre: "Lista A", votos: 4 }] }] };
  },
};
let server;
let baseUrl;

function token(rol = "administrador") {
  return jwt.sign({ usuario: "admin", rol, version_token: 0 }, secret, {
    algorithm: "HS256", subject: "7", issuer: JWT_ISSUER, audience: JWT_AUDIENCE, expiresIn: 3600,
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

test("los resultados requieren autenticación antes de consultar PostgreSQL", async () => {
  for (const credential of [null, "token-invalido", token("estudiante")]) {
    const beforeQuery = queryCount;
    const response = await fetch(`${baseUrl}/api/resultados`, { headers: credential ? { Authorization: `Bearer ${credential}` } : {} });
    assert.equal(response.status, 401);
    await response.json();
    assert.equal(queryCount, beforeQuery);
  }
});

test("el administrador obtiene resultados actuales sin información de los votantes", async () => {
  const beforeQuery = queryCount;
  const response = await fetch(`${baseUrl}/api/resultados`, { headers: { Authorization: `Bearer ${token()}` } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(queryCount - beforeQuery, 2);
  assert.equal(body.resumen.votosValidos, 4);
  assert.deepEqual(body.listas, [{ nombre: "Lista A", votos: 4, porcentaje: 100, posicion: 1 }]);
  assert.deepEqual(Object.keys(body).sort(), ["generadoEn", "listas", "resumen"]);
});

test("la caída de PostgreSQL devuelve 503 sin filtrar detalles privados", async () => {
  databaseUnavailable = true;
  try {
    const response = await fetch(`${baseUrl}/api/resultados`, { headers: { Authorization: `Bearer ${token()}` } });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { mensaje: "La verificación de acceso no está disponible." });
  } finally {
    databaseUnavailable = false;
  }
});
