// Harness EXCLUSIVO de pruebas de routers/servicios heredados en aislamiento.
// No es el servidor de producción. El app real bloquea estas tres rutas;
// votacion-puesto.test.js comprueba ese bloqueo incluso con cookies y JWT válidos.
const express = require("express");
const { createApp } = require("../app");
const { createAuthRouter } = require("../routes/auth.routes");
const { createEstudianteAuthService } = require("../services/estudiante-auth.service");
const { createEstudianteRepository } = require("../repositories/estudiante.repository");
const { createVotacionConfiguracionRepository } = require("../repositories/votacion-configuracion.repository");
const { createListasRouter } = require("../routes/listas.routes");
const { createListasService } = require("../services/listas.service");
const { createListasRepository } = require("../repositories/listas.repository");
const { createVotosRouter } = require("../routes/votos.routes");
const { createVotosService } = require("../services/votos.service");
const { createVotosRepository } = require("../repositories/votos.repository");
const { createAutenticacionEstudianteMiddleware } = require("../middleware/autenticacion");
function createLegacyRouterHarness(opciones) {
  const { pool, jwtSecret, limitesAcceso } = opciones;
  const app = express(); app.use(express.json({ limit: "10kb" }));
  const auth = createAuthRouter({ estudianteAuthService: createEstudianteAuthService({
    estudianteRepository: createEstudianteRepository(pool), jwtSecret,
    configuracionRepository: createVotacionConfiguracionRepository(pool),
  }), limitesAcceso, autenticarAdministrador: (req, res) => res.sendStatus(401) });
  app.use("/api/auth", (req, res, next) => req.path === "/estudiante" ? auth(req, res, next) : next());
  const autenticarEstudiante = createAutenticacionEstudianteMiddleware(jwtSecret);
  app.use("/api/listas", createListasRouter({ listasService: createListasService(createListasRepository(pool)), autenticarEstudiante }));
  app.use("/api/votos", createVotosRouter({ votosService: createVotosService(createVotosRepository(pool)), autenticarEstudiante }));
  app.use(createApp(opciones));
  return app;
}
module.exports = { createLegacyRouterHarness };
