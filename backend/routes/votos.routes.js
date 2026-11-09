const { Router } = require("express");

function createVotosRouter({ votosService, autenticarEstudiante }) {
  const router = Router();

  router.post("/", autenticarEstudiante, async (req, res) => {
    const body = req.body ?? {};
    const { listaId } = body;

    if (
      !Object.hasOwn(body, "listaId") ||
      (listaId !== null &&
        (!Number.isInteger(listaId) || listaId <= 0 || listaId > 2147483647))
    ) {
      return res.status(400).json({
        mensaje: "Selecciona una lista válida o un voto en blanco explícito.",
      });
    }

    res.set("Cache-Control", "no-store");

    try {
      const estado = await votosService.registrar(req.estudiante.id, listaId);

      if (estado === "votacion_cerrada") {
        return res.status(409).json({
          mensaje: "La votación está cerrada. No se pueden registrar votos.",
        });
      }

      if (estado === "voto_blanco_deshabilitado") {
        return res.status(409).json({
          mensaje: "El voto en blanco está deshabilitado. Selecciona una lista.",
        });
      }

      if (estado === "no_habilitado") {
        return res.status(409).json({
          mensaje: "El estudiante no está habilitado o ya emitió su voto.",
        });
      }

      if (estado === "lista_invalida") {
        return res.status(400).json({
          mensaje: "La lista seleccionada no está disponible.",
        });
      }

      return res.status(201).json({
        mensaje: "Voto registrado correctamente.",
        sesionFinalizada: true,
      });
    } catch {
      return res.status(503).json({
        mensaje: "El registro del voto no está disponible. Consulta tu estado antes de reintentar.",
      });
    }
  });

  return router;
}

module.exports = { createVotosRouter };

