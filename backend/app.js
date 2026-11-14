const express = require("express");
const cors = require("cors");
const { configurarRed } = require("./config/red");
const { configurarPuesto } = require("./config/puesto");
const { createVinculacionRepository } = require("./repositories/vinculacion.repository");
const { createVinculacionService } = require("./services/vinculacion.service");
const { createVinculacionAdminRouter, createPuestoRouter } = require("./routes/vinculacion.routes");
const { createComputadorasRepository } = require("./repositories/computadoras.repository");
const { createComputadorasService } = require("./services/computadoras.service");
const { createComputadorasRouter } = require("./routes/computadoras.routes");
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
const { createVotacionConfiguracionRepository } = require("./repositories/votacion-configuracion.repository");
const { createVotacionConfiguracionService } = require("./services/votacion-configuracion.service");
const { createVotacionConfiguracionRouter } = require("./routes/votacion-configuracion.routes");
const { createImagenesStorage } = require("./services/imagenes-listas");
const { createCandidaturasRepository } = require("./repositories/candidaturas.repository");
const { createCandidaturasService } = require("./services/candidaturas.service");
const { createCandidaturasRouter } = require("./routes/candidaturas.routes");
const { createBorradoDatosRepository } = require("./repositories/borrado-datos.repository");
const { createBorradoDatosService } = require("./services/borrado-datos.service");
const { createBorradoDatosRouter } = require("./routes/borrado-datos.routes");

function createApp({ pool, jwtSecret, limitesAcceso, imagenesStorage = createImagenesStorage(), red = configurarRed(), puesto = configurarPuesto() }) {
  const app = express();
  if (puesto.proxyLoopback) app.set("trust proxy", "loopback");
  const administradorRepository = createAdministradorRepository(pool);
  const authService = createAuthService({ administradorRepository, jwtSecret });
  const autenticarAdministrador = createAutenticacionMiddleware(jwtSecret, administradorRepository);
  const votacionConfiguracionRepository = createVotacionConfiguracionRepository(pool);
  const votacionConfiguracionService = createVotacionConfiguracionService(votacionConfiguracionRepository);
  const administradoresService = createAdministradoresService(administradorRepository);
  const estudiantesService = createEstudiantesService(createEstudianteRepository(pool));
  const estudianteAuthService = createEstudianteAuthService({
    estudianteRepository: createEstudianteRepository(pool), jwtSecret, configuracionRepository: votacionConfiguracionRepository,
  });
  app.use((req, res, next) => {
    const origen = req.get("Origin");
    if (origen !== undefined && !red.origenes.includes(origen) && !(origen === "null" && red.permitirOrigenNull)) {
      return res.status(403).json({ mensaje: "Origen no autorizado." });
    }
    return next();
  });
  app.use(cors((req, callback) => callback(null, {
    origin: (origen, callback) => callback(null, origen ?? false),
    credentials: req.path.startsWith("/api/puesto/"),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Puesto-CSRF"],
  })));
  app.use(express.json({ limit: "10kb" }));
  app.get("/api/archivos/:nombre", (req, res) => {
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(req.params.nombre)) return res.sendStatus(404);
    res.set({ "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Type": "image/webp" });
    res.sendFile(req.params.nombre, { root: imagenesStorage.directory, dotfiles: "deny", immutable: true, maxAge: "1y" }, error => {
      if (error && !res.headersSent) res.status(error.status === 404 ? 404 : 500).end();
    });
  });
  app.use("/api/candidaturas", createCandidaturasRouter({
    service: createCandidaturasService(createCandidaturasRepository(pool), imagenesStorage), autenticarAdministrador,
  }));
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
  app.use("/api/computadoras", createComputadorasRouter({
    service: createComputadorasService(createComputadorasRepository(pool)), autenticarAdministrador,
  }));
  const vinculacionService = createVinculacionService(createVinculacionRepository(pool));
  app.use("/api/computadoras", createVinculacionAdminRouter({ service: vinculacionService, autenticarAdministrador }));
  app.use("/api/puesto", createPuestoRouter({ service: vinculacionService, red, config: puesto, limite: limitesAcceso?.vinculacion }));
  app.use("/api/borrado-datos", createBorradoDatosRouter({
    service: createBorradoDatosService(createBorradoDatosRepository(pool), administradorRepository), autenticarAdministrador,
  }));
  const resultadosService = createResultadosService(createResultadosRepository(pool));
  app.use("/api/resultados", createResultadosRouter({ resultadosService, autenticarAdministrador }));
  const listasService = createListasService(createListasRepository(pool));
  const autenticarEstudiante = createAutenticacionEstudianteMiddleware(jwtSecret);
  app.use("/api/listas", createListasRouter({ listasService, autenticarEstudiante }));
  const votosService = createVotosService(createVotosRepository(pool));
  app.use("/api/votos", createVotosRouter({ votosService, autenticarEstudiante }));
  const padronService = createPadronService(createPadronRepository(pool));
  app.use("/api/padron", createPadronRouter({ padronService, autenticarAdministrador }));
  app.use(
  "/api/votacion/configuracion",
  createVotacionConfiguracionRouter({
    votacionConfiguracionService,
    autenticarAdministrador,
  })
);
  app.use((error, req, res, next) => {
    if (error.type === "entity.parse.failed" || error.type === "entity.too.large") {
      return res.status(error.status).json({ mensaje: "El cuerpo de la solicitud no es válido." });
    }
    return res.status(500).json({ mensaje: "Ocurrió un error interno." });
  });
  return app;
}

module.exports = { createApp };
