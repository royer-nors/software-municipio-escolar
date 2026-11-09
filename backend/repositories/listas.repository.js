function createListasRepository(pool) {
  return {
    async obtenerPapeleta(estudianteId) {
      const result = await pool.query(`
        SELECT
          (SELECT jsonb_build_object('yaVoto', e.ya_voto, 'activo', e.activo)
           FROM estudiantes e WHERE e.id = $1) AS estudiante,
          COALESCE(
            (SELECT jsonb_agg(
              jsonb_build_object('id', c.id, 'nombre', c.nombre, 'lista', l.nombre, 'listaId', l.id)
              ORDER BY l.nombre, c.id
            ) FROM candidatos c JOIN listas l ON l.id = c.lista_id),
            '[]'::jsonb
          ) AS candidatos
      `, [estudianteId]);
      return result.rows[0];
    },
  };
}

module.exports = { createListasRepository };
