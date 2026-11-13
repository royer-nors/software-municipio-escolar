const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";

export function validarComputadora(datos, crear = true) {
  const permitidos = crear ? ["identificador", "nombre", "grado"] : ["nombre", "grado", "activo"];
  if (!datos || typeof datos !== "object" || Array.isArray(datos) || !Object.keys(datos).length ||
      Object.keys(datos).some(k => !permitidos.includes(k)) ||
      (crear && permitidos.some(k => !Object.hasOwn(datos, k)))) throw new Error("Completa los campos de la computadora.");
  if (crear && (typeof datos.identificador !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,29}$/.test(datos.identificador.trim()))) {
    throw new Error("Usa de 1 a 30 letras, números, guiones o guiones bajos en el identificador.");
  }
  if (Object.hasOwn(datos, "nombre") && (typeof datos.nombre !== "string" || !datos.nombre.trim() || [...datos.nombre.trim()].length > 100 || [...datos.nombre].some(c => c.codePointAt(0) < 32 || c.codePointAt(0) === 127))) {
    throw new Error("Indica un nombre de 1 a 100 caracteres sin caracteres de control.");
  }
  if (Object.hasOwn(datos, "grado") && (!Number.isInteger(datos.grado) || datos.grado < 1 || datos.grado > 5)) throw new Error("Selecciona un grado de 1.º a 5.º de secundaria.");
  if (Object.hasOwn(datos, "activo") && typeof datos.activo !== "boolean") throw new Error("El estado debe ser booleano.");
}

function esComputadora(c) {
  return c && Number.isInteger(c.id) && c.id > 0 && typeof c.identificador === "string" &&
    /^[A-Z0-9][A-Z0-9_-]{0,29}$/.test(c.identificador) && typeof c.nombre === "string" && c.nombre.trim() &&
    Number.isInteger(c.grado) && c.grado >= 1 && c.grado <= 5 && typeof c.activo === "boolean" &&
    typeof c.fecha_registro === "string" && Number.isFinite(Date.parse(c.fecha_registro));
}

async function solicitar(ruta, token, { method = "GET", body, signal } = {}) {
  if (!token) throw new Error("Inicia sesión como administrador.");
  let respuesta;
  try {
    respuesta = await fetch(`${API}/computadoras${ruta}`, {
      method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ?? AbortSignal.timeout(15000), cache: "no-store",
    });
  } catch {
    throw new Error("No se pudo confirmar la respuesta. Consulta la lista antes de volver a guardar; no se reintentó la operación.");
  }
  const datos = await respuesta.json().catch(() => { throw new Error("Respuesta inválida. Consulta la lista para comprobar el estado guardado."); });
  if (!respuesta.ok) throw new Error(datos.mensaje || "No se pudo gestionar la computadora.");
  return datos;
}

export async function listarComputadoras(token, { limit = 50, offset = 0, signal } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 2147483647) throw new Error("Paginación inválida.");
  const datos = await solicitar(`?limit=${limit}&offset=${offset}`, token, { signal });
  if (!Array.isArray(datos.computadoras) || !datos.computadoras.every(esComputadora) || typeof datos.hayMas !== "boolean") throw new Error("La lista de computadoras recibida no es válida.");
  return datos;
}

export async function guardarComputadora(datos, token, id) {
  validarComputadora(datos, id === undefined);
  if (id !== undefined && (!Number.isInteger(id) || id < 1 || id > 2147483647)) throw new Error("ID de computadora inválido.");
  const respuesta = await solicitar(id === undefined ? "" : `/${id}`, token, { method: id === undefined ? "POST" : "PATCH", body: datos });
  if (!esComputadora(respuesta.computadora) || (id !== undefined && respuesta.computadora.id !== id)) throw new Error("No se pudo verificar la computadora guardada. Consulta la lista.");
  return respuesta.computadora;
}
