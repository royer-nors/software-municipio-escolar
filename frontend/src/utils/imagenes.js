const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";
export function urlImagen(ruta) {
  if (typeof ruta !== "string" || !ruta) return "";
  try {
    const base = new URL(API, globalThis.location?.href || "http://localhost");
    const url = new URL(ruta, base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}
export async function esperarImagenes(contenedor) {
  if (globalThis.document?.fonts) await document.fonts.ready;
  await Promise.all([...contenedor.querySelectorAll("img")].map(async imagen => {
    if (imagen.complete && imagen.naturalWidth > 0) return;
    let timer;
    try {
      await Promise.race([imagen.decode(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Tiempo agotado")), 10000);
      })]);
      if (!imagen.naturalWidth) throw new Error("Imagen vacía");
    } catch { throw new Error("No se puede imprimir: alguna imagen no cargó correctamente. Revisa la conexión y vuelve a intentar."); }
    finally { clearTimeout(timer); }
  }));
}
