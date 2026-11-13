const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";

export class ErrorBorradoDatos extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.name = "ErrorBorradoDatos";
    this.status = status;
  }
}

async function pedir(ruta, token, { method = "GET", body, signal } = {}) {
  if (typeof token !== "string" || !token.trim()) {
    throw new ErrorBorradoDatos(401, "Inicia sesión como administrador antes de continuar.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const signalCombinada = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  try {
    const respuesta = await fetch(`${API}${ruta}`, {
      method,
      signal: signalCombinada,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const datos = await respuesta.json().catch(() => {
      throw new ErrorBorradoDatos(respuesta.status, "No se pudo verificar la respuesta del servidor.");
    });
    if (!respuesta.ok) throw new ErrorBorradoDatos(respuesta.status, datos?.mensaje || "No se pudo completar la operación.");
    return datos;
  } catch (error) {
    if (error instanceof ErrorBorradoDatos || signal?.aborted) throw error;
    throw new ErrorBorradoDatos(0, "No se pudo confirmar la respuesta del servidor. Comprueba la conexión.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function obtenerResumenBorrado(token, signal) {
  const datos = await pedir("/borrado-datos/resumen", token, { signal });
  for (const campo of ["estudiantes", "listas", "candidatos", "votos"]) {
    if (!Number.isSafeInteger(datos?.[campo]) || datos[campo] < 0) {
      throw new ErrorBorradoDatos(502, "El servidor devolvió cantidades incompletas.");
    }
  }
  return datos;
}

export function simularBorradoDatos(token, operacion) {
  return pedir("/borrado-datos/simulacion", token, { method: "POST", body: { operacion } });
}

export function ejecutarBorradoDatos(token, datos) {
  return pedir("/borrado-datos/ejecutar", token, { method: "POST", body: datos });
}

export function reiniciarDatosPrueba(token, datos) {
  return pedir("/borrado-datos/reinicio-excepcional", token, { method: "POST", body: datos });
}
