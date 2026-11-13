const { before, beforeEach, after, test } = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PGlite } = require("@electric-sql/pglite");
const { migrar } = require("../database/migrar");
const { createApp } = require("../app");
const { JWT_ISSUER, JWT_AUDIENCE } = require("../config/auth");

const secret = "secreto-de-pruebas-de-borrado-no-usar-en-produccion";
const passwordCorrecta = "ClaveSoloPruebas";
const autorizacionReinicio = "codigo-extra-solo-para-pruebas";
const clavesEntorno = ["NODE_ENV", "BORRADO_DATOS_HABILITADO", "BORRADO_DATOS_DB_PRUEBAS", "BORRADO_DATOS_REINICIO_HABILITADO", "BORRADO_DATOS_AUTORIZACION_REINICIO"];
const entornoOriginal = Object.fromEntries(clavesEntorno.map(clave => [clave, process.env[clave]]));
let db;
let server;
let baseUrl;
let consultas = 0;
let hashAdmin;
let configBase;
const pool = {
  query(sql, values) {
    consultas++;
    return db.query(sql, values);
  },
  async connect() {
    return {
      async query(sql, values) {
        if (values !== undefined) return db.query(sql, values);
        return (await db.exec(sql)).at(-1);
      },
      release() {},
    };
  },
};

function token() {
  return jwt.sign({ usuario: "admin", rol: "administrador", version_token: 0 }, secret, {
    algorithm: "HS256",
    subject: "1",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn: 3600,
  });
}

function configurarEntornoSeguro() {
  process.env.NODE_ENV = "test";
  process.env.BORRADO_DATOS_HABILITADO = "true";
  process.env.BORRADO_DATOS_DB_PRUEBAS = "postgres";
  process.env.BORRADO_DATOS_REINICIO_HABILITADO = "false";
  process.env.BORRADO_DATOS_AUTORIZACION_REINICIO = autorizacionReinicio;
}

async function contarDatos() {
  return (await db.query(`
    SELECT (SELECT COUNT(*)::int FROM estudiantes) AS estudiantes,
           (SELECT COUNT(*)::int FROM listas) AS listas,
           (SELECT COUNT(*)::int FROM candidatos) AS candidatos,
           (SELECT COUNT(*)::int FROM votos) AS votos,
           (SELECT COUNT(*)::int FROM estudiantes WHERE ya_voto = TRUE) AS ya_voto
  `)).rows[0];
}

async function limpiarDatosElectorales() {
  await db.exec(`
    DELETE FROM votos;
    DELETE FROM candidatos;
    DELETE FROM listas;
    DELETE FROM estudiantes;
    UPDATE configuracion_votacion SET votacion_abierta = FALSE WHERE id = 1;
  `);
}

async function prepararDatos({ estudiantes = 2, listas = 1, candidatos = 2, votos = 0, yaVoto = false } = {}) {
  const idsLista = [];
  for (let i = 0; i < listas; i++) {
    const result = await db.query("INSERT INTO listas (nombre) VALUES ($1) RETURNING id", [`Lista prueba ${i + 1}`]);
    idsLista.push(result.rows[0].id);
  }
  for (let i = 0; i < estudiantes; i++) {
    await db.query("INSERT INTO estudiantes (codigo, nombre, ya_voto) VALUES ($1, $2, $3)", [
      String(10000000 + i + 1), `Estudiante ${i + 1}`, yaVoto,
    ]);
  }
  for (let i = 0; i < candidatos; i++) {
    assert.ok(idsLista.length, "La fixture de candidatos requiere una lista");
    await db.query("INSERT INTO candidatos (nombre, lista_id) VALUES ($1, $2)", [`Candidato ${i + 1}`, idsLista[i % idsLista.length]]);
  }
  for (let i = 0; i < votos; i++) {
    assert.ok(idsLista.length, "La fixture de votos requiere una lista");
    await db.query("INSERT INTO votos (lista_id) VALUES ($1)", [idsLista[i % idsLista.length]]);
  }
}

async function simular(operacion) {
  const respuesta = await solicitar("simulacion", { method: "POST", body: { operacion } });
  assert.equal(respuesta.response.status, 200, JSON.stringify(respuesta.body));
  return respuesta.body;
}

