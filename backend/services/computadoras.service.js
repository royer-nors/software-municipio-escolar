const { ComputadorasError } = require("../errors/computadoras.error");

function datos(body, crear) {
  const permitidos = crear ? ["identificador", "nombre", "grado"] : ["nombre", "grado", "activo"];
  if (!body || typeof body !== "object" || Array.isArray(body) || !Object.keys(body).length ||
      Object.keys(body).some(k => !permitidos.includes(k)) ||
      (crear && permitidos.some(k => !Object.hasOwn(body, k)))) {
    throw new ComputadorasError(400, "Campos incompletos o no permitidos.");
  }
  const result = {};
  if (crear) {
    if (typeof body.identificador !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,29}$/.test(body.identificador.trim())) {
      throw new ComputadorasError(400, "El identificador debe tener de 1 a 30 letras, números, guiones o guiones bajos.");
    }
    result.identificador = body.identificador.trim().toUpperCase();
  }
  if (Object.hasOwn(body, "nombre")) {
    if (typeof body.nombre !== "string" || !body.nombre.trim() || [...body.nombre.trim()].length > 100 || /[\u0000-\u001f\u007f]/.test(body.nombre)) {
      throw new ComputadorasError(400, "El nombre debe tener de 1 a 100 caracteres sin caracteres de control.");
    }
    result.nombre = body.nombre.trim();
  }
  if (Object.hasOwn(body, "grado")) {
    if (!Number.isInteger(body.grado) || body.grado < 1 || body.grado > 5) {
      throw new ComputadorasError(400, "El grado debe ser un entero de 1 a 5 de secundaria.");
    }
    result.grado = body.grado;
  }
  if (Object.hasOwn(body, "activo")) {
    if (typeof body.activo !== "boolean") throw new ComputadorasError(400, "El estado activo debe ser booleano.");
    result.activo = body.activo;
  }
  return result;
}

function createComputadorasService(repository) {
  return {
    crear(body) { return repository.crear(datos(body, true)); },
    listar(query) {
      const limit = query.limit ?? "50", offset = query.offset ?? "0";
      if (Object.keys(query).some(k => !["limit", "offset"].includes(k)) ||
          typeof limit !== "string" || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 ||
          typeof offset !== "string" || !/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)) || Number(offset) > 2147483647) {
        throw new ComputadorasError(400, "Paginación inválida: limit de 1 a 100 y offset entero no negativo.");
      }
      return repository.listar({ limit: Number(limit), offset: Number(offset) });
    },
    editar(id, body) {
      if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) throw new ComputadorasError(400, "ID de computadora inválido.");
      return repository.editar(Number(id), datos(body, false));
    },
  };
}
module.exports = { createComputadorasService };
