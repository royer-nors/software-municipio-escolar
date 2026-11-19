const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("puestoApp", {
  obtenerEstado: () => ipcRenderer.invoke("puesto:estado"),
  guardarServidor: datos => ipcRenderer.invoke("puesto:guardar-servidor", datos),
  reintentar: () => ipcRenderer.invoke("puesto:reintentar"),
  verificarClave: clave => ipcRenderer.invoke("puesto:validar-clave", clave),
  cancelarClave: () => ipcRenderer.invoke("puesto:cancelar-clave"),
});
