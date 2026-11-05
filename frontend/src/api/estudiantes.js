// Llamadas a la API del backend para la pantalla del estudiante.
// Cambia la dirección con VITE_API_URL en frontend/.env si el backend no está en localhost:3000.
const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

const MENSAJES = {
  400: "El DNI debe tener 8 dígitos.",
  401: "Este DNI no está en el padrón.",
  409: "Este estudiante ya votó.",
  429: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  503: "El servicio no está disponible. Avisa al encargado.",
};

export class ErrorApi extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

async function pedir(ruta, opciones) {
  let res;
  try {
    res = await fetch(`${API}${ruta}`, opciones);
  } catch {
    throw new ErrorApi(0, "No se pudo conectar con el servidor.");
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErrorApi(res.status, MENSAJES[res.status] ?? "Ocurrió un error inesperado.");
  }
  return datos;
}

// El DNI se envía como texto para conservar los ceros iniciales.
export function loginEstudiante(dni) {
  return pedir("/auth/estudiante", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dni }),
  });
}

export async function obtenerListas(token) {
  const datos = await pedir("/listas", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return datos.listas;
}
