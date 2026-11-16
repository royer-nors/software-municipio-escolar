function configurarPuesto(env = {}) {
  if (env.PUESTO_COOKIE_SECURE !== undefined && !["true", "false"].includes(env.PUESTO_COOKIE_SECURE)) {
    throw new Error("PUESTO_COOKIE_SECURE debe ser true o false.");
  }
  const modoLan = env.MODO_LAN === "true";
  const secure = modoLan ? false : env.PUESTO_COOKIE_SECURE !== "false";
  if (!secure && env.NODE_ENV === "production") {
    throw new Error("Las credenciales de puesto requieren cookies Secure en producción.");
  }
  if (env.PUESTO_PROXY_LOOPBACK !== undefined && !["true", "false"].includes(env.PUESTO_PROXY_LOOPBACK)) throw new Error("PUESTO_PROXY_LOOPBACK debe ser true o false.");
  const proxyLoopback = env.PUESTO_PROXY_LOOPBACK === "true";
  if (proxyLoopback && (!["127.0.0.1", "::1", "localhost"].includes(env.HOST ?? "127.0.0.1") || !secure)) {
    throw new Error("El proxy HTTPS requiere backend en loopback y cookies Secure.");
  }
  return { secure, proxyLoopback, modoLan };
}
module.exports = { configurarPuesto };
