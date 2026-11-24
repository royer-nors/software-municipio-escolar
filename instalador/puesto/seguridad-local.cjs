const { randomBytes, scryptSync, timingSafeEqual } = require("node:crypto");

const INTENTOS_MAXIMOS = 5;
const DURACION_BLOQUEO_MS = 30_000;

function normalizarServidorUrl(valor) {
  if (typeof valor !== "string" || !valor.trim()) {
    throw new Error("Escribe la IP o dirección del servidor.");
  }

  let entrada = valor.trim();
  let aviso = "";
  if (/^https:\/\//i.test(entrada)) {
    entrada = entrada.replace(/^https:/i, "http:");
    aviso = "El servidor de la red local usa HTTP. Se cambió https:// por http://.";
  } else if (!/^[a-z][a-z\d+.-]*:\/\//i.test(entrada)) {
    entrada = `http://${entrada}`;
  }

  let url;
  try {
    url = new URL(entrada);
  } catch {
    throw new Error("La dirección no tiene un formato válido. Escribe una IP como 192.168.1.20.");
  }

  if (url.protocol !== "http:" || url.username || url.password || !["", "/"].includes(url.pathname) || url.search || url.hash) {
    throw new Error("Escribe solo la IP o dirección del servidor y, si corresponde, su puerto.");
  }
  if (!url.port) url.port = "3000";
  return { url: url.origin, aviso };
}

function crearHashClave(clave) {
  const salt = randomBytes(16);
  const hash = scryptSync(clave, salt, 64);
  return { algoritmo: "scrypt", salt: salt.toString("hex"), hash: hash.toString("hex") };
}

function verificarHashClave(clave, credencial) {
  if (typeof clave !== "string" || credencial?.algoritmo !== "scrypt"
    || !/^[a-f0-9]{32}$/i.test(credencial.salt ?? "")
    || !/^[a-f0-9]{128}$/i.test(credencial.hash ?? "")) return false;
  const esperado = Buffer.from(credencial.hash, "hex");
  const recibido = scryptSync(clave, Buffer.from(credencial.salt, "hex"), esperado.length);
  return timingSafeEqual(recibido, esperado);
}

function crearLimitadorIntentos({ reloj = Date.now, maxIntentos = INTENTOS_MAXIMOS, bloqueoMs = DURACION_BLOQUEO_MS } = {}) {
  let intentos = 0;
  let bloqueadoHasta = 0;
  return {
    consultar() {
      const restante = bloqueadoHasta - reloj();
      if (restante > 0) return { permitido: false, restanteMs: restante };
      if (bloqueadoHasta) { intentos = 0; bloqueadoHasta = 0; }
      return { permitido: true, restanteMs: 0 };
    },
    registrarFallo() {
      const estado = this.consultar();
      if (!estado.permitido) return { ...estado, intentosRestantes: 0 };
      intentos += 1;
      if (intentos >= maxIntentos) {
        bloqueadoHasta = reloj() + bloqueoMs;
        return { permitido: false, restanteMs: bloqueoMs, intentosRestantes: 0 };
      }
      return { permitido: true, restanteMs: 0, intentosRestantes: maxIntentos - intentos };
    },
    registrarExito() { intentos = 0; bloqueadoHasta = 0; },
  };
}

module.exports = {
  DURACION_BLOQUEO_MS,
  crearHashClave,
  crearLimitadorIntentos,
  normalizarServidorUrl,
  verificarHashClave,
};
