function createEstudianteRepository(pool) {
  return {
    async findByDni(dni) {
      const result = await pool.query(
        `SELECT id, codigo AS dni, nombre, ya_voto
         FROM estudiantes
         WHERE codigo = $1
         LIMIT 1`,
        [dni],
      );
      return result.rows[0] ?? null;
    },
  };
}

module.exports = { createEstudianteRepository };
