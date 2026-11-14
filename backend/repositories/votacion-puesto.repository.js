const { createHash } = require("node:crypto");
const { ComputadorasError } = require("../errors/computadoras.error");
const { gradoSecundaria } = require("../services/grado-secundaria");
function errorPuesto() {
  const e = new ComputadorasError(401, "El puesto no está autorizado. Avisa al encargado.");
  e.codigo = "PUESTO_INVALIDO"; return e;
}
function validarGrado(estudiante, puesto) {
  if (gradoSecundaria(estudiante.grado) !== puesto.grado) {
    throw new ComputadorasError(403, "Tu grado no corresponde a este puesto. Solicita al encargado el equipo correcto.");
  }
}
function createVotacionPuestoRepository(pool) {
  return {
    async ejecutar(credencial, operacion) {
      if (typeof credencial !== "string" || !/^[a-f0-9]{64}$/.test(credencial)) throw errorPuesto();
      const hash = createHash("sha256").update(credencial).digest("hex");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const previa = (await client.query("SELECT computadora_id FROM vinculaciones_puesto WHERE credencial_hash=$1", [hash])).rows[0];
        if (!previa) throw errorPuesto();
        // Mismo orden que revocación: computadora primero, vinculación después.
        const c = (await client.query("SELECT id,grado,activo FROM computadoras WHERE id=$1 FOR SHARE", [previa.computadora_id])).rows[0];
        if (!c?.activo) throw errorPuesto();
        const v = (await client.query(`SELECT id, vence_en>clock_timestamp() AS vigente FROM vinculaciones_puesto
          WHERE credencial_hash=$1 AND computadora_id=$2 AND revocada_en IS NULL FOR SHARE`, [hash, c.id])).rows[0];
        if (!v?.vigente) throw errorPuesto();
        const puesto = { ...c, vinculacionId: String(v.id) };
        const resultado = await operacion(client, puesto);
        await client.query("COMMIT");
        return resultado;
      } catch (e) { await client.query("ROLLBACK"); throw e; }
      finally { client.release(); }
    },
    async estudiante(client, puesto, identidad, voto = false) {
      if (identidad.vinculacionId !== puesto.vinculacionId) throw errorPuesto();
      const e = (await client.query(`SELECT id,codigo AS dni,nombre,grado,seccion,activo,ya_voto FROM estudiantes
        WHERE id=$1 ${voto ? "FOR UPDATE" : "FOR SHARE"}`, [identidad.id])).rows[0];
      if (!e?.activo) throw new ComputadorasError(voto ? 409 : 401, "El estudiante no está habilitado en el padrón.");
      if (e.ya_voto) throw new ComputadorasError(409, "El estudiante ya emitió su voto.");
      validarGrado(e, puesto);
      return e;
    },
  };
}
module.exports = { createVotacionPuestoRepository, validarGrado, errorPuesto };
