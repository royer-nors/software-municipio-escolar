const { UsuariosError } = require("../errors/usuarios.error");
const { normalizarImagen } = require("./imagenes-listas");

function validarDatos(body) {
  const permitidos = ["numeroLista", "nombreLista", "candidatoAlcalde", "propuesta1", "propuesta2"];
  if (!body || Object.keys(body).some(k => !permitidos.includes(k))) throw new UsuariosError(400, "Hay campos no permitidos en el formulario.");
  if (typeof body.numeroLista !== "string" || !/^[1-9]\d*$/.test(body.numeroLista) || Number(body.numeroLista) > 2147483647) throw new UsuariosError(400, "El número de lista debe ser un entero positivo.");
  function texto(value, max, obligatorio = true) {
    if (value === undefined && !obligatorio) return "";
    if (typeof value !== "string" || (obligatorio && !value.trim()) || [...value.trim()].length > max) throw new UsuariosError(400, "Revisa los nombres (máximo 100 caracteres) y las propuestas (máximo 1000 caracteres).");
    return value.trim();
  }
  return {
    numero: Number(body.numeroLista), nombre: texto(body.nombreLista, 100), candidato: texto(body.candidatoAlcalde, 100),
    propuestas: [texto(body.propuesta1, 1000, false), texto(body.propuesta2, 1000, false)].filter(Boolean),
  };
}

function createCandidaturasService(repository, storage) {
  return {
    async crear(body, files = {}) {
      const datos = validarDatos(body);
      const logo = await normalizarImagen(files.logo?.[0]);
      const foto = await normalizarImagen(files.foto?.[0]);
      const guardadas = [];
      try {
        const logoUrl = await storage.guardar(logo);
        if (logoUrl) guardadas.push(logoUrl);
        const fotoUrl = await storage.guardar(foto);
        if (fotoUrl) guardadas.push(fotoUrl);
        return await repository.crear({ ...datos, logoUrl, fotoUrl });
      } catch (error) {
        // Solo archivos creados por esta petición; nunca elimina imágenes existentes.
        if (!error.conservarImagenes) await Promise.allSettled(guardadas.map(url => storage.eliminar(url)));
        throw error;
      }
    },
  };
}
module.exports = { createCandidaturasService };
