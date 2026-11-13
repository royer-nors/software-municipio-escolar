const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";

export async function guardarConfiguracionElectoral(configuracion, token) {
  if (!token) throw new Error("Inicia sesión como administrador.");
  let respuesta;
  try {
    respuesta = await fetch(`${API}/votacion/configuracion`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(configuracion), signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error("No se pudo confirmar el cambio. Consulta el estado actual antes de volver a intentar."); }
  const datos = await respuesta.json().catch(() => { throw new Error("Respuesta no verificable. Consulta el estado actual."); });
  if (!respuesta.ok) throw new Error(datos.mensaje || "No se pudo cambiar el estado de votación.");
  if (typeof datos.configuracion?.votacionAbierta !== "boolean" || typeof datos.configuracion?.votoBlancoHabilitado !== "boolean") {
    throw new Error("El servidor no confirmó una configuración válida. Consulta el estado actual.");
  }
  return datos.configuracion;
}

export async function cambiarEstadoVotacion(votacionAbierta, token, opciones = {}) {
  if (typeof votacionAbierta !== "boolean") throw new Error("Estado de votación inválido.");
  return guardarConfiguracionElectoral({ ...opciones, votacionAbierta }, token);
}
