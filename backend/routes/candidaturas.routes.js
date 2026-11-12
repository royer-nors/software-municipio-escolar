const { Router } = require("express");
const multer = require("multer");
const { UsuariosError } = require("../errors/usuarios.error");
const { MAX_IMAGEN_BYTES } = require("../services/imagenes-listas");

function createCandidaturasRouter({ service, autenticarAdministrador }) {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: {
    fileSize: MAX_IMAGEN_BYTES, files: 2, fields: 5, parts: 7, fieldSize: 4096,
  } }).fields([{ name: "logo", maxCount: 1 }, { name: "foto", maxCount: 1 }]);
  router.post("/", autenticarAdministrador, (req, res) => {
    res.set("Cache-Control", "no-store");
    upload(req, res, async error => {
      if (error) return res.status(error.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ mensaje: error.code === "LIMIT_FILE_SIZE" ? "Cada imagen debe ser de hasta 2 MiB." : "Envía los datos de la lista y como máximo un logo y una fotografía." });
      try { return res.status(201).json(await service.crear(req.body, req.files)); }
      catch (failure) {
        if (failure instanceof UsuariosError) return res.status(failure.status).json({ mensaje: failure.message });
        if (failure.code === "23505") return res.status(409).json({ mensaje: "Ya existe una lista con ese número o nombre." });
        return res.status(503).json({ mensaje: "No se pudo registrar la lista. Verifica su estado antes de reintentar." });
      }
    });
  });
  return router;
}
module.exports = { createCandidaturasRouter };
