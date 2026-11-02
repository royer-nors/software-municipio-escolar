function createResultadosRepository(pool) {
  return {
    async obtenerConteo() {
      // Una sola consulta mantiene todos los conteos en la misma instantánea.
      const result = await pool.query(`
        WITH conteo_por_lista AS (
          SELECT l.nombre, COUNT(v.id) AS votos
          FROM listas l
          LEFT JOIN votos v ON v.lista_id = l.id
          GROUP BY l.id, l.nombre
        )
        SELECT
          (SELECT COUNT(*) FROM estudiantes) AS habilitados,
          (SELECT COUNT(*) FROM votos) AS emitidos,
          (SELECT COUNT(*) FROM votos WHERE lista_id IS NULL) AS blancos,
          COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('nombre', nombre, 'votos', votos))
             FROM conteo_por_lista),
            '[]'::jsonb
          ) AS listas
      `);
      return result.rows[0];
    },
  };
}

module.exports = { createResultadosRepository };
