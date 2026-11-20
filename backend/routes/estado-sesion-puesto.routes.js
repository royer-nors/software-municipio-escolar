// Comprobante de solo lectura para recuperar la ventana Electron ante una
// respuesta incierta. Nunca emite tokens ni autoriza identificar o emitir votos.
const { Router } = require("express");
const jwt = require("jsonwebtoken");
const { createHash, createHmac } = require("node:crypto");
const { JWT_ISSUER, STUDENT_JWT_AUDIENCE } = require("../config/auth");
const { createVotacionPuestoRepository } = require("../repositories/votacion-puesto.repository");
const { credencial, validarSolicitudPuesto } = require("./vinculacion.routes");
function createEstadoSesionPuestoRouter({ pool, jwtSecret, red, config }) {
  const router = Router(), repository = createVotacionPuestoRepository(pool);
  router.get("/sesion-ventana", async (req, res) => {
    res.set("Cache-Control", "no-store");
    try {
      validarSolicitudPuesto(req, red, config, false);
      const token = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "")?.[1];
      // Un JWT vencido solo sirve como comprobante firmado de identidad para
      // esta consulta. Los endpoints de voto siguen rechazándolo normalmente.
      const c = jwt.verify(token, jwtSecret, { algorithms: ["HS256"], issuer: JWT_ISSUER,
        audience: STUDENT_JWT_AUDIENCE, ignoreExpiration: true });
      if (c.rol !== "estudiante" || !/^[1-9]\d*$/.test(c.sub) || !Number.isSafeInteger(Number(c.sub)) ||
        !Number.isSafeInteger(c.exp) || typeof c.vinculacionId !== "string") throw Error("Identidad inválida");
      const datos = await repository.ejecutar(credencial(req), async (client, puesto) => {
        if (c.vinculacionId !== puesto.vinculacionId) throw Error("Otro puesto");
        const e = (await client.query("SELECT activo,ya_voto FROM estudiantes WHERE id=$1", [Number(c.sub)])).rows[0];
        if (!e?.activo) throw Error("Estudiante no disponible");
        const referencia = createHmac("sha256", jwtSecret).update(`${c.sub}:${c.vinculacionId}`).digest("hex");
        const pendientes = (await client.query(`SELECT count(*)::int n FROM sesiones_votacion_puesto s
          JOIN estudiantes e ON e.id=s.estudiante_id WHERE s.vinculacion_id=$1
          AND s.finalizada_en IS NULL AND s.vence_en>clock_timestamp() AND e.activo AND NOT e.ya_voto`, [puesto.vinculacionId])).rows[0].n;
        if (e.ya_voto) return { estado: "registrada", referencia, pendientes };
        if (c.exp * 1000 <= Date.now()) return { estado: "vencida", referencia, pendientes };
        const s = (await client.query(`SELECT 1 FROM sesiones_votacion_puesto WHERE token_hash=$1
          AND estudiante_id=$2 AND vinculacion_id=$3 AND finalizada_en IS NULL AND vence_en>clock_timestamp()`,
        [createHash("sha256").update(token).digest("hex"), Number(c.sub), puesto.vinculacionId])).rows[0];
        if (!s) throw Error("Sesión no verificable");
        return { estado: "activa", referencia, pendientes };
      });
      return res.json(datos);
    } catch { return res.status(401).json({ mensaje: "No se pudo verificar el estado de la sesión del puesto." }); }
  });
  return router;
}
module.exports = { createEstadoSesionPuestoRouter };
