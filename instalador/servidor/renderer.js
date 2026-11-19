const selector = document.getElementById("url-lan");
const boton = document.getElementById("copiar");
const aviso = document.getElementById("aviso");

async function cargarDirecciones() {
  try {
    const urls = await window.servidorEscolar.obtenerUrls();
    selector.replaceChildren();
    for (const url of urls) {
      const opcion = document.createElement("option");
      opcion.value = url;
      opcion.textContent = url;
      selector.append(opcion);
    }
    boton.disabled = urls.length === 0;
    aviso.textContent = urls.length ? "" : "No se detectó una IPv4 privada de LAN.";
  } catch {
    aviso.textContent = "No se pudieron detectar las direcciones LAN.";
  }
}

boton.addEventListener("click", async () => {
  if (!selector.value) return;
  const copiado = await window.servidorEscolar.copiarUrl(selector.value);
  aviso.textContent = copiado ? "URL copiada." : "No se pudo copiar la URL.";
});

selector.addEventListener("change", () => { aviso.textContent = ""; });
cargarDirecciones();
setInterval(cargarDirecciones, 10000);
