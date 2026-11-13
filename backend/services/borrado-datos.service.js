const bcrypt = require("bcryptjs");
const { timingSafeEqual } = require("node:crypto");

const OPERACIONES = Object.freeze([
  "solo_votos",
  "candidatos_listas",
  "estudiantes",
  "reinicio_pruebas",
]);
const FRASE_CONFIRMACION = "BORRAR DATOS DE PRUEBA";
const FRASE_REINICIO = "REINICIAR COMPLETAMENTE DATOS DE PRUEBA";

class BorradoDatosError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function crearProyeccion(operacion, resumen) {
  const vacio = { estudiantes: 0, listas: 0, candidatos: 0, votos: 0, marcasYaVotoRestablecidas: 0 };
  switch (operacion) {
    case "solo_votos":
      return { ...vacio, votos: resumen.votos, marcasYaVotoRestablecidas: resumen.estudiantes_marcados_ya_voto };
    case "candidatos_listas":
      return {
        ...vacio,
        listas: resumen.listas,
        candidatos: resumen.candidatos,
        votos: resumen.votos,
        marcasYaVotoRestablecidas: resumen.estudiantes_marcados_ya_voto,
      };
    case "estudiantes":
      return { ...vacio, estudiantes: resumen.estudiantes };
    case "reinicio_pruebas":
      return {
        ...vacio,
        estudiantes: resumen.estudiantes,
        listas: resumen.listas,
        candidatos: resumen.candidatos,
        votos: resumen.votos,
        marcasYaVotoRestablecidas: 0,
      };
    default:
      throw new BorradoDatosError(400, "Selecciona una operación de simulación válida.");
  }
}

function obtenerBloqueos(operacion, resumen) {
  const bloqueos = [];
  if (!resumen.configuracion_disponible) bloqueos.push("La configuración de votación no está disponible.");

  if (operacion === "reinicio_pruebas") return bloqueos;

  if (resumen.votacion_abierta) bloqueos.push("La elección está abierta.");
  if (resumen.votos_registrados) bloqueos.push("Hay votos registrados.");
  if (resumen.estudiantes_ya_votaron) bloqueos.push("Hay estudiantes marcados como votantes.");
  return bloqueos;
}

