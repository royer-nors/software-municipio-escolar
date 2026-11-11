export const COLORES = ["azul", "verde", "morado", "naranja"];
export const TONOS = { azul: "#165eac", verde: "#137b50", morado: "#7745bc", naranja: "#ce7909" };

export function crearPayloadVoto(seleccion) {
  if (seleccion?.tipo === "blanco") return { listaId: null };
  if (seleccion?.tipo !== "lista" || !Number.isInteger(seleccion.id) || seleccion.id <= 0 || seleccion.id > 2147483647) {
    throw new Error("Selecciona una lista válida antes de confirmar.");
  }
  return { listaId: seleccion.id };
}
export function coloresPorNombre(listas) {
  return new Map([...listas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
    .map((lista, i) => [lista.nombre, COLORES[i % COLORES.length]]));
}
export const cantidad = valor => new Intl.NumberFormat("es-PE").format(valor);
export const porcentaje = valor => `${new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1 }).format(valor)} %`;
export const posicion = valor => valor === null ? "Sin posición" : `${valor}.º lugar`;

// Una respuesta incompleta es un error, no un conjunto ficticio de ceros.
export function validarResultados(datos) {
  const resumen = datos?.resumen;
  const conteos = ["estudiantesHabilitados", "votosEmitidos", "votosValidos", "votosEnBlanco", "votosNulos", "noVotaron"];
  const valido = resumen && conteos.every(k => Number.isSafeInteger(resumen[k]) && resumen[k] >= 0) &&
    Number.isFinite(resumen.participacion) && resumen.participacion >= 0 && resumen.participacion <= 100 &&
    Array.isArray(datos.listas) && datos.listas.every(l => typeof l.nombre === "string" && l.nombre.trim() &&
      Number.isSafeInteger(l.votos) && l.votos >= 0 && Number.isFinite(l.porcentaje) && l.porcentaje >= 0 && l.porcentaje <= 100 &&
      (l.posicion === null || (Number.isInteger(l.posicion) && l.posicion > 0))) &&
    typeof datos.generadoEn === "string" && Number.isFinite(Date.parse(datos.generadoEn));
  if (!valido) throw new Error("El servidor devolvió resultados incompletos. No se mostrará un reporte sin verificar.");
  if (datos.listas.reduce((total, l) => total + l.votos, 0) !== resumen.votosValidos ||
      resumen.votosValidos + resumen.votosEnBlanco + resumen.votosNulos !== resumen.votosEmitidos ||
      resumen.votosEmitidos + resumen.noVotaron !== resumen.estudiantesHabilitados) {
    throw new Error("Los resultados recibidos no son consistentes. Avisa al encargado.");
  }
  return datos;
}
