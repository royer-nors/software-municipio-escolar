const { readSheet } = require("read-excel-file/node");
const { PadronError } = require("../errors/padron.error");
const { gradoSecundaria } = require("./grado-secundaria");
const MAX_ESTUDIANTES = 10000;
const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024;

function normalizarEncabezado(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "")
    : "";
}

function obtenerColumnas(encabezados) {
  const aliases = { dni: "dni", nombre: "nombre", nombres: "nombre", nombrecompleto: "nombre", nombresyapellidos: "nombre", apellidos: "apellidos", grado: "grado", seccion: "seccion" };
  const columnas = {};
  encabezados.forEach((value, index) => {
    const clave = normalizarEncabezado(value);
    const campo = Object.hasOwn(aliases, clave) ? aliases[clave] : undefined;
    if (!campo) return;
    if (columnas[campo] !== undefined) throw new PadronError(400, `La columna ${campo} está repetida.`);
    columnas[campo] = index;
  });
  if (columnas.dni === undefined || columnas.nombre === undefined) {
    throw new PadronError(400, "El Excel debe incluir las columnas DNI y Nombres.");
  }
  const nombreCompleto = ["nombrecompleto", "nombresyapellidos"].includes(normalizarEncabezado(encabezados[columnas.nombre]));
  if (nombreCompleto && columnas.apellidos !== undefined) {
    throw new PadronError(400, "Usa una columna de nombre completo o columnas separadas de Nombres y Apellidos.");
  }
  return columnas;
}

function texto(value, permitirNumero = false) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  if (permitirNumero && typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

async function leerPadronExcel(buffer, gradoSeleccionado) {
  if (gradoSeleccionado !== undefined && (!Number.isInteger(gradoSeleccionado) || gradoSeleccionado < 1 || gradoSeleccionado > 5)) throw new PadronError(400, "Selecciona un grado entre 1 y 5.");
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw new PadronError(400, "Selecciona un archivo Excel válido.");
  if (buffer.length > MAX_ARCHIVO_BYTES) throw new PadronError(413, "El archivo Excel no puede superar 5 MiB.");
  let filas;
  try { filas = await readSheet(buffer, 1); }
  catch { throw new PadronError(400, "No se pudo leer el archivo .xlsx. Comprueba que no esté dañado o protegido."); }
  if (!filas.length) throw new PadronError(400, "El Excel no contiene encabezados.");
  if (filas.length - 1 > MAX_ESTUDIANTES) throw new PadronError(422, "El padrón admite como máximo 10000 filas de datos.");
  const columnas = obtenerColumnas(filas[0]);
  const estudiantes = [], errores = [], dniVistos = new Set();

  for (let index = 1; index < filas.length; index++) {
    const fila = filas[index];
    if (fila.every(value => value === null || value === undefined || (typeof value === "string" && !value.trim()))) continue;
    const agregarError = (campo, mensaje) => errores.push({ fila: index + 1, campo, mensaje });
    const rawDni = fila[columnas.dni];
    const dni = typeof rawDni === "number" && Number.isInteger(rawDni) ? String(rawDni) : texto(rawDni);
    if (typeof dni !== "string" || !/^\d{8}$/.test(dni)) {
      agregarError("dni", "Debe tener 8 dígitos. Guarda el DNI como texto para conservar ceros iniciales.");
    } else if (dniVistos.has(dni)) {
      agregarError("dni", "El DNI está repetido en el archivo.");
    } else { dniVistos.add(dni); }

    const nombres = texto(fila[columnas.nombre]);
    const apellidos = columnas.apellidos === undefined ? "" : texto(fila[columnas.apellidos]);
    const nombre = nombres && apellidos !== null ? [nombres, apellidos].filter(Boolean).join(" ") : null;
    if (!nombre || nombre.length > 100) agregarError("nombre", "El nombre completo es obligatorio y admite hasta 100 caracteres.");
    const valorGrado = columnas.grado === undefined ? undefined : texto(fila[columnas.grado], true);
    const grado = valorGrado === undefined ? gradoSeleccionado : gradoSecundaria(valorGrado);
    const seccion = columnas.seccion === undefined ? "" : texto(fila[columnas.seccion], true);
    if (!grado) agregarError("grado", "El grado debe ser de 1.º a 5.º de secundaria. Si incluyes la columna Grado, complétala en todas las filas.");
    else if (gradoSeleccionado !== undefined && grado !== gradoSeleccionado) agregarError("grado", "El grado del Excel no coincide con el seleccionado. No se cambiará automáticamente.");
    if (seccion === null || seccion.length > 10) agregarError("seccion", "La sección admite hasta 10 caracteres.");
    estudiantes.push({ dni, nombre, grado: grado ? String(grado) : null, seccion: seccion || null, fila: index + 1 });
    if (errores.length >= 100) break;
  }
  if (errores.length) throw new PadronError(422, "El padrón contiene errores. No se importó ninguna fila.", errores.slice(0, 100));
  if (!estudiantes.length) throw new PadronError(422, "El padrón debe contener al menos un estudiante.");
  return estudiantes;
}

module.exports = { leerPadronExcel, MAX_ESTUDIANTES, MAX_ARCHIVO_BYTES };
