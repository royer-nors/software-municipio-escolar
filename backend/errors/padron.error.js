class PadronError extends Error {
  constructor(status, mensaje, errores) {
    super(mensaje);
    this.name = "PadronError";
    this.status = status;
    this.errores = errores;
  }
}

module.exports = { PadronError };
