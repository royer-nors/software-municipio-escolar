const { Router } = require("express");
const bcrypt = require("bcryptjs");
const { createLimiteAcceso } = require("../middleware/limite-acceso");
const { operacionUsuarios } = require("./usuarios.routes");

function createAuthRouter({ authService, estudianteAuthService, administradoresService, autenticarAdministrador, limitesAcceso = {} }) {
  const router = Router();
  router.patch("/password", autenticarAdministrador, createLimiteAcceso(limitesAcceso.administrador),
    operacionUsuarios(req => administradoresService.cambiarPassword(req.administrador.id, req.body)));
  router.post("/login", createLimiteAcceso(limitesAcceso.administrador), async (req, res) => {
    const { usuario, password } = req.body ?? {};
    if (
      typeof usuario !== "string" || !usuario.trim() || usuario.trim().length > 50 ||
      typeof password !== "string" || !password || bcrypt.truncates(password)
    ) {
      return res.status(400).json({ mensaje: "Ingresa un usuario y una contraseña válidos." });
    }
    try {
      const session = await authService.login(usuario.trim(), password);
      if (!session) {
        return res.status(401).json({ mensaje: "Usuario o contraseña incorrectos." });
      }
      res.set("Cache-Control", "no-store");
      return res.json(session);
    } catch {
      return res.status(503).json({ mensaje: "El servicio de autenticación no está disponible." });
    }
  });
  router.post("/estudiante", createLimiteAcceso({ limit: 20, ...limitesAcceso.estudiante }), async (req, res) => {
    const { dni } = req.body ?? {};
    if (typeof dni !== "string" || !/^\d{8}$/.test(dni.trim())) {
      return res.status(400).json({ mensaje: "Ingresa un DNI válido de 8 dígitos." });
    }
    res.set("Cache-Control", "no-store");
    try {
      const result = await estudianteAuthService.identificar(dni.trim());
      if (!result) return res.status(401).json({ mensaje: "El DNI no se encuentra habilitado en el padrón." });
      if (result.estado === "ya_voto") return res.status(409).json({ mensaje: "El estudiante ya emitió su voto." });
      if (result.estado === "fuera_horario") return res.status(409).json({ mensaje: result.mensaje });
      return res.json(result.sesion);
    } catch {
      return res.status(503).json({ mensaje: "El servicio de identificación no está disponible." });
    }
  });
  router.get("/me", autenticarAdministrador, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ administrador: req.administrador });
  });
  return router;
}

module.exports = { createAuthRouter };
