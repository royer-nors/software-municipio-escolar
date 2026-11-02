const { Router } = require("express");

function createListasRouter({ listasService, autenticarEstudiante }) {
  const router = Router();
  router.get("/", autenticarEstudiante, async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      const result = await listasService.obtenerListas(req.estudiante.id);
      if (result.estado === "no_habilitado") {
        return res.status(401).json({ mensaje: "El estudiante no está habilitado en el padrón." });
      }
      if (result.estado === "ya_voto") {
        return res.status(409).json({ mensaje: "El estudiante ya emitió su voto." });
      }
      return res.json({ listas: result.listas });
    } catch {
      return res.status(503).json({ mensaje: "Las listas electorales no están disponibles." });
    }
  });
  return router;
}

module.exports = { createListasRouter };
