const { Router } = require("express");
const { BorradoDatosError } = require("../services/borrado-datos.service");

function createBorradoDatosRouter({ service, autenticarAdministrador }) {
  const router = Router();

  router.get("/resumen", autenticarAdministrador, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      return res.json(await service.obtenerResumen());
    } catch {
      return res.status(503).json({ mensaje: "El resumen de datos electorales no está disponible." });
    }
  });

  router.post("/simulacion", autenticarAdministrador, async (req, res) => {
    res.set("Cache-Control", "no-store");
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 || typeof body.operacion !== "string") {
      return res.status(400).json({ mensaje: "Indica una única operación de simulación válida." });
    }
    try {
      return res.json(await service.simular(body.operacion, req.administrador));
    } catch (error) {
      if (error instanceof BorradoDatosError) return res.status(error.status).json({ mensaje: error.message });
      return res.status(503).json({ mensaje: "No se pudo completar la simulación." });
    }
  });

  return router;
}

module.exports = { createBorradoDatosRouter };