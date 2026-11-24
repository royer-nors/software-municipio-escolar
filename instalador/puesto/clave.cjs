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
