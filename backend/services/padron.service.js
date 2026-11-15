const { leerPadronExcel } = require("./padron-excel");
const { PadronError } = require("../errors/padron.error");
function createPadronService(repository) {
  return {
    async previsualizar(buffer, datos, administrador) {
      if (!datos || Object.keys(datos).some(k => !['grado', 'modo'].includes(k)) || !/^[1-5]$/.test(String(datos.grado)) || !['agregar', 'reemplazar'].includes(datos.modo)) throw new PadronError(400, "Selecciona grado y modo de importación válidos.");
      const grado = Number(datos.grado);
      return repository.previsualizar(await leerPadronExcel(buffer, grado), grado, datos.modo, administrador);
    },
    confirmar(datos, administrador) {
      if (!datos || Array.isArray(datos) || Object.keys(datos).some(k => !['vistaPreviaId', 'confirmar'].includes(k)) ||
        typeof datos.vistaPreviaId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(datos.vistaPreviaId) || datos.confirmar !== true) throw new PadronError(400, "Revisa y confirma una vista previa válida antes de importar.");
      return repository.confirmar(datos.vistaPreviaId, administrador);
    },
  };
}
module.exports = { createPadronService };
