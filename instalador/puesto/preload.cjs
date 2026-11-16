const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("puestoApp", {
  obtenerEstado: () => ipcRenderer.invoke("puesto:estado"),
  guardarServidor: url => ipcRenderer.invoke("puesto:guardar-servidor", url),
  reintentar: () => ipcRenderer.invoke("puesto:reintentar"),
});