async function ejecutar(operacion, simulacion, extras = {}) {
  return solicitar("ejecutar", {
    method: "POST",
    body: {
      operacion,
      simulacionId: simulacion.simulacionId,
      confirmacion: "BORRAR DATOS DE PRUEBA",
      password: passwordCorrecta,
      ...extras,
    },
  });
}

async function capturarProtecciones() {
  return {
    administradores: (await db.query("SELECT id, usuario, password_hash, activo, version_token FROM administradores ORDER BY id")).rows,
    configuracion: (await db.query("SELECT id, votacion_abierta, voto_blanco_habilitado FROM configuracion_votacion ORDER BY id")).rows,
    migraciones: (await db.query("SELECT version, checksum FROM esquema_migraciones ORDER BY version")).rows,
  };
}

async function afirmarProtecciones(snapshot) {
  assert.deepEqual(await capturarProtecciones(), snapshot);
}

async function afirmarSinSecretosEnAuditoria() {
  const filas = (await db.query("SELECT administrador_usuario, detalle FROM auditoria_borrado_datos")).rows;
  const serializado = JSON.stringify(filas);
  assert.equal(serializado.includes(passwordCorrecta), false);
  assert.equal(serializado.includes(autorizacionReinicio), false);
}

async function solicitar(ruta, { method = "GET", body, credential = token() } = {}) {
  const response = await fetch(`${baseUrl}/api/borrado-datos/${ruta}`, {
    method,
    headers: {
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { response, body: await response.json() };
}

before(async () => {
  db = await PGlite.create();
  await migrar(pool);
  hashAdmin = await bcrypt.hash(passwordCorrecta, 4);
  await db.query("INSERT INTO administradores (usuario, password_hash) VALUES ($1, $2)", ["admin", hashAdmin]);
  configurarEntornoSeguro();
  assert.equal((await db.query("SELECT current_database() AS nombre")).rows[0].nombre, process.env.BORRADO_DATOS_DB_PRUEBAS);
  server = createApp({ pool, jwtSecret: secret }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  configurarEntornoSeguro();
  await db.exec(`
    DELETE FROM votos;
    DELETE FROM candidatos;
    DELETE FROM listas;
    DELETE FROM estudiantes;
    DELETE FROM auditoria_borrado_datos;
    UPDATE administradores SET activo = TRUE, version_token = 0 WHERE id = 1;
    UPDATE configuracion_votacion SET votacion_abierta = FALSE, voto_blanco_habilitado = TRUE WHERE id = 1;
  `);
  configBase = (await db.query("SELECT id, votacion_abierta, voto_blanco_habilitado FROM configuracion_votacion ORDER BY id")).rows;
  consultas = 0;
});

after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  if (db) await db.close();
  for (const clave of clavesEntorno) {
    if (entornoOriginal[clave] === undefined) delete process.env[clave];
    else process.env[clave] = entornoOriginal[clave];
  }
});

test("los endpoints requieren autenticación administrativa antes de consultar el resumen", async () => {
  const beforeQuery = consultas;
  const summary = await solicitar("resumen", { credential: null });
  assert.equal(summary.response.status, 401);

  const simulation = await solicitar("simulacion", {
    method: "POST", body: { operacion: "solo_votos" }, credential: null,
  });
  assert.equal(simulation.response.status, 401);
  const execution = await solicitar("ejecutar", { method: "POST", body: { operacion: "solo_votos" }, credential: null });
  assert.equal(execution.response.status, 401);
  const exceptional = await solicitar("reinicio-excepcional", { method: "POST", body: {}, credential: null });
  assert.equal(exceptional.response.status, 401);

  assert.equal(consultas, beforeQuery + 4);
  const audit = (await db.query("SELECT administrador_id, modo, resultado, detalle FROM auditoria_borrado_datos ORDER BY id")).rows;
  assert.equal(audit.length, 4);
  for (const fila of audit) {
    assert.equal(fila.administrador_id, null);
    assert.equal(fila.resultado, "fallido");
    assert.equal(fila.detalle.motivo, "autenticacion_requerida");
  }
  assert.deepEqual(audit.map(fila => fila.modo), ["simulacion", "simulacion", "eliminacion", "reinicio_excepcional"]);
});

test("el resumen informa cantidades y una simulación audita sin cambiar los datos", async () => {
  await db.exec(`
    INSERT INTO estudiantes (codigo, nombre, ya_voto) VALUES ('01234567', 'Estudiante A', TRUE), ('12345678', 'Estudiante B', FALSE);
    INSERT INTO listas (nombre) VALUES ('Lista de prueba');
    INSERT INTO candidatos (nombre, lista_id) VALUES ('Candidata A', 1), ('Candidato B', 1);
    INSERT INTO votos (lista_id) VALUES (1);
  `);

  const beforeSimulation = await contarDatos();
  const summary = await solicitar("resumen");
  assert.equal(summary.response.status, 200);
  assert.equal(summary.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(summary.body, {
    estudiantes: 2,
    listas: 1,
    candidatos: 2,
    votos: 1,
    estudiantesMarcadosYaVoto: 1,
    configuracionDisponible: true,
    votacionAbierta: false,
    votosRegistrados: true,
    estudiantesYaVotaron: true,
  });

  const simulation = await solicitar("simulacion", {
    method: "POST", body: { operacion: "candidatos_listas" },
  });
  assert.equal(simulation.response.status, 200);
  assert.equal(simulation.body.eliminacionReal, false);
  assert.equal(simulation.body.bloqueada, true);
  assert.deepEqual(simulation.body.proyeccion, {
    estudiantes: 0,
    listas: 1,
    candidatos: 2,
    votos: 1,
    marcasYaVotoRestablecidas: 1,
  });
  assert.ok(simulation.body.bloqueos.includes("Hay votos registrados."));
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM votos")).rows[0].total, 1);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM listas")).rows[0].total, 1);
  assert.equal((await db.query("SELECT ya_voto FROM estudiantes WHERE id = 1")).rows[0].ya_voto, true);
  assert.deepEqual(await contarDatos(), beforeSimulation);

  const audit = (await db.query("SELECT administrador_id, administrador_usuario, operacion, modo, resultado, detalle FROM auditoria_borrado_datos")).rows[0];
  assert.equal(audit.administrador_id, 1);
  assert.equal(audit.administrador_usuario, "admin");
  assert.equal(audit.operacion, "candidatos_listas");
  assert.equal(audit.modo, "simulacion");
  assert.equal(audit.resultado, "bloqueado");
  assert.equal(audit.detalle.eliminacionReal, false);
  assert.equal(JSON.stringify(audit).includes("ClaveSoloPruebas"), false);
});

