function createResultadosRepository(pool) {
  return {
    async obtenerConteo() {
      // Una sola consulta mantiene todos los conteos en la misma instantánea.
      const result = await pool.query(`
        WITH conteo_por_lista AS (
          SELECT l.id, l.numero, l.nombre, l.logo_url, l.propuestas, COUNT(v.id) AS votos
          FROM listas l
          LEFT JOIN votos v ON v.lista_id = l.id
          GROUP BY l.id, l.numero, l.nombre, l.logo_url, l.propuestas
        )
        SELECT
          (SELECT COUNT(*) FROM estudiantes WHERE activo = TRUE OR ya_voto = TRUE) AS habilitados,
          (SELECT COUNT(*) FROM votos) AS emitidos,
          (SELECT COUNT(*) FROM votos WHERE lista_id IS NULL) AS blancos,
          COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('id', r.id, 'numero', r.numero, 'nombre', r.nombre, 'votos', r.votos,
              'logoUrl', r.logo_url, 'propuestas', r.propuestas, 'candidatos', COALESCE(
                (SELECT jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre, 'cargo', c.cargo, 'fotoUrl', c.foto_url) ORDER BY c.id)
                  FROM candidatos c WHERE c.lista_id = r.id), '[]'::jsonb)))
             FROM conteo_por_lista r),
            '[]'::jsonb
          ) AS listas
      `);
      return result.rows[0];
    },
  };
}

module.exports = { createResultadosRepository };
