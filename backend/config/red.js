const ORIGENES_LOCALES = "http://localhost:5173,http://127.0.0.1:5173";

function configurarRed(env = {}) {
  const host = (env.HOST ?? "127.0.0.1").trim();
  const puerto = String(env.PORT ?? "3000");
  if (!host || /[\s/]/.test(host)) throw new Error("HOST debe ser una dirección o nombre de interfaz válido.");
  if (!/^\d+$/.test(puerto) || Number(puerto) < 1 || Number(puerto) > 65535) {
    throw new Error("PORT debe ser un entero entre 1 y 65535.");
  }
  const origenes = (env.CORS_ORIGINS ?? ORIGENES_LOCALES).split(",").map(valor => valor.trim()).filter(Boolean);
  for (const origen of origenes) {
    let url;
    try { url = new URL(origen); } catch { throw new Error("CORS_ORIGINS debe contener orígenes HTTP/HTTPS exactos separados por comas."); }
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origen || url.hostname.includes("*")) {
      throw new Error("CORS_ORIGINS debe contener orígenes HTTP/HTTPS exactos, sin rutas ni comodines.");
    }
  }
  if (env.CORS_ALLOW_NULL_ORIGIN !== undefined && !["true", "false"].includes(env.CORS_ALLOW_NULL_ORIGIN)) {
    throw new Error("CORS_ALLOW_NULL_ORIGIN debe ser true o false.");
  }
  return { host, port: Number(puerto), origenes, permitirOrigenNull: env.CORS_ALLOW_NULL_ORIGIN === "true" };
}

module.exports = { configurarRed };