test("audita operaciones desconocidas y simula el reinicio excepcional sin bloqueo pendiente", async () => {
  const invalid = await solicitar("simulacion", { method: "POST", body: { operacion: "otra" } });
  assert.equal(invalid.response.status, 400);
  const invalidAudit = (await db.query("SELECT resultado, detalle FROM auditoria_borrado_datos")).rows[0];
  assert.equal(invalidAudit.resultado, "fallido");
  assert.equal(invalidAudit.detalle.motivo, "operacion_invalida");

  const exceptional = await solicitar("simulacion", {
    method: "POST", body: { operacion: "reinicio_pruebas" },
  });
  assert.equal(exceptional.response.status, 200);
  assert.equal(exceptional.body.bloqueada, false);
  assert.equal(exceptional.body.requiereAutorizacionAdicional, true);
  assert.equal(exceptional.body.eliminacionReal, false);
  assert.equal((await db.query("SELECT COUNT(*)::int AS total FROM auditoria_borrado_datos")).rows[0].total, 2);
});

test("cada operación permitida completa simulación y ejecución con conteos correctos", async () => {
  const casos = [
    { operacion: "solo_votos", datos: { estudiantes: 1, listas: 1, candidatos: 1 }, finales: { estudiantes: 1, listas: 1, candidatos: 1, votos: 0, ya_voto: 0 }, afectados: { estudiantes: 0, listas: 0, candidatos: 0, votos: 0, marcasYaVotoRestablecidas: 0 } },
    { operacion: "candidatos_listas", datos: { estudiantes: 1, listas: 1, candidatos: 2 }, finales: { estudiantes: 1, listas: 0, candidatos: 0, votos: 0, ya_voto: 0 }, afectados: { estudiantes: 0, listas: 1, candidatos: 2, votos: 0, marcasYaVotoRestablecidas: 0 } },
    { operacion: "estudiantes", datos: { estudiantes: 2, listas: 1, candidatos: 1 }, finales: { estudiantes: 0, listas: 1, candidatos: 1, votos: 0, ya_voto: 0 }, afectados: { estudiantes: 2, listas: 0, candidatos: 0, votos: 0, marcasYaVotoRestablecidas: 0 } },
  ];

  for (const caso of casos) {
    await limpiarDatosElectorales();
    await prepararDatos(caso.datos);
    const before = await contarDatos();
    const simulacion = await simular(caso.operacion);
    assert.equal(simulacion.bloqueada, false);
    assert.deepEqual(await contarDatos(), before, "la simulación debe ser de solo lectura");
    const respuesta = await ejecutar(caso.operacion, simulacion);
    assert.equal(respuesta.response.status, 200, JSON.stringify(respuesta.body));
    assert.equal(respuesta.body.resultado, "ejecutado");
    assert.deepEqual(respuesta.body.cantidades, caso.afectados);
    assert.deepEqual(await contarDatos(), caso.finales);
    const audit = (await db.query("SELECT modo, resultado, detalle FROM auditoria_borrado_datos WHERE modo = 'eliminacion' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(audit.resultado, "ejecutado");
    assert.deepEqual(audit.detalle.cantidades, caso.afectados);
    await afirmarProtecciones({ administradores: [{ id: 1, usuario: "admin", password_hash: hashAdmin, activo: true, version_token: 0 }], configuracion: configBase, migraciones: await db.query("SELECT version, checksum FROM esquema_migraciones ORDER BY version").then(r => r.rows) });
  }
});

test("una elección abierta, votos o una marca ya_voto añadidos tras simular bloquean dentro de la transacción", async () => {
  const escenarios = ["abierta", "votos", "ya_voto"];
  for (const escenario of escenarios) {
    await limpiarDatosElectorales();
    await prepararDatos({ estudiantes: 1, listas: 1, candidatos: 1 });
    const sim = await simular("estudiantes");
    if (escenario === "abierta") await db.query("UPDATE configuracion_votacion SET votacion_abierta = TRUE WHERE id = 1");
    if (escenario === "votos") {
      const lista = (await db.query("SELECT id FROM listas LIMIT 1")).rows[0].id;
      await db.query("INSERT INTO votos (lista_id) VALUES ($1)", [lista]);
    }
    if (escenario === "ya_voto") await db.query("UPDATE estudiantes SET ya_voto = TRUE");
    const protegidos = await capturarProtecciones();
    const antes = await contarDatos();
    const respuesta = await ejecutar("estudiantes", sim);
    assert.equal(respuesta.response.status, 409, `${escenario}: ${JSON.stringify(respuesta.body)}`);
    assert.deepEqual(await contarDatos(), antes);
    const audit = (await db.query("SELECT resultado FROM auditoria_borrado_datos WHERE modo = 'eliminacion' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(audit.resultado, "bloqueado");
    await afirmarProtecciones(protegidos);
  }
});

test("audita confirmación incorrecta, contraseña incorrecta y administrador inactivo sin filtrar secretos", async () => {
  const sim = await simular("solo_votos");
  const confirmacionIncorrecta = await ejecutar("solo_votos", sim, { confirmacion: "FRASE INCORRECTA" });
  assert.equal(confirmacionIncorrecta.response.status, 400);
  assert.equal((await db.query("SELECT consumida_en FROM auditoria_borrado_datos WHERE id = $1", [sim.simulacionId])).rows[0].consumida_en, null);

  const passwordIncorrecta = await ejecutar("solo_votos", sim, { password: "NoEsLaClave" });
  assert.equal(passwordIncorrecta.response.status, 401);
  assert.ok((await db.query("SELECT consumida_en FROM auditoria_borrado_datos WHERE id = $1", [sim.simulacionId])).rows[0].consumida_en);

  await db.query("UPDATE administradores SET activo = FALSE WHERE id = 1");
  const inactivo = await solicitar("ejecutar", { method: "POST", body: { operacion: "solo_votos", password: passwordCorrecta } });
  assert.equal(inactivo.response.status, 401);
  const auditoria = (await db.query("SELECT resultado, detalle FROM auditoria_borrado_datos WHERE modo = 'eliminacion' ORDER BY id")).rows;
  assert.ok(auditoria.some(row => row.detalle.motivo === "confirmacion_invalida"));
  assert.ok(auditoria.some(row => row.detalle.motivo === "password_incorrecta"));
  assert.ok(auditoria.some(row => row.detalle.motivo === "autenticacion_requerida"));
  await afirmarSinSecretosEnAuditoria();
});

test("rechaza la ejecución en producción, sin habilitación o con nombre de base distinto", async () => {
  const escenarios = [
    { cambio: () => { process.env.NODE_ENV = "production"; }, status: 403 },
    { cambio: () => { process.env.BORRADO_DATOS_HABILITADO = "1"; }, status: 403 },
    { cambio: () => { process.env.BORRADO_DATOS_DB_PRUEBAS = "otra_base"; }, status: 409 },
  ];
  for (const escenario of escenarios) {
    await limpiarDatosElectorales();
    await prepararDatos({ estudiantes: 1 });
    const sim = await simular("estudiantes");
    escenario.cambio();
    const respuesta = await ejecutar("estudiantes", sim);
    assert.equal(respuesta.response.status, escenario.status, JSON.stringify(respuesta.body));
    assert.equal((await contarDatos()).estudiantes, 1);
    const audit = (await db.query("SELECT resultado FROM auditoria_borrado_datos WHERE modo = 'eliminacion' ORDER BY id DESC LIMIT 1")).rows[0];
    assert.equal(audit.resultado, "bloqueado");
    configurarEntornoSeguro();
  }
});

test("rechaza simulaciones vencidas, reutilizadas y obsoletas", async () => {
  await limpiarDatosElectorales();
  await prepararDatos({ estudiantes: 1 });
  const vencida = await simular("estudiantes");
  await db.query("UPDATE auditoria_borrado_datos SET creado_en = NOW() - INTERVAL '11 minutes' WHERE id = $1", [vencida.simulacionId]);
  const vencidaResp = await ejecutar("estudiantes", vencida);
  assert.equal(vencidaResp.response.status, 409);
  assert.equal((await contarDatos()).estudiantes, 1);

  const reutilizable = await simular("estudiantes");
  assert.equal((await ejecutar("estudiantes", reutilizable)).response.status, 200);
  const reutilizada = await ejecutar("estudiantes", reutilizable);
  assert.equal(reutilizada.response.status, 409);

  await limpiarDatosElectorales();
  await prepararDatos({ estudiantes: 1 });
  const obsoleta = await simular("estudiantes");
  await db.query("INSERT INTO estudiantes (codigo, nombre, ya_voto) VALUES ('22222222', 'Nuevo estudiante', FALSE)");
  const obsoletaResp = await ejecutar("estudiantes", obsoleta);
  assert.equal(obsoletaResp.response.status, 409, JSON.stringify(obsoletaResp.body));
  assert.equal((await contarDatos()).estudiantes, 2);
  const audit = (await db.query("SELECT detalle FROM auditoria_borrado_datos WHERE modo = 'eliminacion' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(audit.detalle.motivo, "simulacion_obsoleta");
});

test("revierte todo si falla a mitad de la operación y conserva la auditoría del error", async () => {
  await prepararDatos({ estudiantes: 1, listas: 1, candidatos: 2 });
  const snapshot = await capturarProtecciones();
  const antes = await contarDatos();
  const sim = await simular("candidatos_listas");
  await db.exec(`
    CREATE OR REPLACE FUNCTION fallar_borrado_candidato_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fallo forzado de prueba'; END;
    $$;
    CREATE TRIGGER fallar_borrado_candidato_test BEFORE DELETE ON candidatos
    FOR EACH ROW EXECUTE FUNCTION fallar_borrado_candidato_test();
  `);
  let respuesta;
  try {
    respuesta = await ejecutar("candidatos_listas", sim);
  } finally {
    await db.exec("DROP TRIGGER IF EXISTS fallar_borrado_candidato_test ON candidatos; DROP FUNCTION IF EXISTS fallar_borrado_candidato_test();");
  }
  assert.equal(respuesta.response.status, 500);
  assert.deepEqual(await contarDatos(), antes);
  const audit = (await db.query("SELECT resultado, detalle FROM auditoria_borrado_datos WHERE modo = 'eliminacion' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(audit.resultado, "fallido");
  assert.ok(audit.detalle.motivo.includes("fallo forzado"));
  await afirmarProtecciones(snapshot);
  await afirmarSinSecretosEnAuditoria();
});

test("el reinicio excepcional exige frase, habilitación y autorización; luego reinicia y audita", async () => {
  await prepararDatos({ estudiantes: 2, listas: 1, candidatos: 2, votos: 1, yaVoto: true });
  await db.query("UPDATE configuracion_votacion SET votacion_abierta = TRUE WHERE id = 1");
  const snapshotProtegido = await capturarProtecciones();
  const sim = await simular("reinicio_pruebas");
  assert.equal(sim.bloqueada, false);

  const base = { simulacionId: sim.simulacionId, password: passwordCorrecta, confirmacion: "REINICIAR COMPLETAMENTE DATOS DE PRUEBA", autorizacionAdicional: autorizacionReinicio };
  let respuesta = await solicitar("reinicio-excepcional", { method: "POST", body: { ...base, confirmacion: "FRASE INCORRECTA" } });
  assert.equal(respuesta.response.status, 400);
  assert.equal((await contarDatos()).votos, 1);

  respuesta = await solicitar("reinicio-excepcional", { method: "POST", body: base });
  assert.equal(respuesta.response.status, 403);
  assert.equal((await contarDatos()).votos, 1);

  process.env.BORRADO_DATOS_REINICIO_HABILITADO = "true";
  respuesta = await solicitar("reinicio-excepcional", { method: "POST", body: { ...base, autorizacionAdicional: "codigo incorrecto" } });
  assert.equal(respuesta.response.status, 403);
  assert.equal((await contarDatos()).votos, 1);

  const simFinal = await simular("reinicio_pruebas");
  respuesta = await solicitar("reinicio-excepcional", { method: "POST", body: { ...base, simulacionId: simFinal.simulacionId } });
  assert.equal(respuesta.response.status, 200, JSON.stringify(respuesta.body));
  assert.equal(respuesta.body.modo, "reinicio_excepcional");
  assert.deepEqual(respuesta.body.cantidades, { estudiantes: 2, listas: 1, candidatos: 2, votos: 1, marcasYaVotoRestablecidas: 2 });
  assert.deepEqual(await contarDatos(), { estudiantes: 0, listas: 0, candidatos: 0, votos: 0, ya_voto: 0 });
  const audit = (await db.query("SELECT modo, resultado, detalle FROM auditoria_borrado_datos WHERE operacion = 'reinicio_pruebas' ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(audit.modo, "reinicio_excepcional");
  assert.equal(audit.resultado, "ejecutado");
  assert.equal(audit.detalle.excepcional, true);
  await afirmarProtecciones(snapshotProtegido);
  await afirmarSinSecretosEnAuditoria();
});

test("el código del módulo y las migraciones de auditoría no usan DROP ni TRUNCATE", async () => {
  const archivos = [
    path.join(__dirname, "../repositories/borrado-datos.repository.js"),
    path.join(__dirname, "../services/borrado-datos.service.js"),
    path.join(__dirname, "../routes/borrado-datos.routes.js"),
    path.join(__dirname, "../../database/migrations/007_auditoria_borrado_datos.sql"),
    path.join(__dirname, "../../database/migrations/008_auditoria_intentos_no_autenticados.sql"),
    path.join(__dirname, "../../database/migrations/009_consumo_simulaciones_borrado_datos.sql"),
  ];
  const versiones = (await db.query("SELECT version FROM esquema_migraciones")).rows.map(row => row.version);
  for (const archivo of archivos.filter(archivo => archivo.endsWith(".sql"))) {
    assert.ok(versiones.includes(path.basename(archivo)), `Migración de auditoría aplicada: ${archivo}`);
  }
  for (const archivo of archivos) {
    const contenido = await readFile(archivo, "utf8");
    assert.doesNotMatch(contenido, /\bDROP\s+(?:DATABASE|TABLE)\b|\bTRUNCATE\b/i, archivo);
  }
});
