function createBorradoDatosRepository(pool) {
  return {
    async obtenerResumen() {
      const result = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM estudiantes) AS estudiantes,
          (SELECT COUNT(*)::int FROM listas) AS listas,
          (SELECT COUNT(*)::int FROM candidatos) AS candidatos,
          (SELECT COUNT(*)::int FROM votos) AS votos,
          (SELECT COUNT(*)::int FROM estudiantes WHERE ya_voto = TRUE) AS estudiantes_marcados_ya_voto,
          EXISTS (SELECT 1 FROM configuracion_votacion WHERE id = 1) AS configuracion_disponible,
          COALESCE((SELECT votacion_abierta FROM configuracion_votacion WHERE id = 1), FALSE) AS votacion_abierta,
          EXISTS (SELECT 1 FROM votos) AS votos_registrados,
          EXISTS (SELECT 1 FROM estudiantes WHERE ya_voto = TRUE) AS estudiantes_ya_votaron
      `);
      return result.rows[0];
    },

    async registrarSimulacion({ administradorId, administradorUsuario, operacion, resultado, detalle }) {
      await pool.query(`
        INSERT INTO auditoria_borrado_datos
          (administrador_id, administrador_usuario, operacion, modo, resultado, detalle)
        VALUES ($1, $2, $3, 'simulacion', $4, $5::jsonb)
      `, [administradorId, administradorUsuario, operacion, resultado, JSON.stringify(detalle)]);
    },
  };
}

module.exports = { createBorradoDatosRepository };