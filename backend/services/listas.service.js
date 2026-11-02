function createListasService(listasRepository) {
  return {
    async obtenerListas(estudianteId) {
      const papeleta = await listasRepository.obtenerPapeleta(estudianteId);
      if (!papeleta.estudiante) return { estado: "no_habilitado" };
      if (papeleta.estudiante.yaVoto) return { estado: "ya_voto" };
      if (!Array.isArray(papeleta.candidatos)) throw new Error("Papeleta electoral inválida.");

      const grupos = new Map();
      for (const candidato of papeleta.candidatos) {
        if (
          typeof candidato.lista !== "string" || !candidato.lista.trim() ||
          typeof candidato.nombre !== "string" || !candidato.nombre.trim() ||
          !Number.isSafeInteger(candidato.id) || candidato.id <= 0
        ) {
          throw new Error("Los datos de la lista electoral están incompletos.");
        }
        if (!grupos.has(candidato.lista)) grupos.set(candidato.lista, []);
        grupos.get(candidato.lista).push({ id: candidato.id, nombre: candidato.nombre });
      }
      const listas = [...grupos].map(([nombre, candidatos]) => ({
        nombre, candidatos: candidatos.sort((a, b) => a.id - b.id),
      }));
      listas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      return { estado: "habilitado", listas };
    },
  };
}

module.exports = { createListasService };
