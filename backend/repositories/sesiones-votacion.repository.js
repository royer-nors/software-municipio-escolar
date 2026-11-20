const { createHash } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { ComputadorasError } = require("../errors/computadoras.error");
const hash = token => createHash("sha256").update(token).digest("hex");
async function registrarSesion(client, puesto, sesion) {
  // El token procede exclusivamente del emisor interno; nunca del cuerpo del cliente.
  const exp = jwt.decode(sesion.token)?.exp;
  if (!Number.isSafeInteger(exp)) throw new Error("La sesión emitida no tiene vencimiento.");
  await client.query(`INSERT INTO sesiones_votacion_puesto(token_hash,estudiante_id,vinculacion_id,vence_en)
    VALUES($1,$2,$3,to_timestamp($4)) ON CONFLICT (token_hash) DO NOTHING`, [hash(sesion.token), sesion.estudiante.id, puesto.vinculacionId, exp]);
}
async function validarSesion(client, req, puesto) {
  const token = /^Bearer\s+(\S+)$/i.exec(req.get("Authorization") || "")?.[1];
  const r = token && (await client.query(`SELECT 1 FROM sesiones_votacion_puesto WHERE token_hash=$1
    AND estudiante_id=$2 AND vinculacion_id=$3 AND finalizada_en IS NULL AND vence_en>clock_timestamp()`,
  [hash(token), req.estudiante.id, puesto.vinculacionId])).rows[0];
  if (!r) throw new ComputadorasError(401, "La sesión del estudiante venció o finalizó. Identifícate nuevamente.");
}
async function finalizarSesiones(client, estudianteId) {
  // No conservar una cronología de estudiantes que pueda correlacionarse con votos.
  await client.query("DELETE FROM sesiones_votacion_puesto WHERE estudiante_id=$1", [estudianteId]);
}
module.exports = { registrarSesion, validarSesion, finalizarSesiones };
