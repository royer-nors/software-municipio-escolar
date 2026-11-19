const accion = new URLSearchParams(window.location.search).get("accion");
const salida = accion === "salir";
document.getElementById("titulo").textContent = salida ? "Cerrar puesto de votación" : "Reconfigurar servidor";
document.getElementById("descripcion").textContent = salida
  ? "Escribe la clave para cerrar la aplicación."
  : "Escribe la clave para cambiar la dirección del servidor.";
const formulario = document.getElementById("formulario");
const clave = document.getElementById("clave");
const error = document.getElementById("error");

formulario.addEventListener("submit", async event => {
  event.preventDefault();
  error.textContent = "";
  try {
    const resultado = await window.puestoApp.verificarClave(clave.value);
    if (resultado.ok) return;
    error.textContent = resultado.mensaje;
    clave.value = "";
    clave.focus();
  } catch {
    error.textContent = "No se pudo verificar la clave. Inténtalo otra vez.";
    clave.value = "";
    clave.focus();
  }
});

document.getElementById("cancelar").addEventListener("click", () => window.puestoApp.cancelarClave());
