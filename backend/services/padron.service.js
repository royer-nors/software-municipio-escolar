const { leerPadronExcel } = require("./padron-excel");

function createPadronService(padronRepository) {
  return {
    async importar(buffer) {
      const estudiantes = await leerPadronExcel(buffer);
      return padronRepository.reemplazar(estudiantes);
    },
  };
}

module.exports = { createPadronService };
