const { createHash } = require("node:crypto");
function evaluarReinicio(config, nombre) {
  const bloquear = motivo => ({ habilitado: false, motivo, autorizacion: null });
  if (nombre === "db_municipio_escolar") {
    if (config.REINICIO_ELECTORAL_HABILITADO !== "true" || config.REINICIO_ELECTORAL_BASE !== nombre)
      return bloquear("El reinicio real requiere REINICIO_ELECTORAL_HABILITADO=true y REINICIO_ELECTORAL_BASE=db_municipio_escolar en el servidor.");
    const autorizacion = { tipo: "administrativa", base: nombre };
    return { habilitado: true, motivo: null, autorizacion, huella: createHash("sha256").update(JSON.stringify(autorizacion)).digest("hex") };
  }
  const pruebas = config.NODE_ENV !== "production" && config.BORRADO_DATOS_HABILITADO === "true" &&
    ["postgres", "db_municipio_escolar_pruebas"].includes(nombre) &&
    nombre === (config.BORRADO_DATOS_DB_PRUEBAS || "db_municipio_escolar_pruebas");
  return pruebas ? { habilitado: true, motivo: null, autorizacion: { tipo: "pruebas" } } : bloquear("La base no tiene habilitado el reinicio electoral.");
}
module.exports = { evaluarReinicio };
