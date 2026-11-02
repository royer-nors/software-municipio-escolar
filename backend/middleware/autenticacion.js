const jwt = require("jsonwebtoken");
const { JWT_ISSUER, JWT_AUDIENCE, validateJwtSecret } = require("../config/auth");

function createAutenticacionMiddleware(jwtSecret) {
  const secret = validateJwtSecret(jwtSecret);
  return function autenticarAdministrador(req, res, next) {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") ?? "");
    if (!bearer) {
      return res.status(401).json({ mensaje: "Se requiere un token de acceso válido." });
    }
    try {
      const claims = jwt.verify(bearer[1], secret, {
        algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE,
      });
      if (
        typeof claims !== "object" || typeof claims.sub !== "string" ||
        !/^[1-9]\d*$/.test(claims.sub) || typeof claims.usuario !== "string" ||
        claims.rol !== "administrador" || !Number.isFinite(claims.exp)
      ) {
        return res.status(401).json({ mensaje: "Se requiere un token de acceso válido." });
      }
      req.administrador = { id: Number(claims.sub), usuario: claims.usuario };
    } catch {
      return res.status(401).json({ mensaje: "El token de acceso no es válido o ha expirado." });
    }
    return next();
  };
}

module.exports = { createAutenticacionMiddleware };
