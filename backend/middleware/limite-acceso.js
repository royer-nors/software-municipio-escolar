const { rateLimit } = require("express-rate-limit");

function createLimiteAcceso({ limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { mensaje: "Demasiados intentos de acceso. Inténtalo de nuevo más tarde." },
  });
}

module.exports = { createLimiteAcceso };
