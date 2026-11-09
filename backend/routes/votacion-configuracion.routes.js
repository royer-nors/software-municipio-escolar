
const { Router } = require("express");

function createVotacionConfiguracionRouter({
  votacionConfiguracionService,
  autenticarAdministrador,
}) {
  const router = Router();

  // Consultar configuración actual.
  router.get("/", async (req, res) => {
    res.set("Cache-Control", "no-store");

    try {
      const configuracion =
        await votacionConfiguracionService.obtenerConfiguracion();

      if (!configuracion) {
        return res.status(503).json({
          mensaje: "La configuración de votación no está disponible.",
        });
      }

      return res.json(configuracion);
    } catch {
      return res.status(503).json({
        mensaje: "No se pudo consultar la configuración de votación.",
      });
    }
  });

  // Actualizar configuración: solo administrador.
  router.patch("/", autenticarAdministrador, async (req, res) => {
    res.set("Cache-Control", "no-store");

    const body = req.body ?? {};
    const camposPermitidos = ["votacionAbierta", "votoBlancoHabilitado"];
    const camposRecibidos = Object.keys(body);

    if (
      camposRecibidos.length === 0 ||
      camposRecibidos.some(campo => !camposPermitidos.includes(campo)) ||
      camposRecibidos.some(campo => typeof body[campo] !== "boolean")
    ) {
      return res.status(400).json({
        mensaje: "Envía al menos una configuración válida de tipo booleano.",
      });
    }

    try {
      const configuracion =
        await votacionConfiguracionService.actualizarConfiguracion(body);

      if (!configuracion) {
        return res.status(503).json({
          mensaje: "No se pudo actualizar la configuración de votación.",
        });
      }

      return res.json({
        mensaje: "Configuración actualizada correctamente.",
        configuracion,
      });
    } catch {
      return res.status(503).json({
        mensaje: "No se pudo actualizar la configuración de votación.",
      });
    }
  });

  return router;
}

module.exports = { createVotacionConfiguracionRouter };