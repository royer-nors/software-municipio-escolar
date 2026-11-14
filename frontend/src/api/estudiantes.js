import { crearPayloadVoto, validarResultados } from "../utils/elecciones.js";
const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";

export class ErrorApi extends Error {
  constructor(status, mensaje, incierto = false) {
    super(mensaje);
    this.name = "ErrorApi";
    this.status = status;
    this.incierto = incierto;
  }
}

// Llamadas reales: ninguna escritura se reintenta automáticamente.
async function pedir(ruta, opciones = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const signal = opciones.signal ? AbortSignal.any([opciones.signal, controller.signal]) : controller.signal;
  const esVoto = ruta.endsWith("/votos") && opciones.method === "POST";
  try {
    const res = await fetch(`${API}${ruta}`, { ...opciones, signal, cache: "no-store" });
    const datos = await res.json().catch(() => {
      throw new ErrorApi(res.status, "El servidor devolvió una respuesta que no se pudo verificar.", esVoto);
    });
    if (!res.ok) {
      const error = new ErrorApi(res.status, datos.mensaje || "No se pudo completar la solicitud.", esVoto && res.status >= 500);
      error.codigo = datos.codigo; throw error;
    }
    if (esVoto && (res.status !== 201 || datos.sesionFinalizada !== true)) {
      throw new ErrorApi(res.status, "No se pudo verificar el registro del voto.", true);
    }
    return datos;
  } catch (error) {
    if (error instanceof ErrorApi || opciones.signal?.aborted) throw error;
    throw new ErrorApi(0, "No se pudo confirmar la respuesta del servidor. Comprueba la conexión.", esVoto);
  } finally { clearTimeout(timeout); }
}

export async function loginEstudiante(dni, puesto = false) {
  if (typeof dni !== "string" || !/^\d{8}$/.test(dni)) throw new ErrorApi(400, "El DNI debe tener ocho dígitos.");
  const datos = await pedir(puesto ? "/puesto/identificar" : "/auth/estudiante", {
    method: "POST", headers: { "Content-Type": "application/json", ...(puesto ? { "X-Puesto-CSRF": "1" } : {}) }, body: JSON.stringify({ dni }), ...(puesto ? { credentials: "include" } : {}),
  });
  if (!datos.token || !datos.estudiante?.nombre || datos.estudiante.dni !== dni || datos.habilitadoParaVotar !== true) {
    throw new ErrorApi(502, "No se recibió una identificación válida. Avisa al encargado.");
  }
  return datos;
}
export async function obtenerListas(token, signal, puesto = false) {
  const datos = await pedir(puesto ? "/puesto/listas" : "/listas", { headers: { Authorization: `Bearer ${token}` }, signal, ...(puesto ? { credentials: "include" } : {}) });
  if (!Array.isArray(datos.listas) || datos.listas.some(l =>
    !Number.isInteger(l.id) || l.id <= 0 || l.id > 2147483647 || typeof l.nombre !== "string" ||
    !l.nombre.trim() || !Array.isArray(l.candidatos) || l.candidatos.some(c =>
      !c || !Number.isInteger(c.id) || c.id <= 0 || typeof c.nombre !== "string" || !c.nombre.trim()))) {
    throw new ErrorApi(502, "Las listas recibidas están incompletas. Avisa al encargado.");
  }
  return datos.listas;
}
export async function obtenerConfiguracion(signal, puesto = false) {
  const datos = await pedir(puesto ? "/puesto/configuracion" : "/votacion/configuracion", { signal, ...(puesto ? { credentials: "include" } : {}) });
  if (typeof datos.votacionAbierta !== "boolean" || typeof datos.votoBlancoHabilitado !== "boolean") {
    throw new ErrorApi(502, "No se pudo verificar el estado de la elección.");
  }
  return datos;
}
export async function registrarVoto(token, seleccion, puesto = false) {
  const payload = crearPayloadVoto(seleccion);
  return pedir(puesto ? "/puesto/votos" : "/votos", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(puesto ? { "X-Puesto-CSRF": "1" } : {}) },
    ...(puesto ? { credentials: "include" } : {}),
    body: JSON.stringify(payload),
  });
}
export const apiPuesto = {
  loginEstudiante: dni => loginEstudiante(dni, true),
  obtenerListas: (token, signal) => obtenerListas(token, signal, true),
  obtenerConfiguracion: signal => obtenerConfiguracion(signal, true),
  registrarVoto: (token, seleccion) => registrarVoto(token, seleccion, true),
};
export async function obtenerResultados(tokenAdmin, signal) {
  const datos = await pedir("/resultados", { headers: { Authorization: `Bearer ${tokenAdmin}` }, signal });
  return validarResultados(datos);
}
