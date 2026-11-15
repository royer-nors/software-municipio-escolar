const bcrypt = require("bcryptjs");
const { evaluarReinicio } = require("../config/reinicio-electoral");
const modelo = require("./borrado-datos.modelo");
const { OPERACIONES, BorradoDatosError, FRASE_CONFIRMACION, FRASE_REINICIO, crearProyeccion, obtenerBloqueos } = modelo;
function createBorradoDatosService(repository, administradorRepository, config = process.env) {
  const politica = nombre => evaluarReinicio(config, nombre);
  const auditar = (administrador, operacion, modo, resultado, detalle) => repository.registrarIntento({
    administradorId: Number.isSafeInteger(administrador?.id) ? administrador.id : null,
    administradorUsuario: administrador?.usuario || "(sin autenticar)", operacion: OPERACIONES.includes(operacion) ? operacion : null, modo, resultado, detalle,
  });
  async function simular(operacion, administrador) {
    if (!OPERACIONES.includes(operacion)) throw new BorradoDatosError(400, "Selecciona una operación válida.");
    if (!Number.isSafeInteger(administrador?.id)) throw new BorradoDatosError(401, "Se requiere una sesión administrativa válida.");
    const resumen = await repository.obtenerResumen();
    const proyeccion = crearProyeccion(operacion, resumen);
    const bloqueos = obtenerBloqueos(operacion, resumen);
    const permiso = politica(resumen.nombre_base);
    if (!permiso.habilitado) bloqueos.push(permiso.motivo);
    const detalle = { autorizacion: permiso.autorizacion, huellaPolitica: permiso.huella || null, proyeccion, bloqueos, huella: resumen.huella, eliminacionReal: false };
    const simulacionId = await repository.registrarSimulacion({ administradorId: administrador.id, administradorUsuario: administrador.usuario, operacion, resultado: bloqueos.length ? "bloqueado" : "simulado", detalle });
    return { operacion, modo: "simulacion", simulacionId, proyeccion, bloqueada: bloqueos.length > 0, bloqueos, eliminacionReal: false,
      autorizacionReinicio: permiso.autorizacion, requiereAutorizacionAdicional: false, efectos: ["Se revocarán todas las vinculaciones y autorizaciones de puestos.", "Se invalidarán las vistas previas de Excel y se retirarán sus datos temporales.", "La votación quedará cerrada y el horario automático desactivado.", "Se conservarán administradores, consultores, computadoras, migraciones y auditorías."] };
  }
  async function ejecutar(datos) {
    const { operacion, administrador, password, confirmacion, simulacionId } = datos;
    try {
      if (!Number.isSafeInteger(administrador?.id)) throw new BorradoDatosError(401, "Se requiere una sesión administrativa válida.");
      if (Object.keys(datos).some(k => !["operacion", "administrador", "password", "confirmacion", "simulacionId"].includes(k)) || !OPERACIONES.includes(operacion)) throw new BorradoDatosError(400, "Campos u operación no permitidos.");
      const frase = operacion === "reinicio_pruebas" ? FRASE_REINICIO : FRASE_CONFIRMACION;
      if (confirmacion !== frase) throw new BorradoDatosError(400, "La frase de confirmación no coincide.");
      if (typeof password !== "string" || !password || bcrypt.truncates(password)) throw new BorradoDatosError(400, "Introduce una contraseña administrativa válida.");
      if (!Number.isSafeInteger(Number(simulacionId)) || Number(simulacionId) < 1) throw new BorradoDatosError(409, "Realiza primero una simulación vigente.");

      const resultado = await repository.ejecutar({ operacion, administrador, simulacionId: Number(simulacionId),
        verificarPassword: hash => bcrypt.compare(password, hash), exigirConfiguracion: politica });
      return { operacion, modo: "eliminacion", resultado: "ejecutado", ...resultado };
    } catch (e) {
      const ocupado = ["55P03", "40P01", "40001"].includes(e.code);
      await auditar(administrador, operacion, "eliminacion", "fallido", { motivo: e.motivo || (ocupado ? "operaciones_en_curso" : e instanceof BorradoDatosError ? "solicitud_rechazada" : "error_transaccional") });
      if (e instanceof BorradoDatosError) throw e;
      throw new BorradoDatosError(ocupado ? 409 : 503, ocupado ? "Hay operaciones en curso. Espera y simula de nuevo." : "No se completó la operación; los cambios se revirtieron.");
    }
  }
  return {
    listarAuditoria: () => repository.listarAuditoria(),
    async obtenerResumen() {
      const r = await repository.obtenerResumen();
      return { estudiantes: r.estudiantes, estudiantesImportados: r.estudiantes_importados, estudiantesOrigenDesconocido: r.estudiantes_desconocidos,
        listas: r.listas, candidatos: r.candidatos, votos: r.votos, estudiantesMarcadosYaVoto: r.estudiantes_marcados_ya_voto,
        configuracionDisponible: r.configuracion_disponible, votacionAbierta: r.votacion_abierta,
        votosRegistrados: r.votos > 0, estudiantesYaVotaron: r.estudiantes_marcados_ya_voto > 0,
        habilitado: politica(r.nombre_base).habilitado, motivoEntorno: politica(r.nombre_base).motivo, autorizacionReinicio: politica(r.nombre_base).autorizacion };
    },
    simular, ejecutar,
    reiniciarPruebas: datos => ejecutar({ ...datos, operacion: "reinicio_pruebas" }),
    auditarIntentoNoAutenticado: (operacion, modo = "eliminacion") => auditar(null, operacion, modo, "fallido", { motivo: "autenticacion_requerida" }),
    auditarFalloSimulacion: (administrador, operacion, motivo) => auditar(administrador, operacion, "simulacion", "fallido", { motivo }),
  };
}
module.exports = { createBorradoDatosService, ...modelo };
