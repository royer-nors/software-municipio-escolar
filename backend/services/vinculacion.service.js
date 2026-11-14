const { randomBytes, createHash } = require("node:crypto");
const { ComputadorasError } = require("../errors/computadoras.error");
const hash = secreto => createHash("sha256").update(secreto).digest("hex");
const esSecreto = valor => typeof valor === "string" && /^[a-f0-9]{64}$/.test(valor);
function idValido(id) {
  if (!/^[1-9]\d*$/.test(String(id)) || Number(id) > 2147483647) throw new ComputadorasError(400, "ID de computadora inválido.");
  return Number(id);
}
function createVinculacionService(repository) {
  return {
    estado(id) { return repository.estado(idValido(id)); },
    async generar(id) {
      const codigo = randomBytes(32).toString("hex");
      return { codigo, ...(await repository.generar(idValido(id), hash(codigo))) };
    },
    revocar(id) { return repository.revocar(idValido(id)); },
    async vincular(body) {
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !esSecreto(body.codigo)) {
        throw new ComputadorasError(400, "Presenta únicamente un código de autorización válido.");
      }
      const credencial = randomBytes(32).toString("hex");
      return { credencial, ...(await repository.canjear(hash(body.codigo), hash(credencial))) };
    },
    async puesto(credencial) {
      if (!esSecreto(credencial)) return { estado: "sin_vincular" };
      const c = await repository.autenticar(hash(credencial));
      if (!c) return { estado: "sin_vincular" };
      if (c.revocada) return { estado: "revocada" };
      if (!c.activo) return { estado: "deshabilitada" };
      if (c.vencida) return { estado: "vencida" };
      return { estado: "vinculada", computadora: { id: c.id, identificador: c.identificador, nombre: c.nombre, grado: c.grado }, vence_en: c.vence_en };
    },
  };
}
module.exports = { createVinculacionService };
