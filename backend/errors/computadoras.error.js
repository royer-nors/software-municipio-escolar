class ComputadorasError extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}
module.exports = { ComputadorasError };
