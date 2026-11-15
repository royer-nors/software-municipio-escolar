const { test } = require("node:test");
const assert = require("node:assert/strict");
const { evaluarReinicio } = require("../config/reinicio-electoral");
const base = "db_municipio_escolar";
test("reinicio real explicito funciona en produccion sin documentos", () => {
  for (const NODE_ENV of [undefined, "test", "production"]) {
    const r = evaluarReinicio({ NODE_ENV, REINICIO_ELECTORAL_HABILITADO: "true", REINICIO_ELECTORAL_BASE: base }, base);
    assert.equal(r.habilitado, true); assert.equal(r.autorizacion.tipo, "administrativa"); assert.ok(r.huella);
  }
});
test("variables de pruebas nunca habilitan la base real", () => {
  for (const NODE_ENV of [undefined, "test", "production"]) assert.equal(evaluarReinicio({ NODE_ENV, BORRADO_DATOS_HABILITADO: "true", BORRADO_DATOS_DB_PRUEBAS: base }, base).habilitado, false);
});
test("ambas variables reales son obligatorias y la base es exacta", () => {
  for (const config of [{}, { REINICIO_ELECTORAL_HABILITADO: "true" }, { REINICIO_ELECTORAL_BASE: base }, { REINICIO_ELECTORAL_HABILITADO: "TRUE", REINICIO_ELECTORAL_BASE: base }, { REINICIO_ELECTORAL_HABILITADO: "true", REINICIO_ELECTORAL_BASE: "otra" }]) assert.equal(evaluarReinicio(config, base).habilitado, false);
  assert.equal(evaluarReinicio({ REINICIO_ELECTORAL_HABILITADO: "true", REINICIO_ELECTORAL_BASE: "otra" }, "otra").habilitado, false);
});
test("configuracion de pruebas permanece separada y bloqueada en produccion", () => {
  const config = { BORRADO_DATOS_HABILITADO: "true" };
  assert.equal(evaluarReinicio(config, "db_municipio_escolar_pruebas").habilitado, true);
  assert.equal(evaluarReinicio({ ...config, NODE_ENV: "production" }, "db_municipio_escolar_pruebas").habilitado, false);
});