function createBorradoDatosService(repository, administradorRepository, config = process.env) {
  const auditar = async (administrador, operacion, modo, resultado, detalle) => repository.registrarIntento({
    administradorId: Number.isSafeInteger(administrador?.id) ? administrador.id : null,
    administradorUsuario: typeof administrador?.usuario === "string" ? administrador.usuario : "(sin autenticar)",
    operacion: OPERACIONES.includes(operacion) ? operacion : null,
    modo, resultado, detalle,
  });
  const validarEntorno = async () => {
    if (config.NODE_ENV === "production") throw new BorradoDatosError(403, "La eliminación real está deshabilitada en producción.");
    if (config.BORRADO_DATOS_HABILITADO !== "true") throw new BorradoDatosError(403, "La eliminación real está deshabilitada por configuración.");
    if (!config.BORRADO_DATOS_DB_PRUEBAS) throw new BorradoDatosError(403, "No se configuró el nombre de la base de pruebas.");
  };
  const validarPassword = (password, hash) => typeof password === "string" && typeof hash === "string" && bcrypt.compare(password, hash);
  const igualesEnTiempoConstante = (recibido, esperado) => {
    if (typeof recibido !== "string" || typeof esperado !== "string") return false;
    const a = Buffer.from(recibido, "utf8");
    const b = Buffer.from(esperado, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  };

  return {
    async auditarIntentoNoAutenticado(operacion, modo = "eliminacion") {
      await auditar(null, operacion, modo, "fallido", { motivo: "autenticacion_requerida", excepcional: modo === "reinicio_excepcional" });
    },
    async auditarFalloSimulacion(administrador, operacion, motivo) {
      await auditar(administrador, operacion, "simulacion", "fallido", { motivo });
    },

    async obtenerResumen() {
      const resumen = await repository.obtenerResumen();
      return {
        estudiantes: resumen.estudiantes,
        listas: resumen.listas,
        candidatos: resumen.candidatos,
        votos: resumen.votos,
        estudiantesMarcadosYaVoto: resumen.estudiantes_marcados_ya_voto,
        configuracionDisponible: resumen.configuracion_disponible,
        votacionAbierta: resumen.votacion_abierta,
        votosRegistrados: resumen.votos_registrados,
        estudiantesYaVotaron: resumen.estudiantes_ya_votaron,
      };
    },

    async simular(operacion, administrador) {
      if (!OPERACIONES.includes(operacion)) {
        await auditar(administrador, operacion, "simulacion", "fallido", { motivo: "operacion_invalida" });
        throw new BorradoDatosError(400, "Selecciona una operación de simulación válida.");
      }
      if (!Number.isSafeInteger(administrador?.id) || typeof administrador.usuario !== "string") {
        await auditar(null, operacion, "simulacion", "fallido", { motivo: "autenticacion_requerida" });
        throw new BorradoDatosError(401, "Se requiere una sesión administrativa válida.");
      }

      const resumen = await repository.obtenerResumen();
      const proyeccion = crearProyeccion(operacion, resumen);
      const bloqueos = obtenerBloqueos(operacion, resumen);
      const resultado = bloqueos.length ? "bloqueado" : "simulado";
      const detalle = {
        proyeccion,
        bloqueos,
        eliminacionReal: false,
        requiereAutorizacionAdicional: operacion === "reinicio_pruebas",
      };

      const simulacionId = await repository.registrarSimulacion({
        administradorId: administrador.id,
        administradorUsuario: administrador.usuario,
        operacion,
        resultado,
        detalle,
      });

      return {
        operacion,
        modo: "simulacion",
        simulacionId,
        eliminacionReal: false,
        proyeccion,
        bloqueada: bloqueos.length > 0,
        bloqueos,
        requiereAutorizacionAdicional: operacion === "reinicio_pruebas",
      };
    },

    async ejecutar({ operacion, administrador, password, confirmacion, simulacionId, autorizacionAdicional }) {
      const modo = operacion === "reinicio_pruebas" ? "reinicio_excepcional" : "eliminacion";
      const intento = async (status, mensaje, resultado = "fallido", motivo = mensaje) => {
        await auditar(administrador, operacion, modo, resultado, { motivo });
        throw new BorradoDatosError(status, mensaje);
      };
      if (!Number.isSafeInteger(administrador?.id) || typeof administrador?.usuario !== "string") {
        return intento(401, "Se requiere una sesión administrativa válida.", "fallido", "autenticacion_requerida");
      }
      if (!OPERACIONES.includes(operacion) || operacion === "reinicio_pruebas") {
        return intento(400, "La operación de eliminación no es válida.", "fallido", "operacion_invalida");
      }
      if (typeof confirmacion !== "string" || confirmacion !== FRASE_CONFIRMACION) {
        return intento(400, "La frase de confirmación no coincide.", "fallido", "confirmacion_invalida");
      }
      try { await validarEntorno(); }
      catch (error) { return intento(error.status, error.message, "bloqueado", "entorno_no_habilitado"); }
      const sim = Number.isSafeInteger(Number(simulacionId)) ? await repository.consumirSimulacion(Number(simulacionId), administrador.id, operacion) : null;
      if (!sim || sim.resultado !== "simulado") {
        return intento(409, "Realiza una simulación vigente y sin bloqueos antes de continuar.", "fallido", "simulacion_no_valida");
      }
      const admin = await administradorRepository.findById(administrador.id);
      if (!admin?.activo || !(await validarPassword(password, admin.password_hash))) {
        return intento(401, "La contraseña administrativa es incorrecta.", "fallido", "password_incorrecta");
      }
      try {
        const ejecucion = await repository.ejecutar({
          operacion,
          exigirConfiguracion: nombre => nombre === config.BORRADO_DATOS_DB_PRUEBAS,
          proyeccionEsperada: sim.detalle.proyeccion,
        });
        const detalle = { cantidades: ejecucion.cantidades, simulacionId };
        try { await auditar(administrador, operacion, modo, "ejecutado", detalle); }
        catch (error) { console.error("No se pudo registrar la auditoría de la eliminación ejecutada:", error); }
        return { operacion, modo, resultado: "ejecutado", cantidades: ejecucion.cantidades };
      } catch (error) {
        const bloqueado = error.bloqueo === true;
        const obsoleta = error.codigo === "simulacion_obsoleta";
        await auditar(administrador, operacion, modo, bloqueado ? "bloqueado" : "fallido", {
          motivo: error.codigo || error.message || "error_de_ejecucion",
          cantidades: error.cantidades ?? null,
        });
        if (error instanceof BorradoDatosError) throw error;
        throw new BorradoDatosError(bloqueado || obsoleta ? 409 : 500, bloqueado || obsoleta ? error.message : "No se pudo completar la eliminación.");
      }
    },

    async reiniciarPruebas({ administrador, password, confirmacion, simulacionId, autorizacionAdicional }) {
      const intento = async (status, mensaje, resultado = "fallido", motivo = mensaje) => {
        await auditar(administrador, "reinicio_pruebas", "reinicio_excepcional", resultado, { motivo, excepcional: true });
        throw new BorradoDatosError(status, mensaje);
      };
      if (!Number.isSafeInteger(administrador?.id) || typeof administrador?.usuario !== "string") {
        return intento(401, "Se requiere una sesión administrativa válida.", "fallido", "autenticacion_requerida");
      }
      if (confirmacion !== FRASE_REINICIO) return intento(400, "La frase de reinicio no coincide.", "fallido", "confirmacion_invalida");
      if (config.NODE_ENV === "production" || config.BORRADO_DATOS_REINICIO_HABILITADO !== "true" || !config.BORRADO_DATOS_DB_PRUEBAS) {
        return intento(403, "El reinicio excepcional no está habilitado para esta base de pruebas.", "bloqueado", "reinicio_no_habilitado");
      }
      if (!config.BORRADO_DATOS_AUTORIZACION_REINICIO || !igualesEnTiempoConstante(autorizacionAdicional, config.BORRADO_DATOS_AUTORIZACION_REINICIO)) {
        return intento(403, "La autorización adicional de reinicio no es válida.", "fallido", "autorizacion_adicional_invalida");
      }
      const sim = Number.isSafeInteger(Number(simulacionId)) ? await repository.consumirSimulacion(Number(simulacionId), administrador.id, "reinicio_pruebas") : null;
      if (!sim || sim.resultado !== "simulado" || !sim.detalle?.requiereAutorizacionAdicional) {
        return intento(409, "Realiza una simulación del reinicio antes de continuar.", "fallido", "simulacion_no_valida");
      }
      const admin = await administradorRepository.findById(administrador.id);
      if (!admin?.activo || !(await validarPassword(password, admin.password_hash))) {
        return intento(401, "La contraseña administrativa es incorrecta.", "fallido", "password_incorrecta");
      }
      try {
        const ejecucion = await repository.ejecutar({
          operacion: "reinicio_pruebas", excepcion: true,
          exigirConfiguracion: nombre => nombre === config.BORRADO_DATOS_DB_PRUEBAS,
          proyeccionEsperada: sim.detalle.proyeccion,
        });
        try {
          await auditar(administrador, "reinicio_pruebas", "reinicio_excepcional", "ejecutado", {
            excepcional: true, cantidades: ejecucion.cantidades,
          });
        } catch (error) { console.error("No se pudo registrar la auditoría del reinicio ejecutado:", error); }
        return { operacion: "reinicio_pruebas", modo: "reinicio_excepcional", resultado: "ejecutado", cantidades: ejecucion.cantidades };
      } catch (error) {
        await auditar(administrador, "reinicio_pruebas", "reinicio_excepcional", error.bloqueo ? "bloqueado" : "fallido", {
          excepcional: true, motivo: error.message || "error_de_ejecucion",
        });
        throw new BorradoDatosError(error.bloqueo ? 409 : 500, error.bloqueo ? error.message : "No se pudo completar el reinicio excepcional.");
      }
    },
  };
}

module.exports = { createBorradoDatosService, OPERACIONES, BorradoDatosError, FRASE_CONFIRMACION, FRASE_REINICIO };
