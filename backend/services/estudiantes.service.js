const v = require("./usuarios.validacion");
const { UsuariosError } = require("../errors/usuarios.error");
function datos(body, crear) {
  const permitidos = ["dni", "nombre", "grado", "seccion"];
  v.campos(body, permitidos, crear ? permitidos : []);
  const result = {};
  for (const k of Object.keys(body)) {
    if (k === "dni") {
      if (typeof body.dni !== "string" || !/^\d{8}$/.test(body.dni)) throw new UsuariosError(400, "El DNI debe ser una cadena de ocho dígitos.");
      result.codigo = body.dni;
    } else result[k] = v.texto(body[k], { nombre: 100, grado: 20, seccion: 10 }[k], k);
  }
  return result;
}
function createEstudiantesService(repository) {
  return {
    crear(body) { return repository.crear(datos(body, true)); },
    listar(query) { return repository.listar(v.pagina(query)); },
    editar(id, body) { return repository.editar(v.id(id), datos(body, false)); },
    desactivar(id, body) {
      if (body !== undefined && (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)) throw new UsuariosError(400, "La desactivación no admite campos.");
      return repository.desactivar(v.id(id));
    },
  };
}
module.exports = { createEstudiantesService };
