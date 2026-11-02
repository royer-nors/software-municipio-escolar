function createAdministradorRepository(pool) {
  return {
    async findByUsuario(usuario) {
      const result = await pool.query(
        `SELECT id, usuario, password_hash
         FROM administradores
         WHERE usuario = $1
         LIMIT 1`,
        [usuario],
      );
      return result.rows[0] ?? null;
    },
  };
}

module.exports = { createAdministradorRepository };
