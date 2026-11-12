const sharp = require("sharp");
const path = require("node:path");
const { mkdir, writeFile, unlink } = require("node:fs/promises");
const { randomUUID } = require("node:crypto");
const { UsuariosError } = require("../errors/usuarios.error");
const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;
const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || path.join(__dirname, "../storage/listas"));
const formatos = { ".jpg": ["image/jpeg", "jpeg"], ".jpeg": ["image/jpeg", "jpeg"], ".png": ["image/png", "png"], ".webp": ["image/webp", "webp"] };

async function normalizarImagen(file) {
  if (!file) return null;
  const formato = formatos[path.extname(file.originalname).toLowerCase()];
  if (!formato || file.mimetype !== formato[0]) throw new UsuariosError(400, "Las imágenes deben ser JPG, JPEG, PNG o WebP, con el tipo correcto.");
  if (!Buffer.isBuffer(file.buffer) || !file.buffer.length || file.buffer.length > MAX_IMAGEN_BYTES) throw new UsuariosError(413, "Cada imagen debe tener contenido y no superar 2 MiB.");
  const b = file.buffer;
  const firma = formato[1] === "png" ? b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    : formato[1] === "jpeg" ? b.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
      : b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP";
  if (!firma) throw new UsuariosError(400, "El contenido del archivo no corresponde a una imagen permitida.");
  try {
    const image = sharp(file.buffer, { limitInputPixels: 20000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== formato[1] || (metadata.pages || 1) > 1) throw new Error("Formato o animación inválidos");
    // Decodifica y vuelve a codificar; no conserva metadatos ni el archivo original.
    return await image.rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
  } catch { throw new UsuariosError(400, "La imagen está dañada, no corresponde al formato indicado o excede los límites de dimensiones. Usa una imagen estática válida."); }
}

function createImagenesStorage(directory = MEDIA_ROOT) {
  return {
    directory,
    async guardar(buffer) {
      if (!buffer) return null;
      await mkdir(directory, { recursive: true });
      const nombre = `${randomUUID()}.webp`;
      await writeFile(path.join(directory, nombre), buffer, { flag: "wx" });
      return `/api/archivos/${nombre}`;
    },
    async eliminar(url) {
      if (!url || !/^\/api\/archivos\/[a-f0-9-]{36}\.webp$/.test(url)) return;
      try { await unlink(path.join(directory, path.basename(url))); }
      catch (e) { if (e.code !== "ENOENT") throw e; }
    },
  };
}
module.exports = { normalizarImagen, createImagenesStorage, MAX_IMAGEN_BYTES };
