// Señal exclusivamente visual. No contiene tokens, permisos ni acceso a IPC/Node.
const SENAL = `
  if (!Object.hasOwn(window, "municipioEscritorio")) {
    Object.defineProperty(window, "municipioEscritorio", {
      value: Object.freeze({ interfaz: "servidor" }), writable: false, configurable: false
    });
  }
  window.dispatchEvent(new Event("municipio:interfaz-servidor"));
`;
function conectarInterfazServidor(ventana) {
  ventana.webContents.on("did-frame-finish-load", async (_event, principal) => {
    if (principal || ventana.isDestroyed()) return;
    // Solo el hijo directo de la ventana del Servidor, nunca otros orígenes.
    for (const frame of ventana.webContents.mainFrame.frames) {
      if (frame.parent !== ventana.webContents.mainFrame) continue;
      try {
        if (new URL(frame.url).origin !== "http://localhost:3000") continue;
        await frame.executeJavaScript(SENAL);
      } catch { /* Un iframe cerrado o que está navegando ya no necesita señal. */ }
    }
  });
}
module.exports = { conectarInterfazServidor };
