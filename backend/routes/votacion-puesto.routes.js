const { Router } = require("express");
const { ComputadorasError } = require("../errors/computadoras.error");
const { createVotacionPuestoRepository, validarGrado, errorPuesto } = require("../repositories/votacion-puesto.repository");
const { createEstudianteRepository } = require("../repositories/estudiante.repository");
const { createEstudianteAuthService } = require("../services/estudiante-auth.service");
const { createListasRepository } = require("../repositories/listas.repository");
const { createListasService } = require("../services/listas.service");
const { createVotacionConfiguracionRepository } = require("../repositories/votacion-configuracion.repository");
const { createVotosRepository } = require("../repositories/votos.repository");
const { createVotosService } = require("../services/votos.service");
const { createAutenticacionEstudianteMiddleware } = require("../middleware/autenticacion");
const { createLimiteAcceso } = require("../middleware/limite-acceso");
const { credencial, validarSolicitudPuesto } = require("./vinculacion.routes");

function createVotacionPuestoRouter({ pool, jwtSecret, red, config, limite }) {
  const router = Router();
  const repository = createVotacionPuestoRepository(pool);
  const autenticar = createAutenticacionEstudianteMiddleware(jwtSecret);
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  function ejecutar(operar, status = 200) {
    return async (req, res) => {
      try {
        validarSolicitudPuesto(req, red, config, req.method !== "GET");
        const datos = await repository.ejecutar(credencial(req), (client, puesto) => operar(req, client, puesto));
        res.status(status).json(datos);
      } catch (e) {
        if (e instanceof ComputadorasError) return res.status(e.status).json({ mensaje: e.message, ...(e.codigo ? { codigo: e.codigo } : {}) });
        res.status(503).json({ mensaje: "No se pudo completar la operación. Avisa al encargado antes de reintentar." });
      }
    };
  }
  router.post("/identificar", createLimiteAcceso({ limit: 20, ...limite }), ejecutar(async (req, client, puesto) => {
    if (!req.body || Object.keys(req.body).length !== 1 || typeof req.body.dni !== "string" || !/^\d{8}$/.test(req.body.dni.trim())) throw new ComputadorasError(400, "Ingresa un DNI válido de ocho dígitos.");
    const estudianteRepository = createEstudianteRepository(client);
    const buscar = estudianteRepository.findByDni;
    estudianteRepository.findByDni = async dni => {
      const e = await buscar(dni);
      if (e?.activo && !e.ya_voto) validarGrado(e, puesto);
      return e;
    };
    const service = createEstudianteAuthService({ estudianteRepository, jwtSecret, configuracionRepository: createVotacionConfiguracionRepository(client) });
    const resultado = await service.identificar(req.body.dni.trim(), puesto);
    if (!resultado) throw new ComputadorasError(401, "El DNI no se encuentra habilitado en el padrón.");
    if (resultado.estado === "ya_voto") throw new ComputadorasError(409, "El estudiante ya emitió su voto.");
    if (resultado.estado === "fuera_horario") throw new ComputadorasError(409, resultado.mensaje);
    return resultado.sesion;
  }));
  router.get("/configuracion", ejecutar((req, client) => createVotacionConfiguracionRepository(client).obtener()));
  router.get("/listas", autenticar, ejecutar(async (req, client, puesto) => {
    await repository.estudiante(client, puesto, req.estudiante);
    const resultado = await createListasService(createListasRepository(client)).obtenerListas(req.estudiante.id);
    if (resultado.estado !== "habilitado") throw new ComputadorasError(409, "El estudiante no está habilitado para votar.");
    return { listas: resultado.listas };
  }));
  router.post("/votos", autenticar, ejecutar(async (req, client, puesto) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "listaId") ||
        (body.listaId !== null && (!Number.isInteger(body.listaId) || body.listaId < 1 || body.listaId > 2147483647))) {
      throw new ComputadorasError(400, "Selecciona una lista válida o un voto en blanco explícito.");
    }
    // Compatible entre votos; excluye modificaciones masivas del padrón antes
    // de bloquear filas, conservando el orden usado por la gestión existente.
    await client.query("LOCK TABLE estudiantes, votos IN ROW EXCLUSIVE MODE");
    await repository.estudiante(client, puesto, req.estudiante, true);
    await client.query("SELECT id FROM configuracion_votacion WHERE id=1 FOR SHARE");
    const v = (await client.query("SELECT vence_en>clock_timestamp() AS vigente FROM vinculaciones_puesto WHERE id=$1", [puesto.vinculacionId])).rows[0];
    if (!v?.vigente) throw errorPuesto();
    const resultado = await createVotosService(createVotosRepository(client)).registrar(req.estudiante.id, body.listaId);
    const errores = { votacion_cerrada: [409, "La votación está cerrada."], voto_blanco_deshabilitado: [409, "El voto en blanco está deshabilitado."], no_habilitado: [409, "El estudiante no está habilitado o ya emitió su voto."], lista_invalida: [400, "La lista seleccionada no existe."] };
    if (errores[resultado]) throw new ComputadorasError(...errores[resultado]);
    return { mensaje: "Voto registrado correctamente.", sesionFinalizada: true };
  }, 201));
  return router;
}
module.exports = { createVotacionPuestoRouter };
