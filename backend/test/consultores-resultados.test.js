// Sin conexión a la base instalada, migraciones ni sentencias de borrado.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createConsultoresResultadosService, ESPERA, AUDIENCIA } = require("../services/consultores-resultados.service");
const { createConsultoresResultadosRouter } = require("../routes/consultores-resultados.routes");
const { createConsultoresResultadosRepository } = require("../repositories/consultores-resultados.repository");
const { createAutenticacionMiddleware } = require("../middleware/autenticacion");
const { createResultadosRouter } = require("../routes/resultados.routes");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE } = require("../config/auth");
const secreto = "secreto-aislado-consultores-no-produccion-2026";
let cuenta, publicada = false, consultas = 0, server, url, token;
const completo = { generadoEn: new Date().toISOString(), resumen: { votosEmitidos: 5 }, listas: [{ nombre: "A", votos: 5 }] };
const repository = {
  async findByUsuario(usuario) { return usuario === cuenta.usuario ? cuenta : null; },
  async findById(id) { return id === cuenta.id ? cuenta : null; },
  async listar() { return [{ id: cuenta.id, usuario: cuenta.usuario, activo: cuenta.activo }]; },
  async consultarResultados() { consultas++; return publicada ? completo : null; },
  async guardar(id, datos) { return { id, usuario: datos.usuario, activo: datos.activo }; },
};
const service = createConsultoresResultadosService(repository, secreto);
function firmado(rol, audience) { return jwt.sign({ rol, usuario: "admin", version_token: 0 }, secreto, { subject: "1", issuer: JWT_ISSUER, audience, expiresIn: 900 }); }
before(async () => {
  cuenta = { id: 1, usuario: "consulta1", activo: true, version_token: 0, password_hash: await bcrypt.hash("ClaveConsultor!", 4) };
  token = (await service.login({ usuario: "CONSULTA1", password: "ClaveConsultor!" })).token;
  const app = express(); app.use(express.json());
  const admin = createAutenticacionMiddleware(secreto, { async findById() { return { id: 1, usuario: "admin", activo: true, version_token: 0 }; } });
  app.use("/api/consultores", createConsultoresResultadosRouter({ service, autenticarAdministrador: admin, red: { origenes: ["http://localhost:5173"] } }));
  app.use("/api/resultados", createResultadosRouter({ autenticarAdministrador: admin, resultadosService: { async obtenerResultados() { return completo; } } }));
  server = app.listen(0, "127.0.0.1"); await once(server, "listening"); url = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(r => server.close(r)); });
async function pedir(ruta, credential = token, opciones = {}) {
  const r = await fetch(url + ruta, { ...opciones, headers: { Authorization: `Bearer ${credential}`, ...opciones.headers } });
  return { status: r.status, body: await r.json(), cache: r.headers.get("cache-control") };
}
test("administrador conserva conteos en tiempo real; consultor recibe solamente mensaje antes de publicación", async () => {
  publicada = false;
  const admin = await pedir("/api/resultados", firmado("administrador", JWT_AUDIENCE));
  assert.equal(admin.status, 200); assert.equal(admin.body.resumen.votosEmitidos, 5);
  const c = await pedir("/api/consultores/resultados");
  assert.equal(c.status, 403); assert.equal(c.cache, "no-store");
  assert.deepEqual(c.body, { mensaje: ESPERA, codigo: "RESULTADOS_NO_PUBLICADOS" });
});
test("solo después de la publicación se entrega el reporte completo y una nueva programación vuelve a bloquearlo", async () => {
  publicada = true;
  const c = await pedir("/api/consultores/resultados"); assert.equal(c.status, 200); assert.deepEqual(c.body, completo);
  publicada = false; assert.equal((await pedir("/api/consultores/resultados")).status, 403);
});
test("separación de roles: consultor no administra ni obtiene conteos por la ruta administrativa", async () => {
  for (const ruta of ["/api/resultados", "/api/consultores/administracion"]) assert.equal((await pedir(ruta)).status, 401);
  const antes = consultas;
  for (const credential of [firmado("estudiante", STUDENT_JWT_AUDIENCE), firmado("administrador", JWT_AUDIENCE), firmado("CONSULTOR_RESULTADOS", JWT_AUDIENCE), "invalido"]) {
    assert.equal((await pedir("/api/consultores/resultados", credential)).status, 401);
  }
  assert.equal(consultas, antes);
});
test("desactivar la cuenta o cambiar versión invalida inmediatamente la sesión; JWT vencido tampoco accede", async () => {
  cuenta.activo = false; assert.equal((await pedir("/api/consultores/resultados")).status, 401);
  cuenta.activo = true; cuenta.version_token = 1; assert.equal((await pedir("/api/consultores/resultados")).status, 401);
  cuenta.version_token = 0;
  const vencido = jwt.sign({ rol: "CONSULTOR_RESULTADOS", version_token: 0 }, secreto, { subject: "1", issuer: JWT_ISSUER, audience: AUDIENCIA, expiresIn: -1 });
  assert.equal(await service.autenticar(`Bearer ${vencido}`), null);
});
test("contraseña incorrecta, usuario desconocido, campos falsificados y tercera cuenta se rechazan", async () => {
  for (const datos of [{ usuario: "consulta1", password: "incorrecta" }, { usuario: "desconocido", password: "incorrecta" }]) await assert.rejects(service.login(datos), e => e.status === 401);
  await assert.rejects(service.login({ usuario: "consulta1", password: "ClaveConsultor!", rol: "administrador" }), e => e.status === 400);
  await assert.rejects(service.guardar("3", { usuario: "tercero", activo: true }, { id: 1 }), e => e.status === 400);
  await assert.rejects(service.guardar("1", { usuario: "uno", activo: "true" }, { id: 1 }), e => e.status === 400);
  assert.ok(!JSON.stringify(await service.listar()).includes("password"));
});
test("gestión administrativa exige Origin, JSON y CSRF; genera hash y no devuelve contraseñas", async () => {
  const admin = firmado("administrador", JWT_AUDIENCE);
  const datos = { usuario: "Renovado", activo: true, password: "NuevaClave!" };
  for (const headers of [{}, { Origin: "null", "X-Consultor-CSRF": "1" }, { Origin: "http://localhost:5173" }]) {
    assert.equal((await pedir("/api/consultores/administracion/1", admin, { method: "PUT", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(datos) })).status, 403);
  }
  const r = await pedir("/api/consultores/administracion/1", admin, { method: "PUT", headers: { Origin: "http://localhost:5173", "X-Consultor-CSRF": "1", "Content-Type": "application/json" }, body: JSON.stringify(datos) });
  assert.equal(r.status, 200); assert.equal(r.body.consultor.usuario, "renovado"); assert.ok(!JSON.stringify(r.body).includes("password"));
});
test("repositorio no consulta conteos sin finalización automática y utiliza instantánea de solo lectura", async () => {
  const consultas = []; let liberar = false;
  const c = { async query(sql) { consultas.push(sql); return { rows: sql.includes("AS publicada") ? [{ publicada: false }] : [] }; }, release() { liberar = true; } };
  const repo = createConsultoresResultadosRepository({ async connect() { return c; } });
  assert.equal(await repo.consultarResultados(), null);
  assert.match(consultas[0], /REPEATABLE READ READ ONLY/);
  assert.match(consultas[1], /automatica AND estado_votacion\(c\)='Finalizada'/);
  assert.equal(consultas.length, 3); assert.equal(consultas[2], "COMMIT"); assert.equal(liberar, true);
});
