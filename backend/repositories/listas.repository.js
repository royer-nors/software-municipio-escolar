function createListasRepository(pool) {
  return {
    async obtenerPapeleta(estudianteId) {
      const result = await pool.query(`
        SELECT
          (SELECT jsonb_build_object('yaVoto', e.ya_voto)
           FROM estudiantes e WHERE e.id = $1) AS estudiante,
          COALESCE(
            (SELECT jsonb_agg(
              jsonb_build_object('id', c.id, 'nombre', c.nombre, 'lista', c.lista)
              ORDER BY c.lista, c.id
            ) FROM candidatos c),
            '[]'::jsonb
          ) AS candidatos
      `, [estudianteId]);
      return result.rows[0];
    },
  };
}

module.exports = { createListasRepository };
