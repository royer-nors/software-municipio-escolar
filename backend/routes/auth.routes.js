const { Router } = require("express");
const bcrypt = require("bcryptjs");

function createAuthRouter({ authService, autenticarAdministrador }) {
  const router = Router();
  router.post("/login", async (req, res) => {
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
  router.get("/me", autenticarAdministrador, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ administrador: req.administrador });
  });
  return router;
}

module.exports = { createAuthRouter };
