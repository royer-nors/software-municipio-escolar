const { Router } = require("express");

function createResultadosRouter({ resultadosService, autenticarAdministrador }) {
  const router = Router();
  router.get("/", autenticarAdministrador, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      return res.json(await resultadosService.obtenerResultados());
    } catch {
      return res.status(503).json({ mensaje: "Los resultados electorales no están disponibles." });
    }
  });
  return router;
}

module.exports = { createResultadosRouter };
