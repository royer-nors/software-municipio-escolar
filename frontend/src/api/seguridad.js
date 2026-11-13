const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";

export function validarPassword({ actual, nueva, confirmar }) {
  if (![actual, nueva, confirmar].every(v => typeof v === "string" && v)) throw new Error("Completa las tres contraseñas.");
  if (nueva.length < 8 || new TextEncoder().encode(nueva).length > 72) throw new Error("La nueva contraseña debe tener al menos 8 caracteres y como máximo 72 bytes UTF-8.");
  if (new TextEncoder().encode(actual).length > 72) throw new Error("La contraseña actual supera el límite permitido.");
  if (nueva !== confirmar) throw new Error("Las contraseñas nuevas no coinciden.");
  if (actual === nueva) throw new Error("La nueva contraseña debe ser diferente a la actual.");
}

export async function cambiarPassword(formulario, token) {
  validarPassword(formulario);
  if (!token) throw new Error("Inicia sesión como administrador.");
  let respuesta;
  try {
    respuesta = await fetch(`${API}/auth/password`, {
      method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ passwordActual: formulario.actual, passwordNueva: formulario.nueva }),
      signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error("No se pudo confirmar el cambio. No se reintentó: inicia sesión para comprobar qué contraseña está vigente."); }
  const datos = await respuesta.json().catch(() => { throw new Error("No se pudo verificar la respuesta. Inicia sesión nuevamente."); });
  if (!respuesta.ok) throw new Error(datos.mensaje || "No se pudo cambiar la contraseña.");
  if (respuesta.status !== 200 || typeof datos.mensaje !== "string") throw new Error("No se pudo verificar el cambio. Inicia sesión nuevamente.");
}
