function createVotacionConfiguracionService(votacionConfiguracionRepository) {
  return {
    async obtenerConfiguracion() {
      return votacionConfiguracionRepository.obtener();
    },

    async actualizarConfiguracion(configuracion) {
      return votacionConfiguracionRepository.actualizar(configuracion);
    },
  };
}

module.exports = { createVotacionConfiguracionService };