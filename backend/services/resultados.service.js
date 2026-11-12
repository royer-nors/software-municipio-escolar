function convertirConteo(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) {
    throw new Error("Conteo electoral inválido.");
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("Conteo electoral fuera de rango.");
  }
  return count;
}

function porcentaje(cantidad, total) {
  return total === 0 ? 0 : Number(((cantidad / total) * 100).toFixed(1));
}

function createResultadosService(resultadosRepository) {
  return {
    async obtenerResultados() {
      const conteo = await resultadosRepository.obtenerConteo();
      const habilitados = convertirConteo(conteo.habilitados);
      const emitidos = convertirConteo(conteo.emitidos);
      const blancos = convertirConteo(conteo.blancos);
      if (emitidos > habilitados || blancos > emitidos || !Array.isArray(conteo.listas)) {
        throw new Error("Los conteos electorales son inconsistentes.");
      }

      const validos = emitidos - blancos;
      const listas = conteo.listas.map(lista => {
        if (typeof lista.nombre !== "string" || !lista.nombre.trim()) {
          throw new Error("Hay candidatos sin una lista electoral definida.");
        }
        const votos = convertirConteo(lista.votos);
        return { nombre: lista.nombre, votos, porcentaje: porcentaje(votos, validos),
          ...(lista.id ? { id: lista.id } : {}), ...(lista.numero ? { numero: lista.numero } : {}),
          ...(lista.logoUrl ? { logoUrl: lista.logoUrl } : {}),
          ...(lista.propuestas?.length ? { propuestas: lista.propuestas } : {}),
          ...(lista.candidatos ? { candidatos: lista.candidatos } : {}),
        };
      });
      if (listas.reduce((total, lista) => total + lista.votos, 0) !== validos) {
        throw new Error("Los votos por lista no coinciden con el total válido.");
      }

      listas.sort((a, b) => b.votos - a.votos || a.nombre.localeCompare(b.nombre, "es"));
      let posicion = 0;
      listas.forEach((lista, index) => {
        if (validos === 0) {
          lista.posicion = null;
          return;
        }
        if (index === 0 || lista.votos !== listas[index - 1].votos) posicion = index + 1;
        lista.posicion = posicion;
      });

      return {
        generadoEn: new Date().toISOString(),
        resumen: {
          estudiantesHabilitados: habilitados,
          votosEmitidos: emitidos,
          votosValidos: validos,
          votosEnBlanco: blancos,
          votosNulos: 0,
          noVotaron: habilitados - emitidos,
          participacion: porcentaje(emitidos, habilitados),
        },
        listas,
      };
    },
  };
}

module.exports = { createResultadosService };
