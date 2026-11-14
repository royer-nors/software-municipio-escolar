const { Router } = require("express");
const { createLimiteAcceso } = require("../middleware/limite-acceso");
const { BorradoDatosError } = require("../services/borrado-datos.service");
function createBorradoDatosRouter({ service, autenticarAdministrador, red }) {
  const router = Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = body => {
      res.json = json;
      if (res.statusCode === 401) return service.auditarIntentoNoAutenticado(req.body?.operacion).catch(() => {}).then(() => json(body));
      return json(body);
    };
    return autenticarAdministrador(req, res, () => { res.json = json; next(); });
  });
  router.use((req, res, next) => {
    if (req.method !== "POST") return next();
    const origen = req.get("Origin");
    if (!origen || origen === "null" || !red.origenes.includes(origen) || !req.is("application/json") || req.get("X-Borrado-CSRF") !== "1") return res.status(403).json({ mensaje: "Origen o protección CSRF inválidos." });
    next();
  });
  const limite = createLimiteAcceso({ limit: 5 });
  const operar = fn => async (req, res) => {
    try { return res.json(await fn(req)); }
    catch (e) { return res.status(e instanceof BorradoDatosError ? e.status : 503).json({ mensaje: e instanceof BorradoDatosError ? e.message : "La gestión de borrado no está disponible." }); }
  };
  router.get("/resumen", operar(() => service.obtenerResumen()));
  router.get("/auditoria", operar(async () => ({ auditoria: await service.listarAuditoria() })));
  router.post("/simulacion", operar(req => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length !== 1) throw new BorradoDatosError(400, "Indica únicamente la operación.");
    return service.simular(req.body.operacion, req.administrador);
  }));
  router.post("/ejecutar", limite, operar(req => service.ejecutar({ ...req.body, administrador: req.administrador })));
  // Alias sin autorización extra para clientes anteriores; mismo flujo seguro.
  router.post("/reinicio-excepcional", limite, operar(req => service.reiniciarPruebas({ ...req.body, administrador: req.administrador })));
  return router;
}
module.exports = { createBorradoDatosRouter };
