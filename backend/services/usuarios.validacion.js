const bcrypt = require("bcryptjs");
const { UsuariosError } = require("../errors/usuarios.error");
function campos(body, permitidos, obligatorios = []) {
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      Object.keys(body).some(k => !permitidos.includes(k)) ||
      obligatorios.some(k => !Object.hasOwn(body, k)) || !Object.keys(body).length) {
    throw new UsuariosError(400, "Campos incompletos o no permitidos.");
  }
}
function texto(value, max, campo) {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > max) {
    throw new UsuariosError(400, `El campo ${campo} no es válido.`);
  }
  return value.trim();
}
function password(value) {
  if (typeof value !== "string" || value.length < 8 || bcrypt.truncates(value)) {
    throw new UsuariosError(400, "La nueva contraseña debe tener al menos 8 caracteres y como máximo 72 bytes UTF-8.");
  }
  return value;
}
function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) {
    throw new UsuariosError(400, "Identificador inválido.");
  }
  return Number(value);
}
function pagina(query) {
  if (Object.keys(query).some(k => !["buscar", "limit", "offset"].includes(k))) {
    throw new UsuariosError(400, "Parámetro de búsqueda no permitido.");
  }
  const limit = query.limit ?? "50", offset = query.offset ?? "0";
  if (typeof limit !== "string" || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 ||
      typeof offset !== "string" || !/^\d+$/.test(offset) || !Number.isSafeInteger(Number(offset)) || Number(offset) > 2147483647 ||
      (query.buscar !== undefined && (typeof query.buscar !== "string" || query.buscar.length > 100))) {
    throw new UsuariosError(400, "Paginación o búsqueda inválida.");
  }
  return { buscar: query.buscar?.trim() ?? "", limit: Number(limit), offset: Number(offset) };
}
module.exports = { campos, texto, password, id, pagina };
