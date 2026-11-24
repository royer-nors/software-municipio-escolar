const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("puestoApp", {
  obtenerEstado: () => ipcRenderer.invoke("puesto:estado"),
  comprobarServidor: datos => ipcRenderer.invoke("puesto:comprobar-servidor", datos),
  continuar: () => ipcRenderer.invoke("puesto:continuar"),
  editarDireccion: () => ipcRenderer.invoke("puesto:editar-direccion"),
  reintentar: () => ipcRenderer.invoke("puesto:reintentar"),
  finalizarSesion: () => ipcRenderer.invoke("puesto:finalizar-sesion"),
  verificarClave: clave => ipcRenderer.invoke("puesto:validar-clave", clave),
  cancelarClave: () => ipcRenderer.invoke("puesto:cancelar-clave"),
});

// Solo solicitudes: el proceso principal verifica origen, ventana y estado real.
contextBridge.exposeInMainWorld("puestoVentana", {
  confirmarEleccionAbierta: () => ipcRenderer.invoke("puesto:confirmar-eleccion-abierta"),
  iniciarAutenticacion: () => ipcRenderer.invoke("puesto:iniciar-autenticacion"),
  registrarSesion: token => ipcRenderer.invoke("puesto:registrar-sesion", token),
  finalizarSesion: () => ipcRenderer.invoke("puesto:finalizar-sesion"),
});
window.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("beforeinput", event => {
    if (event.target?.id === "dni") ipcRenderer.invoke("puesto:iniciar-autenticacion").catch(() => {});
  }, true);
  document.addEventListener("click", event => {
    const boton = event.target?.closest?.("button");
    // Compatibilidad con el frontend anterior servido por una instalación existente.
    if (event.isTrusted && boton?.textContent.trim() === "Finalizar" &&
        !boton.hasAttribute("data-finalizacion-electron") &&
        boton.closest("dialog[open]")?.querySelector("h2")?.textContent === "Voto registrado") {
      ipcRenderer.invoke("puesto:finalizar-sesion").catch(() => {});
    }
  }, true);
});
