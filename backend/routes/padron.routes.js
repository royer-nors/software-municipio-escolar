const { Router } = require("express");
const multer = require("multer");
const path = require("node:path");
const { PadronError } = require("../errors/padron.error");
const { MAX_ARCHIVO_BYTES } = require("../services/padron-excel");
const { createLimiteAcceso } = require("../middleware/limite-acceso");
function createPadronRouter({ padronService, autenticarAdministrador, red }) {
  const router = Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(autenticarAdministrador);
  router.use((req, res, next) => {
    const origen = req.get('Origin');
    if (req.method !== 'POST') return next();
    if (!origen || origen === 'null' || !(red.origenPermitido?.(origen) ?? red.origenes.includes(origen)) || req.get('X-Padron-CSRF') !== '1') return res.status(403).json({ mensaje: 'Origen o protección CSRF inválidos.' });
    next();
  });
  router.use(createLimiteAcceso({ limit: 20 }));
  const error = (res, e) => res.status(e instanceof PadronError ? e.status : 503).json({ mensaje: e instanceof PadronError ? e.message : 'No se completó la importación. Revisa el padrón antes de repetirla.', ...(e.errores ? { errores: e.errores } : {}) });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ARCHIVO_BYTES, files: 1, fields: 2, parts: 3, fieldSize: 30 },
    fileFilter(req, file, cb) { cb(path.extname(file.originalname).toLowerCase() === '.xlsx' ? null : new PadronError(400, 'El padrón debe ser un archivo .xlsx.'), true); },
  }).single('archivo');
  router.post('/previsualizar', (req, res) => upload(req, res, async e => {
    if (e) return error(res, e instanceof PadronError ? e : new PadronError(e.code === 'LIMIT_FILE_SIZE' ? 413 : 400, 'Envía un Excel de hasta 5 MiB y únicamente grado y modo.'));
    try {
      if (!req.file) throw new PadronError(400, 'Selecciona un archivo Excel.');
      res.json(await padronService.previsualizar(req.file.buffer, req.body, req.administrador));
    } catch (e) { error(res, e); }
  }));
  router.post('/importar', async (req, res) => {
    try {
      if (!req.is('application/json')) throw new PadronError(400, 'La carga global fue reemplazada. Genera una vista previa por grado antes de confirmar.');
      res.json({ mensaje: 'Padrón del grado importado correctamente.', ...await padronService.confirmar(req.body, req.administrador) });
    } catch (e) { error(res, e); }
  });
  return router;
}
module.exports = { createPadronRouter };
