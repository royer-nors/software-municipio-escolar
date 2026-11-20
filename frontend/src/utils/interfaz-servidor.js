// Señal de presentación enviada por el proceso principal de Electron al iframe
// controlado de su ventana Servidor; no autoriza ninguna operación.
// No se consultan parámetros, almacenamiento local ni el User-Agent.
export function esInterfazServidor(ventana = globalThis.window) {
  return ventana?.municipioEscritorio?.interfaz === "servidor";
}
export function escucharInterfazServidor(actualizar) {
  window.addEventListener("municipio:interfaz-servidor", actualizar);
  return () => window.removeEventListener("municipio:interfaz-servidor", actualizar);
}
