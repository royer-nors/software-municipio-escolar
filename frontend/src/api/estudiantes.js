// Llamadas a la API del backend para la pantalla del estudiante.
//
// Configuración opcional en frontend/.env.local (este archivo no se sube a GitHub):
//   VITE_API_URL=http://localhost:3000/api   -> dirección del backend
//   VITE_USAR_MOCK=true                      -> usa datos de ejemplo, sin backend ni base de datos
const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
const USAR_MOCK = import.meta.env.VITE_USAR_MOCK === "true";

if (USAR_MOCK) {
  console.info("[api] Modo de datos de ejemplo activo: no se usa el backend.");
}

const MENSAJES = {
  400: "El DNI debe tener 8 dígitos.",
  401: "Este DNI no está en el padrón.",
  409: "Este estudiante ya votó.",
  429: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
  501: "El registro de votos aún no está disponible en el servidor.",
  503: "El servicio no está disponible. Avisa al encargado.",
};
const MENSAJE_SESION = "La sesión venció. Vuelve a ingresar tu DNI.";

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

// ---------- Datos de ejemplo (solo con VITE_USAR_MOCK=true) ----------
// Respetan la misma forma de respuesta que el backend real.
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const TOKEN_MOCK = "token-de-ejemplo";

const ESTUDIANTES_MOCK = {
  "89654321": { id: 1, dni: "89654321", nombre: "Ana Torres Quispe" },
  "12345678": { id: 2, dni: "12345678", nombre: "Luis Ramos Huamán" },
};
const YA_VOTARON_MOCK = ["11111111"]; // este DNI responde 409

const LISTAS_MOCK = [
  {
    nombre: "Juntos por un mejor futuro",
    candidatos: [{ id: 1, nombre: "Candidato 1A" }, { id: 2, nombre: "Candidato 1B" }],
  },
  {
    nombre: "Unidos por el cambio",
    candidatos: [{ id: 3, nombre: "Candidato 2A" }, { id: 4, nombre: "Candidato 2B" }],
  },
  {
    nombre: "Ideas que transforman",
    candidatos: [{ id: 5, nombre: "Candidato 3A" }, { id: 6, nombre: "Candidato 3B" }],
  },
  {
    nombre: "La fuerza de todos",
    candidatos: [{ id: 7, nombre: "Candidato 4A" }, { id: 8, nombre: "Candidato 4B" }],
  },
];

async function loginMock(dni) {
  await esperar(400);
  if (!/^\d{8}$/.test(dni)) throw new ErrorApi(400, MENSAJES[400]);
  if (YA_VOTARON_MOCK.includes(dni)) throw new ErrorApi(409, MENSAJES[409]);
  const estudiante = ESTUDIANTES_MOCK[dni];
  if (!estudiante) throw new ErrorApi(401, MENSAJES[401]);
  return { estudiante, habilitadoParaVotar: true, token: TOKEN_MOCK, tipo: "Bearer", expiraEn: 900 };
}

async function listasMock(token) {
  await esperar(300);
  if (token !== TOKEN_MOCK) throw new ErrorApi(401, MENSAJE_SESION);
  return LISTAS_MOCK;
}

async function registrarVotoMock(token, seleccion) {
  await esperar(600);
  if (token !== TOKEN_MOCK) throw new ErrorApi(401, MENSAJE_SESION);
  if (!seleccion || !["lista", "blanco"].includes(seleccion.tipo)) {
    throw new ErrorApi(400, "La selección no es válida.");
  }
  return { registrado: true };
}

// ---------- Funciones que usan las pantallas ----------

// El DNI se envía como texto para conservar los ceros iniciales.
export function loginEstudiante(dni) {
  if (USAR_MOCK) return loginMock(dni);
  return pedir("/auth/estudiante", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dni }),
  });
}

export async function obtenerListas(token) {
  try {
    if (USAR_MOCK) return await listasMock(token);
    const datos = await pedir("/listas", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return datos.listas;
  } catch (e) {
    // En este endpoint, un 401 significa que el token venció o no es válido.
    if (e.status === 401) throw new ErrorApi(401, MENSAJE_SESION);
    throw e;
  }
}

// seleccion = { tipo: "lista", nombre } o { tipo: "blanco" }
export async function registrarVoto(token, seleccion) {
  try {
    if (USAR_MOCK) return await registrarVotoMock(token, seleccion);
    // PENDIENTE: el backend todavía no tiene un endpoint para registrar votos
    // (la base de datos ya tiene la función registrar_voto). Cuando exista, reemplaza la
    // línea de abajo por la llamada real con pedir(...), enviando el token en Authorization.
    throw new ErrorApi(501, MENSAJES[501]);
  } catch (e) {
    if (e.status === 401) throw new ErrorApi(401, MENSAJE_SESION);
    throw e;
  }
}
