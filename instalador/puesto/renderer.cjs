const seccionConfiguracion = document.getElementById("configuracion");
const seccionSinConexion = document.getElementById("sin-conexion");
const formulario = document.getElementById("formulario-servidor");
const campoUrl = document.getElementById("servidor-url");
const botonGuardar = document.getElementById("guardar");
const botonReintentar = document.getElementById("reintentar");
const mensaje = document.getElementById("mensaje");
const estado = document.getElementById("estado");
const direccionGuardada = document.getElementById("direccion-guardada");
const grupoClave = document.getElementById("grupo-clave");
const campoClave = document.getElementById("clave");
const campoConfirmacion = document.getElementById("confirmacion");
const ayudaClave = document.getElementById("ayuda-clave");
const aviso = document.getElementById("aviso");

async function mostrarVista() {
  const datos = await window.puestoApp.obtenerEstado();
  seccionConfiguracion.hidden = datos.vista !== "configuracion";
  seccionSinConexion.hidden = datos.vista !== "sin-conexion";
  grupoClave.hidden = !datos.requiereClave;
  campoClave.required = datos.requiereClave;
  campoConfirmacion.required = datos.requiereClave;
  ayudaClave.hidden = !datos.requiereClave;
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
  const entrada = campoUrl.value.trim();
  if (/^https:\/\//i.test(entrada)) {
    aviso.textContent = "El servidor de la red local usa HTTP. Se cambió https:// por http://.";
  } else {
    aviso.textContent = "";
  }
  try {
    const resultado = await window.puestoApp.guardarServidor({
      servidorUrl: campoUrl.value,
      clave: campoClave.value,
      confirmacion: campoConfirmacion.value,
    });
    if (!resultado.ok) {
      if (resultado.url) campoUrl.value = resultado.url;
      mensaje.textContent = resultado.mensaje || "No se pudo guardar la configuración.";
      estado.textContent = "";
      if (resultado.aviso) aviso.textContent = resultado.aviso;
      return;
    }
    if (resultado.aviso) aviso.textContent = resultado.aviso;
  } catch {
    mensaje.textContent = "No se pudo guardar la configuración. Revisa los datos e inténtalo otra vez.";
    estado.textContent = "";
  } finally {
    botonGuardar.disabled = false;
  }
});

for (const campo of [campoUrl, campoClave, campoConfirmacion]) {
  campo.addEventListener("input", () => { mensaje.textContent = ""; aviso.textContent = ""; });
}

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
