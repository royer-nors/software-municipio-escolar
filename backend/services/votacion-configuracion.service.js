const { UsuariosError } = require("../errors/usuarios.error");
function validarConfiguracion(datos) {
  const propios = ["institucion", "ubicacion", "anio", "fecha", "horaInicio", "horaFin", "automatica"];
  const permitidos = [...propios, "revision", "motivo", "confirmarCambioActivo", "votacionAbierta", "votoBlancoHabilitado"];
  const error = mensaje => { throw new UsuariosError(400, mensaje); };
  if (!datos || Array.isArray(datos) || typeof datos !== "object" || !Object.keys(datos).length || Object.keys(datos).some(k => !permitidos.includes(k))) error("Envía campos de configuración válidos.");
  for (const key of ["votacionAbierta", "votoBlancoHabilitado", "automatica", "confirmarCambioActivo"]) {
    if (Object.hasOwn(datos, key) && typeof datos[key] !== "boolean") error("Las opciones de configuración deben ser booleanas.");
  }
  if (Object.hasOwn(datos, "revision") && (!Number.isInteger(datos.revision) || datos.revision < 0)) error("Revisión inválida.");
  if (Object.hasOwn(datos, "motivo") && (typeof datos.motivo !== "string" || datos.motivo.trim().length > 1000)) error("El motivo debe tener hasta 1000 caracteres.");
  const programa = propios.some(k => Object.hasOwn(datos, k));
  if (programa) {
    if (!propios.every(k => Object.hasOwn(datos, k)) || !Number.isInteger(datos.revision)) error("Envía todos los datos del centro, horario y revisión actual.");
    if (Object.hasOwn(datos, "votacionAbierta")) error("Guarda el horario o cambia el control manual en solicitudes separadas.");
    for (const key of ["institucion", "ubicacion"]) {
      if (typeof datos[key] !== "string" || !datos[key].trim() || [...datos[key].trim()].length > 150) error("Institución y ubicación son obligatorias (máximo 150 caracteres).");
    }
    if (!Number.isInteger(datos.anio) || datos.anio < 2000 || datos.anio > 2100) error("Año electoral inválido.");
    const fecha = typeof datos.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ? new Date(`${datos.fecha}T00:00:00Z`) : null;
    if (!fecha || !Number.isFinite(fecha.getTime()) || fecha.toISOString().slice(0,10) !== datos.fecha || fecha.getUTCFullYear() !== datos.anio) error("La fecha debe ser válida y coincidir con el año electoral.");
    if (![datos.horaInicio, datos.horaFin].every(h => typeof h === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(h)) || datos.horaFin <= datos.horaInicio) error("La hora de finalización debe ser posterior a la de inicio (HH:mm).");
  } else if (!["votacionAbierta", "votoBlancoHabilitado"].some(k => Object.hasOwn(datos,k))) error("No se recibió un cambio de configuración.");
  return { ...datos, ...(programa ? { institucion: datos.institucion.trim(), ubicacion: datos.ubicacion.trim() } : {}) };
}
function createVotacionConfiguracionService(votacionConfiguracionRepository) {
  return {
    async obtenerConfiguracion() {
      return votacionConfiguracionRepository.obtener();
    },

    async actualizarConfiguracion(configuracion, administrador) {
      return votacionConfiguracionRepository.actualizar(validarConfiguracion(configuracion), administrador);
    },
  };
}

module.exports = { createVotacionConfiguracionService, validarConfiguracion };
