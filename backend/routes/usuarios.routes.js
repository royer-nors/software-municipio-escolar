const { Router } = require("express");
const { UsuariosError } = require("../errors/usuarios.error");
function operacionUsuarios(handler, status = 200) {
  return async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { return res.status(status).json(await handler(req)); }
    catch (error) {
      if (error instanceof UsuariosError) return res.status(error.status).json({ mensaje: error.message });
      if (error.code === "23505") return res.status(409).json({ mensaje: "El usuario o DNI ya está registrado." });
      return res.status(503).json({ mensaje: "La gestión de usuarios no está disponible." });
    }
  };
}
function createUsuariosRouter({ service, autenticarAdministrador, entidad }) {
  const router = Router();
  router.use(autenticarAdministrador);
  router.post("/", operacionUsuarios(async req => ({ [entidad]: await service.crear(req.body) }), 201));
  router.get("/", operacionUsuarios(async req => ({ [entidad === "administrador" ? "administradores" : "estudiantes"]: await service.listar(req.query) })));
  router.patch("/:id", operacionUsuarios(async req => ({ [entidad]: await service.editar(req.params.id, req.body) })));
  router.patch("/:id/desactivar", operacionUsuarios(async req => ({ [entidad]: await service.desactivar(req.params.id, req.body) })));
  return router;
}
module.exports = { createUsuariosRouter, operacionUsuarios };
