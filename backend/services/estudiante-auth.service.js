const jwt = require("jsonwebtoken");
const {
  JWT_ISSUER, STUDENT_JWT_AUDIENCE, STUDENT_TOKEN_DURATION_SECONDS, validateJwtSecret,
} = require("../config/auth");

function createEstudianteAuthService({ estudianteRepository, jwtSecret }) {
  const secret = validateJwtSecret(jwtSecret);
  return {
    async identificar(dni) {
      const estudiante = await estudianteRepository.findByDni(dni);
      if (!estudiante) return null;
      if (estudiante.ya_voto) return { estado: "ya_voto" };

      const token = jwt.sign({ rol: "estudiante" }, secret, {
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
