const { test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { createApp } = require("../app");
const secret = "secreto-de-pruebas-limites-no-usar-en-produccion";

async function comprobar(run) {
  let consultas = 0;
  const pool = { async query(sql, values) {
    if (sql.includes("estado_votacion")) return { rows: [{ estado: "Abierta", automatica: false, voto_blanco_habilitado: true }] };
    consultas++;
    return { rows: values[0] === "01234567" ? [{ id: 1, dni: values[0], nombre: "Estudiante", ya_voto: false, activo: true }] : [] };
  } };
  const server = createApp({ pool, jwtSecret: secret, limitesAcceso: { estudiante: { limit: 2 } } }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/auth/estudiante`;
  async function post(dni) {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dni }) });
    await response.json();
    return response;
  }
  try { await run(post, () => consultas); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test("el límite de intentos rechaza el acceso sin seguir consultando SQL", async () => {
  await comprobar(async (post, consultas) => {
    assert.equal((await post("11111111")).status, 401);
    assert.equal((await post("11111111")).status, 401);
    const count = consultas();
    const blocked = await post("11111111");
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    assert.equal(consultas(), count);
  });
});

test("los accesos correctos no consumen intentos fallidos", async () => {
  await comprobar(async post => {
    for (let i = 0; i < 3; i++) assert.equal((await post("01234567")).status, 200);
    assert.equal((await post("11111111")).status, 401);
    assert.equal((await post("11111111")).status, 401);
    assert.equal((await post("11111111")).status, 429);
  });
});
