function createVotosService(votosRepository) {
  return {
    async registrar(estudianteId, listaId) {
      try {
        await votosRepository.registrar(estudianteId, listaId);
        return "registrado";
      } catch (error) {
        if (error.code === "V0001") return "votacion_cerrada";
        if (error.code === "V0002") return "voto_blanco_deshabilitado";
        if (error.code === "P0001") return "no_habilitado";
        if (error.code === "23503") return "lista_invalida";
        throw error;
      }
    },
  };
}

module.exports = { createVotosService };