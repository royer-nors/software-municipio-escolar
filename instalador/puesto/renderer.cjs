const seccionConfiguracion = document.getElementById("configuracion");
const seccionSinConexion = document.getElementById("sin-conexion");
const formulario = document.getElementById("formulario-servidor");
const campoUrl = document.getElementById("servidor-url");
const botonGuardar = document.getElementById("guardar");
const botonReintentar = document.getElementById("reintentar");
const mensaje = document.getElementById("mensaje");
const estado = document.getElementById("estado");
const direccionGuardada = document.getElementById("direccion-guardada");

async function mostrarVista() {
  const datos = await window.puestoApp.obtenerEstado();
  seccionConfiguracion.hidden = datos.vista !== "configuracion";
  seccionSinConexion.hidden = datos.vista !== "sin-conexion";
  if (datos.servidorUrl) {
    campoUrl.value = datos.servidorUrl;
    direccionGuardada.textContent = `Servidor configurado: ${datos.servidorUrl}`;
  }
  if (datos.vista === "sin-conexion") {
    estado.textContent = "Buscando el servidor…";
    reintentarPeriodicamente();
  } else {
    campoUrl.focus();
  }
}

formulario.addEventListener("submit", async event => {
  event.preventDefault();
  if (!formulario.reportValidity()) return;
  mensaje.textContent = "";
  estado.textContent = "Verificando el servidor…";
  botonGuardar.disabled = true;
  try {
    const resultado = await window.puestoApp.guardarServidor(campoUrl.value);
    if (!resultado.ok) throw new Error(resultado.mensaje || "No se pudo guardar la configuración.");
  } catch (error) {
    mensaje.textContent = error.message;
    estado.textContent = "";
  } finally {
    botonGuardar.disabled = false;
  }
});

botonReintentar.addEventListener("click", reintentar);

let temporizador;
function reintentarPeriodicamente() {
  clearTimeout(temporizador);
  temporizador = setTimeout(async () => {
    await reintentar();
    if (!seccionSinConexion.hidden) reintentarPeriodicamente();
  }, 5000);
}

async function reintentar() {
  botonReintentar.disabled = true;
  mensaje.textContent = "";
  estado.textContent = "Intentando conectar…";
  const resultado = await window.puestoApp.reintentar();
  if (!resultado.ok) {
    mensaje.textContent = resultado.mensaje;
    estado.textContent = "Sin conexión. Se reintentará automáticamente.";
    botonReintentar.disabled = false;
  }
}

mostrarVista();
