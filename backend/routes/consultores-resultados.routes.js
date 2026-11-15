const { Router } = require("express");
const { createLimiteAcceso } = require("../middleware/limite-acceso");
const { UsuariosError } = require("../errors/usuarios.error");
const { ESPERA } = require("../services/consultores-resultados.service");
function createConsultoresResultadosRouter({ service, autenticarAdministrador, red }) {
  const r = Router();
  r.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const operar = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (e) { res.status(e instanceof UsuariosError ? e.status : 503).json({ mensaje: e instanceof UsuariosError ? e.message : "La consulta de resultados no está disponible." }); }
  };
  r.post("/login", createLimiteAcceso({ limit: 5 }), operar(async (req, res) => res.json(await service.login(req.body))));
  r.get("/resultados", operar(async (req, res) => {
    if (!(await service.autenticar(req.get("Authorization")))) return res.status(401).json({ mensaje: "Inicia sesión como consultor de resultados." });
    const resultados = await service.consultar();
    // La respuesta restringida no incluye conteos ni otros campos electorales.
    return resultados ? res.json(resultados) : res.status(403).json({ mensaje: ESPERA, codigo: "RESULTADOS_NO_PUBLICADOS" });
  }));
  r.use("/administracion", autenticarAdministrador);
  r.get("/administracion", operar(async (req, res) => res.json({ consultores: await service.listar() })));
  r.put("/administracion/:id", (req, res, next) => {
    const origen = req.get("Origin");
    if (!origen || origen === "null" || !red.origenes.includes(origen) || !req.is("application/json") || req.get("X-Consultor-CSRF") !== "1") return res.status(403).json({ mensaje: "Origen o protección CSRF inválidos." });
    next();
  }, operar(async (req, res) => res.json({ consultor: await service.guardar(req.params.id, req.body, req.administrador) })));
  return r;
}
module.exports = { createConsultoresResultadosRouter };
