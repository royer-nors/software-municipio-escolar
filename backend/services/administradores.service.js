const bcrypt = require("bcryptjs");
const v = require("./usuarios.validacion");
const { UsuariosError } = require("../errors/usuarios.error");
function createAdministradoresService(repository) {
  return {
    async crear(body) {
      v.campos(body, ["usuario", "password"], ["usuario", "password"]);
      return repository.crear(v.texto(body.usuario, 50, "usuario"), await bcrypt.hash(v.password(body.password), 12));
    },
    listar(query) { return repository.listar(v.pagina(query)); },
    editar(id, body) {
      v.campos(body, ["usuario"], ["usuario"]);
      return repository.editar(v.id(id), v.texto(body.usuario, 50, "usuario"));
    },
    desactivar(id, body) {
      if (body !== undefined && (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length)) {
        throw new UsuariosError(400, "La desactivación no admite campos.");
      }
      return repository.desactivar(v.id(id));
    },
    async cambiarPassword(id, body) {
      v.campos(body, ["passwordActual", "passwordNueva"], ["passwordActual", "passwordNueva"]);
      if (typeof body.passwordActual !== "string" || !body.passwordActual || bcrypt.truncates(body.passwordActual)) {
        throw new UsuariosError(400, "Contraseña actual inválida.");
      }
      v.password(body.passwordNueva);
      if (body.passwordActual === body.passwordNueva) throw new UsuariosError(400, "La nueva contraseña debe ser diferente a la actual.");
      const admin = await repository.findById(id);
      if (!admin || !admin.activo || !(await bcrypt.compare(body.passwordActual, admin.password_hash))) {
        throw new UsuariosError(401, "La contraseña actual no es correcta o la cuenta no está activa.");
      }
      await repository.cambiarPassword(id, admin.version_token, await bcrypt.hash(body.passwordNueva, 12));
      return { mensaje: "Contraseña actualizada. Inicia sesión nuevamente." };
    },
  };
}
module.exports = { createAdministradoresService };
