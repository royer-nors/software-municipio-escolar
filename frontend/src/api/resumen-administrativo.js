import { obtenerConfiguracion, obtenerResultados } from "./estudiantes.js";
import { listarComputadoras } from "./computadoras.js";

export async function obtenerResumenAdministrativo(token, signal) {
  const fuentes = ["resultados", "configuracion", "equipos"];
  const respuestas = await Promise.allSettled([
    obtenerResultados(token, signal),
    obtenerConfiguracion(signal),
    listarComputadoras(token, { limit: 100, signal }),
  ]);
  if (signal?.aborted) throw signal.reason;
  const resumen = { errores: [] };
  respuestas.forEach((respuesta, indice) => {
    const fuente = fuentes[indice];
    resumen[fuente] = respuesta.status === "fulfilled" ? respuesta.value : null;
    if (respuesta.status === "rejected") resumen.errores.push(fuente);
  });
  return resumen;
}
