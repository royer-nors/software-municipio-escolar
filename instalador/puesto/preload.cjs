const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("puestoApp", {
  obtenerEstado: () => ipcRenderer.invoke("puesto:estado"),
  guardarServidor: datos => ipcRenderer.invoke("puesto:guardar-servidor", datos),
  reintentar: () => ipcRenderer.invoke("puesto:reintentar"),
  verificarClave: clave => ipcRenderer.invoke("puesto:validar-clave", clave),
  cancelarClave: () => ipcRenderer.invoke("puesto:cancelar-clave"),
});

// Solo solicitudes: el proceso principal verifica origen, ventana y estado real.
contextBridge.exposeInMainWorld("puestoVentana", {
  iniciarAutenticacion: () => ipcRenderer.invoke("puesto:iniciar-autenticacion"),
  registrarSesion: token => ipcRenderer.invoke("puesto:registrar-sesion", token),
});
window.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("beforeinput", event => {
    if (event.target?.id === "dni") ipcRenderer.invoke("puesto:iniciar-autenticacion").catch(() => {});
  }, true);
  document.addEventListener("click", event => {
    const boton = event.target?.closest?.("button");
    if (boton?.textContent.trim() === "Finalizar" && [...document.querySelectorAll("dialog h2")].some(h => h.textContent === "Voto registrado")) {
      ipcRenderer.invoke("puesto:finalizar-sesion").catch(() => {});
    }
  }, true);
});
