const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { JWT_ISSUER, validateJwtSecret } = require("../config/auth");
const v = require("./usuarios.validacion");
const { UsuariosError } = require("../errors/usuarios.error");
const AUDIENCIA = "municipio-escolar-consultor-resultados";
const ROL = "CONSULTOR_RESULTADOS";
const ESPERA = "Los resultados estarán disponibles cuando finalice la elección";
const HASH_FICTICIO = bcrypt.hashSync("cuenta-no-disponible", 12);
function createConsultoresResultadosService(repository, jwtSecret) {
  const secret = validateJwtSecret(jwtSecret);
  return {
    async login(body) {
      v.campos(body, ["usuario", "password"], ["usuario", "password"]);
      const usuario = v.texto(body.usuario, 50, "usuario").toLowerCase();
      if (typeof body.password !== "string" || !body.password || bcrypt.truncates(body.password)) throw new UsuariosError(400, "Introduce usuario y contraseña válidos.");
      const cuenta = await repository.findByUsuario(usuario);
      const correcta = await bcrypt.compare(body.password, cuenta?.password_hash || HASH_FICTICIO);
      if (!cuenta?.activo || !correcta) throw new UsuariosError(401, "Usuario o contraseña incorrectos.");
      return { token: jwt.sign({ rol: ROL, version_token: cuenta.version_token }, secret, {
        algorithm: "HS256", subject: String(cuenta.id), issuer: JWT_ISSUER, audience: AUDIENCIA, expiresIn: 900,
      }), expiraEn: 900, consultor: { id: cuenta.id, usuario: cuenta.usuario, rol: ROL } };
    },
    async autenticar(bearer) {
      try {
        const match = /^Bearer\s+(\S+)$/i.exec(bearer || "");
        if (!match) return null;
        const claims = jwt.verify(match[1], secret, { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: AUDIENCIA });
        if (claims.rol !== ROL || !["1", "2"].includes(claims.sub) || !Number.isFinite(claims.exp) || !Number.isInteger(claims.version_token)) return null;
        const c = await repository.findById(Number(claims.sub));
        return c?.activo && c.version_token === claims.version_token ? { id: c.id, usuario: c.usuario } : null;
      } catch (e) {
        if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(e.name)) return null;
        throw e;
      }
    },
    listar: () => repository.listar(),
    async guardar(id, body, administrador) {
      if (!["1", "2"].includes(String(id))) throw new UsuariosError(400, "Selecciona uno de los dos consultores.");
      v.campos(body, ["usuario", "password", "activo"], ["usuario", "activo"]);
      const usuario = v.texto(body.usuario, 50, "usuario").toLowerCase();
      if (typeof body.activo !== "boolean") throw new UsuariosError(400, "Estado inválido.");
      const hash = Object.hasOwn(body, "password") ? await bcrypt.hash(v.password(body.password), 12) : undefined;
      return repository.guardar(Number(id), { usuario, activo: body.activo, hash }, administrador.id);
    },
    consultar: () => repository.consultarResultados(),
  };
}
module.exports = { createConsultoresResultadosService, AUDIENCIA, ROL, ESPERA };
