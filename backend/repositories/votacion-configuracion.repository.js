function createVotacionConfiguracionRepository(pool) {
  return {
    async obtener() {
      const result = await pool.query(`
        SELECT
          votacion_abierta AS "votacionAbierta",
          voto_blanco_habilitado AS "votoBlancoHabilitado",
          actualizado_en AS "actualizadoEn"
        FROM configuracion_votacion
        WHERE id = 1
      `);

      return result.rows[0] ?? null;
    },

    async actualizar({ votacionAbierta, votoBlancoHabilitado }) {
      const result = await pool.query(`
        UPDATE configuracion_votacion
        SET
          votacion_abierta = COALESCE($1, votacion_abierta),
          voto_blanco_habilitado = COALESCE($2, voto_blanco_habilitado),
          actualizado_en = NOW()
        WHERE id = 1
        RETURNING
          votacion_abierta AS "votacionAbierta",
          voto_blanco_habilitado AS "votoBlancoHabilitado",
          actualizado_en AS "actualizadoEn"
      `, [
        votacionAbierta ?? null,
        votoBlancoHabilitado ?? null,
      ]);

      return result.rows[0] ?? null;
    },
  };
}

module.exports = { createVotacionConfiguracionRepository };