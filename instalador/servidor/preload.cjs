const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("servidorEscolar", {
  obtenerUrls: () => ipcRenderer.invoke("servidor:urls"),
  copiarUrl: url => ipcRenderer.invoke("servidor:copiar", url),
});
