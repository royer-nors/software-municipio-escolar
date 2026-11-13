const { Router } = require("express");
const { BorradoDatosError, OPERACIONES } = require("../services/borrado-datos.service");

function createBorradoDatosRouter({ service, autenticarAdministrador }) {
  const router = Router();
  const autenticarBorrado = (modo = "eliminacion") => async (req, res, next) => {
    const jsonOriginal = res.json.bind(res);
    res.json = body => {
      if (res.statusCode === 401) {
        const operacion = OPERACIONES.includes(req.body?.operacion) ? req.body.operacion : null;
        return service.auditarIntentoNoAutenticado(operacion, modo)
          .catch(() => undefined)
          .then(() => jsonOriginal(body));
      }
      return jsonOriginal(body);
    };
    return autenticarAdministrador(req, res, next);
  };
  const responderError = (res, error, generico) => {
    if (error instanceof BorradoDatosError) return res.status(error.status).json({ mensaje: error.message });
    return res.status(503).json({ mensaje: generico });
  };

  router.get("/resumen", autenticarBorrado("simulacion"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { return res.json(await service.obtenerResumen()); }
    catch { return res.status(503).json({ mensaje: "El resumen de datos electorales no está disponible." }); }
  });

  router.post("/simulacion", autenticarBorrado("simulacion"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body) || Object.keys(req.body).length !== 1 || typeof req.body.operacion !== "string") {
      await service.auditarFalloSimulacion(req.administrador, null, "solicitud_invalida");
      return res.status(400).json({ mensaje: "Indica una única operación de simulación válida." });
    }
    try { return res.json(await service.simular(req.body.operacion, req.administrador)); }
    catch (error) { return responderError(res, error, "No se pudo completar la simulación."); }
  });

  router.post("/ejecutar", autenticarBorrado(), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      return res.json(await service.ejecutar({ ...(req.body ?? {}), administrador: req.administrador }));
    } catch (error) { return responderError(res, error, "No se pudo completar la eliminación."); }
  });

  router.post("/reinicio-excepcional", autenticarBorrado("reinicio_excepcional"), async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      return res.json(await service.reiniciarPruebas({ ...(req.body ?? {}), administrador: req.administrador }));
    } catch (error) { return responderError(res, error, "No se pudo completar el reinicio excepcional."); }
  });

  return router;
}

module.exports = { createBorradoDatosRouter };
