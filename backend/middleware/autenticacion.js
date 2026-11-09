const jwt = require("jsonwebtoken");
const { JWT_ISSUER, JWT_AUDIENCE, STUDENT_JWT_AUDIENCE, validateJwtSecret } = require("../config/auth");

function createTokenMiddleware(jwtSecret, audience, rol, identidad, administradorRepository) {
  const secret = validateJwtSecret(jwtSecret);
  return async function autenticar(req, res, next) {
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
      if (rol === "administrador") {
        if (!Number.isInteger(claims.version_token) || claims.version_token < 0) {
          return res.status(401).json({ mensaje: "Inicia sesión nuevamente." });
        }
        let administrador;
        try { administrador = await administradorRepository.findById(Number(claims.sub)); }
        catch { return res.status(503).json({ mensaje: "La verificación de acceso no está disponible." }); }
        if (!administrador || !administrador.activo || administrador.version_token !== claims.version_token) {
          return res.status(401).json({ mensaje: "La cuenta no está activa o la sesión fue invalidada." });
        }
        claims.usuario = administrador.usuario;
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

function createAutenticacionMiddleware(jwtSecret, administradorRepository) {
  return createTokenMiddleware(jwtSecret, JWT_AUDIENCE, "administrador", "administrador", administradorRepository);
}

function createAutenticacionEstudianteMiddleware(jwtSecret) {
  return createTokenMiddleware(jwtSecret, STUDENT_JWT_AUDIENCE, "estudiante", "estudiante");
}

module.exports = { createAutenticacionMiddleware, createAutenticacionEstudianteMiddleware };
