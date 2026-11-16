const { Router } = require("express");
const net = require("node:net");
const { asegurarAdministradorInicial } = require("../services/inicializacion");

function esLoopback(address) {
  if (typeof address !== "string") return false;
  const ip = address.startsWith("::ffff:") ? address.slice(7) : address;
  return ip === "::1" || (net.isIP(ip) === 4 && Number(ip.split(".")[0]) === 127);
}

function createInicializacionRouter(pool) {
  const router = Router();
  router.use((req, res, next) => {
    if (!esLoopback(req.socket.remoteAddress)) return res.status(403).json({ mensaje: "La configuración inicial solo está disponible en el servidor." });
    next();
  });
  router.get("/estado", async (req, res) => {
    try {
      const { rows } = await pool.query("SELECT EXISTS (SELECT 1 FROM administradores) AS existe");
      res.json({ requiereAdministrador: !rows[0].existe });
    } catch {
      res.status(503).json({ mensaje: "No se pudo consultar el estado de la configuración inicial." });
    }
  });
  router.post("/administrador-inicial", async (req, res) => {
    try {
      const administrador = await asegurarAdministradorInicial(pool, req.body);
      res.status(201).json({ administrador });
    } catch (error) {
      res.status(error.status || 503).json({ mensaje: error.status ? error.message : "No se pudo crear el administrador inicial." });
    }
  });
  return router;
}

module.exports = { createInicializacionRouter, esLoopback };
