function createListasService(listasRepository) {
  return {
    async obtenerListas(estudianteId) {
      const papeleta = await listasRepository.obtenerPapeleta(estudianteId);
      if (!papeleta.estudiante || !papeleta.estudiante.activo) return { estado: "no_habilitado" };
      if (papeleta.estudiante.yaVoto) return { estado: "ya_voto" };
      if (!Array.isArray(papeleta.candidatos)) throw new Error("Papeleta electoral inválida.");

      const grupos = new Map();
      for (const candidato of papeleta.candidatos) {
        if (
          typeof candidato.lista !== "string" || !candidato.lista.trim() ||
          !Number.isSafeInteger(candidato.listaId) || candidato.listaId <= 0 ||
          typeof candidato.nombre !== "string" || !candidato.nombre.trim() ||
          !Number.isSafeInteger(candidato.id) || candidato.id <= 0
        ) {
          throw new Error("Los datos de la lista electoral están incompletos.");
        }
        if (!grupos.has(candidato.listaId)) {
          grupos.set(candidato.listaId, {
            id: candidato.listaId, nombre: candidato.lista, candidatos: [],
            ...(candidato.numero ? { numero: candidato.numero } : {}),
            ...(candidato.logoUrl ? { logoUrl: candidato.logoUrl } : {}),
            ...(candidato.propuestas?.length ? { propuestas: candidato.propuestas } : {}),
          });
        }
        const grupo = grupos.get(candidato.listaId);
        if (grupo.nombre !== candidato.lista) throw new Error("La lista tiene nombres inconsistentes.");
        grupo.candidatos.push({ id: candidato.id, nombre: candidato.nombre,
          ...(candidato.cargo ? { cargo: candidato.cargo } : {}), ...(candidato.fotoUrl ? { fotoUrl: candidato.fotoUrl } : {}) });
      }
      const listas = [...grupos.values()].map(({ candidatos, ...lista }) => ({
        ...lista, candidatos: candidatos.sort((a, b) => a.id - b.id),
      }));
      listas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
      return { estado: "habilitado", listas };
    },
  };
}

module.exports = { createListasService };
