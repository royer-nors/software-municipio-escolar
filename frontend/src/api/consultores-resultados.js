import { validarResultados } from "../utils/elecciones.js";
const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";
async function pedir(ruta, { token, body, method = "GET", signal } = {}) {
  let r;
  try {
    r = await fetch(`${API}/consultores${ruta}`, { method, cache: "no-store", signal: signal || AbortSignal.timeout(15000),
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json", "X-Consultor-CSRF": "1" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error("No se confirmó la respuesta. No se reintentó la operación.", { cause: e });
  }
  const datos = await r.json();
  if (!r.ok) { const error = new Error(datos.mensaje || "Operación no disponible."); error.status = r.status; throw error; }
  return datos;
}
export async function loginConsultor(usuario, password) {
  const datos = await pedir("/login", { method: "POST", body: { usuario, password } });
  if (!datos.token || datos.consultor?.rol !== "CONSULTOR_RESULTADOS") throw new Error("No se pudo verificar la sesión de consulta.");
  return datos;
}
export async function obtenerResultadosConsultor(token, signal) { return validarResultados(await pedir("/resultados", { token, signal })); }
export async function listarConsultores(token, signal) { return (await pedir("/administracion", { token, signal })).consultores; }
export async function guardarConsultor(token, id, body) { return pedir(`/administracion/${id}`, { token, method: "PUT", body }); }
