
const { Router } = require("express");
const { UsuariosError } = require("../errors/usuarios.error");

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
    try {
      const configuracion =
        await votacionConfiguracionService.actualizarConfiguracion(body, req.administrador);

      if (!configuracion) {
        return res.status(503).json({
          mensaje: "No se pudo actualizar la configuración de votación.",
        });
      }

      return res.json({
        mensaje: "Configuración actualizada correctamente.",
        configuracion,
      });
    } catch (error) {
      if (error instanceof UsuariosError) return res.status(error.status).json({ mensaje: error.message });
      return res.status(503).json({
        mensaje: "No se pudo actualizar la configuración de votación.",
      });
    }
  });

  return router;
}

module.exports = { createVotacionConfiguracionRouter };
