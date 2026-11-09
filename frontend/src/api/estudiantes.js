// Llamadas a la API del backend para la pantalla del estudiante y administrador.

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
const USAR_MOCK = import.meta.env.VITE_USAR_MOCK === "true";

if (USAR_MOCK) {
  console.info("[api] Modo de datos de ejemplo activo: no se usa el backend.");
}

const MENSAJES = {
  400: "El DNI debe tener 8 dígitos o la selección no es válida.",
  401: "Este DNI no está en el padrón o la sesión expiró.",
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

async function pedir(ruta, opciones = {}) {
  let res;
  try {
    res = await fetch(`${API}${ruta}`, opciones);
  } catch {
    throw new ErrorApi(0, "No se pudo conectar con el servidor.");
  }
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ErrorApi(res.status, datos.mensaje || MENSAJES[res.status] || "Ocurrió un error inesperado.");
  }
  return datos;
}

// ---------- Datos MOCK (solo con VITE_USAR_MOCK=true) ----------
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const TOKEN_MOCK = "token-de-ejemplo";

const ESTUDIANTES_MOCK = {
  "89654321": { id: 1, dni: "89654321", nombre: "Ana Torres Quispe" },
  "12345678": { id: 2, dni: "12345678", nombre: "Luis Ramos Huamán" },
};
const YA_VOTARON_MOCK = ["11111111"];

const LISTAS_MOCK = [
  { id: 1, nombre: "Juntos por un mejor futuro", candidatoAlcalde: "Ana Torres", candidatos: [{ id: 1, nombre: "Candidato 1A" }] },
  { id: 2, nombre: "Unidos por el cambio", candidatoAlcalde: "Luis Ramos", candidatos: [{ id: 3, nombre: "Candidato 2A" }] },
  { id: 3, nombre: "Ideas que transforman", candidatoAlcalde: "Carla Mendoza", candidatos: [{ id: 5, nombre: "Candidato 3A" }] },
];

async function loginMock(dni) {
  await esperar(400);
  if (!/^\d{8}$/.test(dni)) throw new ErrorApi(400, MENSAJES[400]);
  if (YA_VOTARON_MOCK.includes(dni)) throw new ErrorApi(409, MENSAJES[409]);
  const estudiante = ESTUDIANTES_MOCK[dni];
  if (!estudiante) throw new ErrorApi(401, MENSAJES[401]);
  return { estudiante, token: TOKEN_MOCK };
}

async function listasMock(token) {
  await esperar(300);
  if (token !== TOKEN_MOCK) throw new ErrorApi(401, MENSAJE_SESION);
  return LISTAS_MOCK;
}

async function registrarVotoMock(token, seleccion) {
  await esperar(600);
  if (token !== TOKEN_MOCK) throw new ErrorApi(401, MENSAJE_SESION);
  return { registrado: true };
}

// ---------- Funciones principales exportadas ----------

// 1. Identificación estudiante (POST /api/auth/estudiante)
export function loginEstudiante(dni) {
  if (USAR_MOCK) return loginMock(dni);
  return pedir("/auth/estudiante", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dni }),
  });
}

// 2. Obtener listas electorales (GET /api/listas)
export async function obtenerListas(token) {
  try {
    if (USAR_MOCK) return await listasMock(token);
    const datos = await pedir("/listas", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return Array.isArray(datos) ? datos : datos.listas || [];
  } catch (e) {
    if (e.status === 401) throw new ErrorApi(401, MENSAJE_SESION);
    throw e;
  }
}

// 3. Registrar el voto (POST /api/votos)
// Requerimiento: { listaId: number | null }
export async function registrarVoto(token, seleccion) {
  try {
    if (USAR_MOCK) return await registrarVotoMock(token, seleccion);
    
    const payload = {
      listaId: seleccion?.tipo === "blanco" ? null : (seleccion?.id ?? null)
    };

    return await pedir("/votos", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    if (e.status === 401) throw new ErrorApi(401, MENSAJE_SESION);
    throw e;
  }
}

// 4. Resultados electorales para Admin (GET /api/resultados)
export async function obtenerResultados(tokenAdmin) {
  if (USAR_MOCK) {
    await esperar(300);
    return {
      estudiantesHabilitados: 450,
      votosEmitidos: 320,
      votosValidos: 310,
      votosBlancosNulos: 10,
      participacionElectoral: "71.1",
      listas: [
        { id: 1, nombre: "Juntos por un mejor futuro", votos: 180, porcentaje: "58.0" },
        { id: 2, nombre: "Unidos por el cambio", votos: 130, porcentaje: "42.0" }
      ]
    };
  }

  return pedir("/resultados", {
    headers: { Authorization: `Bearer ${tokenAdmin}` }
  });
}