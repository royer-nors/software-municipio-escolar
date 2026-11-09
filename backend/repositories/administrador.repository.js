const { UsuariosError } = require("../errors/usuarios.error");
const PUBLICOS = "id, usuario, activo";
function createAdministradorRepository(pool) {
  return {
    async findByUsuario(usuario) {
      const result = await pool.query(
        `SELECT id, usuario, password_hash, activo, version_token
         FROM administradores
         WHERE usuario = $1
         LIMIT 1`,
        [usuario],
      );
      return result.rows[0] ?? null;
    },
    async findById(id) {
      return (await pool.query("SELECT id, usuario, password_hash, activo, version_token FROM administradores WHERE id = $1", [id])).rows[0] ?? null;
    },
    async crear(usuario, hash) {
      return (await pool.query(`INSERT INTO administradores (usuario, password_hash) VALUES ($1, $2) RETURNING ${PUBLICOS}`, [usuario, hash])).rows[0];
    },
    async listar({ buscar, limit, offset }) {
      return (await pool.query(`SELECT ${PUBLICOS} FROM administradores WHERE strpos(lower(usuario), lower($1)) > 0 ORDER BY id LIMIT $2 OFFSET $3`, [buscar, limit, offset])).rows;
    },
    async editar(id, usuario) {
      const row = (await pool.query(`UPDATE administradores SET usuario = $2 WHERE id = $1 RETURNING ${PUBLICOS}`, [id, usuario])).rows[0];
      if (!row) throw new UsuariosError(404, "Administrador no encontrado.");
      return row;
    },
    async desactivar(id) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serializa las desactivaciones, incluso si apuntan a filas diferentes.
        await client.query("LOCK TABLE administradores IN SHARE ROW EXCLUSIVE MODE");
        const row = (await client.query(`SELECT ${PUBLICOS} FROM administradores WHERE id = $1`, [id])).rows[0];
        if (!row) throw new UsuariosError(404, "Administrador no encontrado.");
        if (row.activo) {
          const count = (await client.query("SELECT COUNT(*)::int AS total FROM administradores WHERE activo = TRUE")).rows[0].total;
          if (count <= 1) throw new UsuariosError(409, "No se puede desactivar al último administrador activo.");
          await client.query("UPDATE administradores SET activo = FALSE, version_token = version_token + 1 WHERE id = $1", [id]);
        }
        await client.query("COMMIT");
        return { ...row, activo: false };
      } catch (error) { await client.query("ROLLBACK"); throw error; }
      finally { client.release(); }
    },
    async cambiarPassword(id, version, hash) {
      const result = await pool.query(`UPDATE administradores SET password_hash = $3, version_token = version_token + 1
        WHERE id = $1 AND version_token = $2 AND activo = TRUE RETURNING id`, [id, version, hash]);
      if (!result.rows.length) throw new UsuariosError(409, "La sesión cambió. Inicia sesión nuevamente.");
    },
  };
}

module.exports = { createAdministradorRepository };
