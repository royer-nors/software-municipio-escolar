const express = require("express");
const cors = require("cors");
const { createAdministradorRepository } = require("./repositories/administrador.repository");
const { createAuthService } = require("./services/auth.service");
const { createAutenticacionMiddleware, createAutenticacionEstudianteMiddleware } = require("./middleware/autenticacion");
const { createAuthRouter } = require("./routes/auth.routes");
const { createResultadosRepository } = require("./repositories/resultados.repository");
const { createResultadosService } = require("./services/resultados.service");
const { createResultadosRouter } = require("./routes/resultados.routes");
const { createEstudianteRepository } = require("./repositories/estudiante.repository");
const { createEstudianteAuthService } = require("./services/estudiante-auth.service");
const { createListasRepository } = require("./repositories/listas.repository");
const { createListasService } = require("./services/listas.service");
const { createListasRouter } = require("./routes/listas.routes");
const { createVotosRepository } = require("./repositories/votos.repository");
const { createVotosService } = require("./services/votos.service");
const { createVotosRouter } = require("./routes/votos.routes");
const { createPadronRepository } = require("./repositories/padron.repository");
const { createPadronService } = require("./services/padron.service");
const { createPadronRouter } = require("./routes/padron.routes");
const { createAdministradoresService } = require("./services/administradores.service");
const { createEstudiantesService } = require("./services/estudiantes.service");
const { createUsuariosRouter } = require("./routes/usuarios.routes");

function createApp({ pool, jwtSecret, limitesAcceso }) {
  const app = express();
  const administradorRepository = createAdministradorRepository(pool);
  const authService = createAuthService({ administradorRepository, jwtSecret });
  const autenticarAdministrador = createAutenticacionMiddleware(jwtSecret, administradorRepository);
  const administradoresService = createAdministradoresService(administradorRepository);
  const estudiantesService = createEstudiantesService(createEstudianteRepository(pool));
  const estudianteAuthService = createEstudianteAuthService({
    estudianteRepository: createEstudianteRepository(pool), jwtSecret,
  });
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
  app.use("/api/auth", createAuthRouter({ authService, estudianteAuthService, administradoresService, autenticarAdministrador, limitesAcceso }));
  app.use("/api/administradores", createUsuariosRouter({ service: administradoresService, autenticarAdministrador, entidad: "administrador" }));
  app.use("/api/estudiantes", createUsuariosRouter({ service: estudiantesService, autenticarAdministrador, entidad: "estudiante" }));
  const resultadosService = createResultadosService(createResultadosRepository(pool));
  app.use("/api/resultados", createResultadosRouter({ resultadosService, autenticarAdministrador }));
  const listasService = createListasService(createListasRepository(pool));
  const autenticarEstudiante = createAutenticacionEstudianteMiddleware(jwtSecret);
  app.use("/api/listas", createListasRouter({ listasService, autenticarEstudiante }));
  const votosService = createVotosService(createVotosRepository(pool));
  app.use("/api/votos", createVotosRouter({ votosService, autenticarEstudiante }));
  const padronService = createPadronService(createPadronRepository(pool));
  app.use("/api/padron", createPadronRouter({ padronService, autenticarAdministrador }));
  app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
      return res.status(error.status).json({ mensaje: "El cuerpo de la solicitud no es válido." });
    }
    return res.status(500).json({ mensaje: "Ocurrió un error interno." });
  });
  return app;
}

module.exports = { createApp };
