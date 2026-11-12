const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";
export const MAX_EXCEL_BYTES = 5 * 1024 * 1024;

export class ErrorPadron extends Error {
  constructor(status, mensaje, errores = [], incierto = false) {
    super(mensaje);
    this.name = "ErrorPadron";
    this.status = status;
    this.errores = Array.isArray(errores) ? errores.slice(0, 100) : [];
    this.incierto = incierto;
  }
}

export function validarArchivoPadron(archivo) {
  if (!archivo || typeof archivo.name !== "string" || !/\.xlsx$/i.test(archivo.name)) {
    throw new ErrorPadron(400, "Selecciona un archivo Excel con extensión .xlsx.");
  }
  if (!Number.isFinite(archivo.size) || archivo.size <= 0) throw new ErrorPadron(400, "El archivo está vacío o no es válido.");
  if (archivo.size > MAX_EXCEL_BYTES) throw new ErrorPadron(413, "El archivo no puede superar 5 MiB (5 242 880 bytes).");
}

async function escribir(ruta, token, body, esJson = false) {
  if (typeof token !== "string" || !token.trim()) throw new ErrorPadron(401, "Inicia sesión como administrador antes de continuar.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const respuesta = await fetch(`${API}${ruta}`, {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, ...(esJson ? { "Content-Type": "application/json" } : {}) },
      body: esJson ? JSON.stringify(body) : body,
    });
    const datos = await respuesta.json().catch(() => {
      throw new ErrorPadron(respuesta.status, "No se pudo verificar la respuesta del servidor. Consulta el padrón antes de reintentar.", [], true);
    });
    if (!respuesta.ok) {
      throw new ErrorPadron(respuesta.status, datos?.mensaje || "No se pudo completar la operación.", datos?.errores, respuesta.status >= 500);
    }
    return datos;
  } catch (error) {
    if (error instanceof ErrorPadron) throw error;
    throw new ErrorPadron(0, "No se pudo confirmar la operación. Comprueba la conexión y consulta el padrón antes de reintentar.", [], true);
  } finally { clearTimeout(timeout); }
}

export async function importarPadron(archivo, token) {
  validarArchivoPadron(archivo);
  const form = new FormData();
  form.append("archivo", archivo);
  // El navegador genera Content-Type y boundary; no agregar campos adicionales.
  const datos = await escribir("/padron/importar", token, form);
  if (!Number.isSafeInteger(datos?.total) || datos.total < 1 || !Number.isSafeInteger(datos.reemplazados) || datos.reemplazados < 0) {
    throw new ErrorPadron(502, "El servidor no devolvió un resumen de importación válido. Verifica el padrón antes de reintentar.", [], true);
  }
  return datos;
}

export async function registrarEstudiante(formulario, token) {
  const { dni, nombres, apellidos, grado, seccion } = formulario;
  if (typeof dni !== "string" || !/^\d{8}$/.test(dni)) throw new ErrorPadron(400, "El DNI debe tener exactamente ocho dígitos.");
  if (typeof nombres !== "string" || !nombres.trim() || typeof apellidos !== "string" || !apellidos.trim()) {
    throw new ErrorPadron(400, "Ingresa los nombres y apellidos del estudiante.");
  }
  const nombre = `${nombres.trim()} ${apellidos.trim()}`.replace(/\s+/g, " ");
  if (nombre.length > 100) throw new ErrorPadron(400, "El nombre completo admite como máximo 100 caracteres.");
  if (typeof grado !== "string" || !grado.trim() || grado.length > 20 || typeof seccion !== "string" || !seccion.trim() || seccion.length > 10) {
    throw new ErrorPadron(400, "Selecciona un grado y una sección válidos.");
  }
  const datos = await escribir("/estudiantes", token, { dni, nombre, grado, seccion }, true);
  if (!Number.isInteger(datos?.estudiante?.id) || datos.estudiante.id <= 0 || datos.estudiante.dni !== dni ||
      typeof datos.estudiante.nombre !== "string" || !datos.estudiante.nombre.trim()) {
    throw new ErrorPadron(502, "No se pudo verificar el registro. Consulta el padrón antes de reintentar.", [], true);
  }
  return datos.estudiante;
}
