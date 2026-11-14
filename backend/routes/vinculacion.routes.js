const { Router } = require("express");
const { rateLimit } = require("express-rate-limit");
const { ComputadorasError } = require("../errors/computadoras.error");
const COOKIE = "sme_puesto";
function credencial(req) {
  const cookies = (req.get("Cookie") || "").split(";").map(c => c.trim()).filter(c => c.startsWith(`${COOKIE}=`));
  return cookies.length === 1 ? cookies[0].slice(COOKIE.length + 1) : undefined;
}
function operacion(handler) {
  return async (req, res) => {
    try { await handler(req, res); }
    catch (error) {
      if (error instanceof ComputadorasError) return res.status(error.status).json({ mensaje: error.message });
      return res.status(503).json({ mensaje: "La vinculación de equipos no está disponible." });
    }
  };
}
function sinCache(req, res, next) { res.set("Cache-Control", "no-store"); next(); }
function vacio(req) {
  if (req.body !== undefined && (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length)) {
    throw new ComputadorasError(400, "Esta operación no admite campos.");
  }
}
function createVinculacionAdminRouter({ service, autenticarAdministrador }) {
  const router = Router();
  router.use(sinCache, autenticarAdministrador);
  router.get("/:id/vinculacion", operacion(async (req, res) => res.json(await service.estado(req.params.id))));
  router.post("/:id/autorizaciones", operacion(async (req, res) => { vacio(req); res.status(201).json(await service.generar(req.params.id)); }));
  router.post("/:id/revocar", operacion(async (req, res) => { vacio(req); res.json(await service.revocar(req.params.id)); }));
  return router;
}
function createPuestoRouter({ service, red, config, limite }) {
  const router = Router();
  router.use(sinCache);
  router.get("/estado", operacion(async (req, res) => {
    const estado = await service.puesto(credencial(req));
    res.status(estado.estado === "vinculada" ? 200 : 401).json(estado);
  }));
  router.post("/vincular", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, ...limite,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { mensaje: "Demasiados intentos de vinculación. Espera antes de volver a intentar." },
  }), operacion(async (req, res) => {
    const origin = req.get("Origin");
    if (!origin || origin === "null" || !red.origenes.includes(origin) || !req.is("application/json") || req.get("X-Puesto-CSRF") !== "1") {
      throw new ComputadorasError(403, "Origen o protección CSRF inválidos.");
    }
    if (!config.secure) {
      const locales = ["localhost", "127.0.0.1", "[::1]", "::1"];
      if (!locales.includes(new URL(origin).hostname) || !locales.includes(req.hostname) || !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip)) {
        throw new ComputadorasError(403, "Las cookies sin Secure solo se permiten en pruebas de loopback.");
      }
    } else if (!req.secure) {
      throw new ComputadorasError(403, "La vinculación requiere HTTPS.");
    }
    if ((await service.puesto(credencial(req))).estado === "vinculada") throw new ComputadorasError(409, "Este navegador ya tiene un puesto vinculado. Revócalo antes de reemplazarlo.");
    const resultado = await service.vincular(req.body);
    res.cookie(COOKIE, resultado.credencial, { httpOnly: true, secure: config.secure, sameSite: "strict", path: "/api/puesto", maxAge: 12 * 60 * 60 * 1000 });
    res.status(201).json({ estado: "vinculada", vence_en: resultado.vence_en });
  }));
  return router;
}
module.exports = { createVinculacionAdminRouter, createPuestoRouter };
