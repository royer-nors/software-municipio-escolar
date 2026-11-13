const { Router } = require("express");
const { ComputadorasError } = require("../errors/computadoras.error");

function createComputadorasRouter({ service, autenticarAdministrador }) {
  const router = Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  router.use(autenticarAdministrador);
  function operacion(handler, status = 200) {
    return async (req, res) => {
      try { return res.status(status).json(await handler(req)); }
      catch (error) {
        if (error instanceof ComputadorasError) return res.status(error.status).json({ mensaje: error.message });
        if (error.code === "23505") return res.status(409).json({ mensaje: "El identificador de computadora ya está registrado." });
        return res.status(503).json({ mensaje: "La gestión de computadoras no está disponible." });
      }
    };
  }
  router.get("/", operacion(req => service.listar(req.query)));
  router.post("/", operacion(async req => ({ computadora: await service.crear(req.body) }), 201));
  router.patch("/:id", operacion(async req => ({ computadora: await service.editar(req.params.id, req.body) })));
  return router;
}
module.exports = { createComputadorasRouter };
