const express = require("express");
const cors = require("cors");
const { createAdministradorRepository } = require("./repositories/administrador.repository");
const { createAuthService } = require("./services/auth.service");
const { createAutenticacionMiddleware } = require("./middleware/autenticacion");
const { createAuthRouter } = require("./routes/auth.routes");

function createApp({ pool, jwtSecret }) {
  const app = express();
  const administradorRepository = createAdministradorRepository(pool);
  const authService = createAuthService({ administradorRepository, jwtSecret });
  const autenticarAdministrador = createAutenticacionMiddleware(jwtSecret);
  app.use(cors());
  app.use(express.json({ limit: "10kb" }));
  app.get("/api/estado", (req, res) => {
    res.json({ mensaje: "Servidor Municipio Escolar funcionando", estado: "activo" });
  });
  app.get("/api/database", async (req, res) => {
    try {
      const resultado = await pool.query("SELECT current_database() AS base_datos, NOW() AS fecha");
      res.json({ mensaje: "Conexión exitosa a PostgreSQL", datos: resultado.rows[0] });
    } catch (error) {
      console.error("Error PostgreSQL:", error.message);
      res.status(500).json({ mensaje: "Error al conectar con PostgreSQL" });
    }
  });
  app.use("/api/auth", createAuthRouter({ authService, autenticarAdministrador }));
  app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
      return res.status(error.status).json({ mensaje: "El cuerpo de la solicitud no es válido." });
    }
    return res.status(500).json({ mensaje: "Ocurrió un error interno." });
  });
  return app;
}

module.exports = { createApp };
