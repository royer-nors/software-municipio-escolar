const OPERACIONES = Object.freeze([
  "solo_votos",
  "candidatos_listas",
  "estudiantes",
  "reinicio_pruebas",
]);

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
      };
    default:
      throw new BorradoDatosError(400, "Selecciona una operación de simulación válida.");
  }
}

function obtenerBloqueos(operacion, resumen) {
  const bloqueos = [];
  if (!resumen.configuracion_disponible) bloqueos.push("La configuración de votación no está disponible.");

  if (operacion === "reinicio_pruebas") {
    bloqueos.push("El reinicio excepcional requiere autorización adicional, aún no implementada.");
    return bloqueos;
  }

  if (resumen.votacion_abierta) bloqueos.push("La elección está abierta.");
  if (resumen.votos_registrados) bloqueos.push("Hay votos registrados.");
  if (resumen.estudiantes_ya_votaron) bloqueos.push("Hay estudiantes marcados como votantes.");
  return bloqueos;
}

function createBorradoDatosService(repository) {
  return {
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
        throw new BorradoDatosError(400, "Selecciona una operación de simulación válida.");
      }
      if (!Number.isSafeInteger(administrador?.id) || typeof administrador.usuario !== "string") {
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

      await repository.registrarSimulacion({
        administradorId: administrador.id,
        administradorUsuario: administrador.usuario,
        operacion,
        resultado,
        detalle,
      });

      return {
        operacion,
        modo: "simulacion",
        eliminacionReal: false,
        proyeccion,
        bloqueada: bloqueos.length > 0,
        bloqueos,
        requiereAutorizacionAdicional: operacion === "reinicio_pruebas",
      };
    },
  };
}

module.exports = { createBorradoDatosService, OPERACIONES, BorradoDatosError };