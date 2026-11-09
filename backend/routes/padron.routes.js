const { Router } = require("express");
const multer = require("multer");
const path = require("node:path");
const { PadronError } = require("../errors/padron.error");
const { MAX_ARCHIVO_BYTES } = require("../services/padron-excel");

function createPadronRouter({ padronService, autenticarAdministrador }) {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ARCHIVO_BYTES, files: 1, fields: 0, parts: 1 },
    fileFilter(req, file, callback) {
      if (path.extname(file.originalname).toLowerCase() !== ".xlsx") {
        return callback(new PadronError(400, "El padrón debe ser un archivo .xlsx."));
      }
      callback(null, true);
    },
  }).single("archivo");

  router.post("/importar", autenticarAdministrador, (req, res) => {
    res.set("Cache-Control", "no-store");
    upload(req, res, async error => {
      if (error) {
        const status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        const mensaje = error instanceof PadronError ? error.message
          : status === 413 ? "El archivo Excel no puede superar 5 MiB."
            : "Envía un único archivo Excel en el campo archivo, sin campos adicionales.";
        return res.status(status).json({ mensaje });
      }
      try {
        if (!req.file) throw new PadronError(400, "Selecciona un archivo Excel en el campo archivo.");
        const result = await padronService.importar(req.file.buffer);
        return res.json({ mensaje: "Padrón reemplazado correctamente.", ...result });
      } catch (failure) {
        if (failure instanceof PadronError) {
          return res.status(failure.status).json({ mensaje: failure.message, ...(failure.errores ? { errores: failure.errores } : {}) });
        }
        return res.status(503).json({ mensaje: "La importación del padrón no está disponible." });
      }
    });
  });
  return router;
}

module.exports = { createPadronRouter };
