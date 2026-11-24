const seccionConfiguracion = document.getElementById("configuracion");
const seccionSinConexion = document.getElementById("sin-conexion");
const formulario = document.getElementById("formulario-servidor");
const campoUrl = document.getElementById("servidor-url");
const botonGuardar = document.getElementById("guardar");
const botonContinuar = document.getElementById("continuar");
const botonEditar = document.getElementById("editar-direccion");
const botonReintentar = document.getElementById("reintentar");
const mensaje = document.getElementById("mensaje");
const estado = document.getElementById("estado");
const direccionGuardada = document.getElementById("direccion-guardada");
const aviso = document.getElementById("aviso");

async function mostrarVista() {
  const datos = await window.puestoApp.obtenerEstado();
  seccionConfiguracion.hidden = datos.vista !== "configuracion";
  seccionSinConexion.hidden = datos.vista !== "sin-conexion";
  document.getElementById("finalizar-sesion").hidden = datos.vista !== "finalizar-sesion";
  if (datos.servidorUrl) {
    campoUrl.value = datos.servidorUrl;
    direccionGuardada.textContent = `Servidor configurado: ${datos.servidorUrl}`;
  }
  if (datos.vista === "sin-conexion") {
    botonEditar.hidden = datos.pendiente;
    estado.textContent = "Buscando el servidor…";
  } else if (datos.vista === "configuracion") {
    campoUrl.focus();
  }
}

document.getElementById("finalizar").addEventListener("click", async () => {
  mensaje.textContent = "";
  try {
    if ((await window.puestoApp.finalizarSesion()).ok) return;
  } catch {}
  mensaje.textContent = "El Puesto sigue protegido. Espera la conexión con el Servidor o vuelve a intentar.";
});

formulario.addEventListener("submit", async event => {
  event.preventDefault();
  if (!formulario.reportValidity()) return;
  mensaje.textContent = "";
  estado.textContent = "Conectando al Servidor...";
  botonContinuar.hidden = true;
  botonGuardar.disabled = true;
  campoUrl.readOnly = true;
  const entrada = campoUrl.value.trim();
  if (/^https:\/\//i.test(entrada)) {
    aviso.textContent = "El servidor de la red local usa HTTP. Se cambió https:// por http://.";
  } else {
    aviso.textContent = "";
  }
  try {
    const resultado = await window.puestoApp.comprobarServidor({
      servidorUrl: campoUrl.value,
    });
    if (!resultado.ok) {
      if (resultado.url) campoUrl.value = resultado.url;
      mensaje.textContent = resultado.mensaje || "No se pudo guardar la configuración.";
      estado.textContent = "";
      if (resultado.aviso) aviso.textContent = resultado.aviso;
      return;
    }
    campoUrl.value = resultado.url;
    estado.textContent = "¡Conexión exitosa con el Servidor!";
    botonContinuar.hidden = false;
    botonContinuar.focus();
    if (resultado.aviso) aviso.textContent = resultado.aviso;
  } catch {
    mensaje.textContent = "No se pudo guardar la configuración. Revisa los datos e inténtalo otra vez.";
    estado.textContent = "";
  } finally {
    campoUrl.readOnly = false;
    botonGuardar.disabled = false;
  }
});

campoUrl.addEventListener("input", () => {
  mensaje.textContent = "";
  aviso.textContent = "";
  estado.textContent = "";
  botonContinuar.hidden = true;
});

botonReintentar.addEventListener("click", reintentar);
botonEditar.addEventListener("click", () => window.puestoApp.editarDireccion());
botonContinuar.addEventListener("click", async () => {
  if (!formulario.reportValidity()) return;
  botonContinuar.disabled = true;
  mensaje.textContent = "";
  try {
    const resultado = await window.puestoApp.continuar();
    if (!resultado.ok) mensaje.textContent = resultado.mensaje;
  } catch {
    mensaje.textContent = "No se pudo abrir el Puesto. Inténtalo otra vez.";
  } finally {
    botonContinuar.disabled = false;
  }
});

async function reintentar() {
  botonReintentar.disabled = true;
  mensaje.textContent = "";
  estado.textContent = "Intentando conectar…";
  try {
    const resultado = await window.puestoApp.reintentar();
    if (!resultado.ok) {
      mensaje.textContent = resultado.mensaje || "No se pudo conectar con el servidor.";
      estado.textContent = "Sin conexión. Se reintentará automáticamente.";
    }
  } catch {
    mensaje.textContent = "No se pudo conectar con el servidor.";
    estado.textContent = "Sin conexión. Se reintentará automáticamente.";
  } finally {
    botonReintentar.disabled = false;
  }
}

mostrarVista();
