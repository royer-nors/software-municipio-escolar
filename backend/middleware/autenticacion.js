const jwt = require("jsonwebtoken");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE, validateJwtSecret } = require("../config/auth");

function createTokenMiddleware(jwtSecret, audience, rol, identidad) {
  const secret = validateJwtSecret(jwtSecret);
  return function autenticar(req, res, next) {
    const bearer = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") ?? "");
    if (!bearer) {
      return res.status(401).json({ mensaje: "Se requiere un token de acceso válido." });
    }
    try {
      const claims = jwt.verify(bearer[1], secret, {
        algorithms: ["HS256"], issuer: JWT_ISSUER, audience,
      });
      if (
        typeof claims !== "object" || typeof claims.sub !== "string" ||
        !/^[1-9]\d*$/.test(claims.sub) || !Number.isSafeInteger(Number(claims.sub)) ||
        claims.rol !== rol || !Number.isFinite(claims.exp) ||
        (rol === "administrador" && typeof claims.usuario !== "string")
      ) {
        return res.status(401).json({ mensaje: "Se requiere un token de acceso válido." });
      }
      req[identidad] = rol === "administrador"
        ? { id: Number(claims.sub), usuario: claims.usuario }
        : { id: Number(claims.sub) };
    } catch {
      return res.status(401).json({ mensaje: "El token de acceso no es válido o ha expirado." });
    }
    return next();
  };
}

function createAutenticacionMiddleware(jwtSecret) {
  return createTokenMiddleware(jwtSecret, JWT_AUDIENCE, "administrador", "administrador");
}

function createAutenticacionEstudianteMiddleware(jwtSecret) {
  return createTokenMiddleware(jwtSecret, STUDENT_JWT_AUDIENCE, "estudiante", "estudiante");
}

module.exports = { createAutenticacionMiddleware, createAutenticacionEstudianteMiddleware };
