const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";

export async function consultarEstadoInstalacion(signal) {
  let respuesta;
  try {
    respuesta = await fetch(`${API}/instalacion/estado`, {
      cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error("No se pudo conectar con el servidor para verificar la configuración inicial. Comprueba que esté disponible y reintenta.", { cause: error });
  }
  if (!respuesta.ok) throw new Error(`No se pudo verificar la configuración inicial (HTTP ${respuesta.status}). Reintenta cuando el servidor esté disponible.`);
  let datos;
  try { datos = await respuesta.json(); }
  catch { throw new Error("El servidor devolvió una respuesta inválida al verificar la configuración inicial. Reintenta."); }
  if (!datos || Array.isArray(datos) || typeof datos.requiereAdministrador !== "boolean") {
    throw new Error("El servidor no confirmó si existe un administrador. No se continuará hasta verificar la configuración inicial.");
  }
  return datos;
}
