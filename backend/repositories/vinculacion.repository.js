const { ComputadorasError } = require("../errors/computadoras.error");

const ESTADO_VINCULACION = `CASE
  WHEN NOT c.activo THEN 'deshabilitada'
  WHEN EXISTS (SELECT 1 FROM vinculaciones_puesto v WHERE v.computadora_id=c.id AND v.revocada_en IS NULL AND v.vence_en>clock_timestamp()) THEN 'vinculada'
  WHEN EXISTS (SELECT 1 FROM vinculaciones_puesto v WHERE v.computadora_id=c.id AND v.revocada_en IS NULL) THEN 'vencida'
  WHEN EXISTS (SELECT 1 FROM autorizaciones_puesto a WHERE a.computadora_id=c.id AND a.consumida_en IS NULL AND a.revocada_en IS NULL AND a.vence_en>clock_timestamp()) THEN 'pendiente'
  WHEN EXISTS (SELECT 1 FROM vinculaciones_puesto v WHERE v.computadora_id=c.id) THEN 'revocada'
  WHEN EXISTS (SELECT 1 FROM autorizaciones_puesto a WHERE a.computadora_id=c.id AND a.consumida_en IS NULL AND a.revocada_en IS NULL) THEN 'vencida'
  WHEN EXISTS (SELECT 1 FROM autorizaciones_puesto a WHERE a.computadora_id=c.id AND a.revocada_en IS NOT NULL) THEN 'revocada'
  ELSE 'sin_vincular' END`;

function createVinculacionRepository(pool) {
  async function transaccion(id, operar) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query("SELECT id, activo FROM computadoras WHERE id=$1 FOR UPDATE", [id]);
      if (!rows.length) throw new ComputadorasError(404, "Computadora no encontrada.");
      const resultado = await operar(client, rows[0]);
      await client.query("COMMIT");
      return resultado;
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }
  }
  return {
    async estado(id) {
      const { rows } = await pool.query(`SELECT c.id, ${ESTADO_VINCULACION} AS estado FROM computadoras c WHERE c.id=$1`, [id]);
      if (!rows.length) throw new ComputadorasError(404, "Computadora no encontrada.");
      return rows[0];
    },
    generar(id, hash) {
      return transaccion(id, async (client, c) => {
        if (!c.activo) throw new ComputadorasError(409, "La computadora está deshabilitada.");
        const previa = await client.query("SELECT id FROM vinculaciones_puesto WHERE computadora_id=$1 AND revocada_en IS NULL", [id]);
        if (previa.rows.length) throw new ComputadorasError(409, "Revoca la vinculación anterior antes de generar otra autorización.");
        await client.query("UPDATE autorizaciones_puesto SET revocada_en=clock_timestamp() WHERE computadora_id=$1 AND consumida_en IS NULL AND revocada_en IS NULL", [id]);
        return (await client.query(`INSERT INTO autorizaciones_puesto (computadora_id,codigo_hash,vence_en)
          VALUES ($1,$2,clock_timestamp()+interval '10 minutes') RETURNING vence_en`, [id, hash])).rows[0];
      });
    },
    async canjear(hash, credencialHash) {
      const previa = await pool.query("SELECT computadora_id FROM autorizaciones_puesto WHERE codigo_hash=$1", [hash]);
      if (!previa.rows.length) throw new ComputadorasError(401, "Autorización inválida, vencida o utilizada.");
      return transaccion(previa.rows[0].computadora_id, async (client, c) => {
        if (!c.activo) throw new ComputadorasError(401, "Autorización inválida, vencida o utilizada.");
        const autorizacion = await client.query(`SELECT id FROM autorizaciones_puesto WHERE codigo_hash=$1
          AND consumida_en IS NULL AND revocada_en IS NULL AND vence_en>clock_timestamp() FOR UPDATE`, [hash]);
        if (!autorizacion.rows.length) throw new ComputadorasError(401, "Autorización inválida, vencida o utilizada.");
        const previa = await client.query("SELECT id FROM vinculaciones_puesto WHERE computadora_id=$1 AND revocada_en IS NULL", [c.id]);
        if (previa.rows.length) throw new ComputadorasError(409, "La computadora ya tiene una vinculación. Solicita su revocación.");
        const vinculacion = (await client.query(`INSERT INTO vinculaciones_puesto (computadora_id,autorizacion_id,credencial_hash,vence_en)
          VALUES ($1,$2,$3,clock_timestamp()+interval '12 hours') RETURNING vence_en`, [c.id, autorizacion.rows[0].id, credencialHash])).rows[0];
        await client.query("UPDATE autorizaciones_puesto SET consumida_en=clock_timestamp() WHERE id=$1", [autorizacion.rows[0].id]);
        return vinculacion;
      });
    },
    revocar(id) {
      return transaccion(id, async client => {
        await client.query("UPDATE autorizaciones_puesto SET revocada_en=clock_timestamp() WHERE computadora_id=$1 AND consumida_en IS NULL AND revocada_en IS NULL", [id]);
        await client.query("UPDATE vinculaciones_puesto SET revocada_en=clock_timestamp() WHERE computadora_id=$1 AND revocada_en IS NULL", [id]);
        return { estado: "revocada" };
      });
    },
    async autenticar(hash) {
      const { rows } = await pool.query(`SELECT c.id,c.identificador,c.nombre,c.grado,c.activo,
        v.revocada_en IS NOT NULL AS revocada, v.vence_en<=clock_timestamp() AS vencida, v.vence_en
        FROM vinculaciones_puesto v JOIN computadoras c ON c.id=v.computadora_id WHERE v.credencial_hash=$1`, [hash]);
      return rows[0] ?? null;
    },
  };
}
module.exports = { createVinculacionRepository, ESTADO_VINCULACION };
