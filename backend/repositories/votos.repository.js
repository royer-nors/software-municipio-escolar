function createVotosRepository(pool) {
  return {
    async registrar(estudianteId, listaId) {
      await pool.query("SELECT registrar_voto($1, $2)", [estudianteId, listaId]);
    },
  };
}

module.exports = { createVotosRepository };
