const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_ISSUER, JWT_AUDIENCE, TOKEN_DURATION_SECONDS, validateJwtSecret } = require("../config/auth");

function createAuthService({ administradorRepository, jwtSecret }) {
  const secret = validateJwtSecret(jwtSecret);
  return {
    async login(usuario, password) {
      const administrador = await administradorRepository.findByUsuario(usuario);
      if (!administrador || !administrador.activo || !(await bcrypt.compare(password, administrador.password_hash))) {
        return null;
      }
      const token = jwt.sign(
        { usuario: administrador.usuario, rol: "administrador", version_token: administrador.version_token },
        secret,
        {
          algorithm: "HS256",
          subject: String(administrador.id),
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          expiresIn: TOKEN_DURATION_SECONDS,
        },
      );
      return {
        token,
        tipo: "Bearer",
        expiraEn: TOKEN_DURATION_SECONDS,
        administrador: { id: administrador.id, usuario: administrador.usuario },
      };
    },
  };
}

module.exports = { createAuthService };
