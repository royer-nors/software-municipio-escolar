const jwt = require("jsonwebtoken");
const {
  JWT_ISSUER, STUDENT_JWT_AUDIENCE, STUDENT_TOKEN_DURATION_SECONDS, validateJwtSecret,
} = require("../config/auth");

function createEstudianteAuthService({ estudianteRepository, jwtSecret, configuracionRepository }) {
  const secret = validateJwtSecret(jwtSecret);
  return {
    async identificar(dni, puesto) {
      const estudiante = await estudianteRepository.findByDni(dni);
      if (!estudiante || !estudiante.activo) return null;
      if (estudiante.ya_voto) return { estado: "ya_voto" };
      if (configuracionRepository) {
        const config = await configuracionRepository.obtener();
        if (!config) throw new Error("Configuración no disponible");
        if (puesto && !config.votacionAbierta) return { estado: "fuera_horario", mensaje: "La votación está cerrada. Espera las indicaciones del encargado." };
        if (config.automatica && !config.votacionAbierta) return { estado: "fuera_horario", mensaje: `Votación ${config.estado.toLowerCase()}. Fecha: ${config.fecha} (año-mes-día), de ${config.horaInicio} a ${config.horaFin}, America/Lima.` };
      }

      const token = jwt.sign({ rol: "estudiante", ...(puesto ? { vinculacionId: puesto.vinculacionId } : {}) }, secret, {
        algorithm: "HS256",
        subject: String(estudiante.id),
        issuer: JWT_ISSUER,
        audience: STUDENT_JWT_AUDIENCE,
        expiresIn: STUDENT_TOKEN_DURATION_SECONDS,
      });
      return {
        estado: "habilitado",
        sesion: {
          token,
          tipo: "Bearer",
          expiraEn: STUDENT_TOKEN_DURATION_SECONDS,
          habilitadoParaVotar: true,
          estudiante: { id: estudiante.id, dni: estudiante.dni, nombre: estudiante.nombre },
        },
      };
    },
  };
}

module.exports = { createEstudianteAuthService };
