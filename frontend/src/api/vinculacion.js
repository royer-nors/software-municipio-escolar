const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";
const ESTADOS = ["vinculada", "pendiente", "revocada", "vencida", "sin_vincular", "deshabilitada"];

async function pedir(ruta, opciones) {
  let r;
  try { r = await fetch(`${API}${ruta}`, { cache: "no-store", signal: AbortSignal.timeout(15000), ...opciones }); }
  catch { throw new Error("No se pudo confirmar la respuesta. Consulta el estado antes de repetir la operación."); }
  const datos = await r.json().catch(() => { throw new Error("Respuesta inválida. Consulta el estado actual."); });
  if (!r.ok && !(r.status === 401 && ruta === "/puesto/estado" && ESTADOS.includes(datos?.estado))) throw new Error(datos?.mensaje || "No se pudo completar la vinculación.");
  return datos;
}
function idValido(id) { if (!Number.isInteger(id) || id < 1) throw new Error("Computadora inválida."); }
export async function gestionarVinculacion(id, accion, token) {
  idValido(id);
  if (!token) throw new Error("Inicia sesión como administrador.");
  if (!["autorizaciones", "revocar", "vinculacion"].includes(accion)) throw new Error("Acción inválida.");
  const datos = await pedir(`/computadoras/${id}/${accion}`, { method: accion === "vinculacion" ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(accion === "vinculacion" ? {} : { body: "{}" }),
  });
  if (accion === "autorizaciones") {
    if (!/^[a-f0-9]{64}$/.test(datos?.codigo) || !Number.isFinite(Date.parse(datos.vence_en))) throw new Error("No se pudo verificar la autorización. Genera otra para invalidar la anterior.");
  } else if (!ESTADOS.includes(datos?.estado)) throw new Error("Estado de vinculación inválido.");
  return datos;
}
export async function consultarPuesto(signal) {
  const datos = await pedir("/puesto/estado", { credentials: "include", ...(signal ? { signal } : {}) });
  if (!ESTADOS.includes(datos?.estado) || (datos.estado === "vinculada" && (!datos.computadora || ![1, 2, 3, 4, 5].includes(datos.computadora.grado)))) throw new Error("Estado de puesto inválido.");
  return datos;
}
export async function vincularPuesto(codigo) {
  if (typeof codigo !== "string" || !/^[a-f0-9]{64}$/.test(codigo.trim())) throw new Error("Introduce el código temporal completo de 64 caracteres.");
  const datos = await pedir("/puesto/vincular", { method: "POST", credentials: "include",
    headers: { "Content-Type": "application/json", "X-Puesto-CSRF": "1" }, body: JSON.stringify({ codigo: codigo.trim() }),
  });
  if (datos?.estado !== "vinculada") throw new Error("No se pudo verificar la vinculación. Consulta el estado.");
  return datos;
}
export const etiquetasVinculacion = { vinculada: "Vinculada", pendiente: "Pendiente", revocada: "Revocada", vencida: "Vencida", sin_vincular: "Sin vincular", deshabilitada: "Deshabilitada" };
