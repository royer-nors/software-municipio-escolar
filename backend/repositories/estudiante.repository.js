const { UsuariosError } = require("../errors/usuarios.error");
const PUBLICOS = "id, codigo AS dni, nombre, grado, seccion, activo, ya_voto";
function createEstudianteRepository(pool) {
  async function modificar(operacion) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Mismo orden de bloqueo que la importación; excluye votos concurrentes.
      await client.query("LOCK TABLE estudiantes, votos IN SHARE ROW EXCLUSIVE MODE");
      const estado = await client.query(`SELECT EXISTS (SELECT 1 FROM votos) OR
        EXISTS (SELECT 1 FROM estudiantes WHERE ya_voto = TRUE) AS bloqueado`);
      if (estado.rows[0].bloqueado) throw new UsuariosError(409, "No se puede modificar el padrón después de comenzar la votación.");
      const row = await operacion(client);
      if (!row) throw new UsuariosError(404, "Estudiante no encontrado.");
      await client.query("COMMIT");
      return row;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  return {
    async findByDni(dni) {
      const result = await pool.query(
        `SELECT id, codigo AS dni, nombre, ya_voto, activo
         FROM estudiantes
         WHERE codigo = $1
         LIMIT 1`,
        [dni],
      );
      return result.rows[0] ?? null;
    },
    async crear({ codigo, nombre, grado, seccion }) {
      return modificar(async client => (await client.query(`INSERT INTO estudiantes (codigo, nombre, grado, seccion)
        VALUES ($1, $2, $3, $4) RETURNING ${PUBLICOS}`, [codigo, nombre, grado, seccion])).rows[0]);
    },
    async listar({ buscar, limit, offset }) {
      return (await pool.query(`SELECT ${PUBLICOS} FROM estudiantes
        WHERE strpos(lower(concat_ws(' ', codigo, nombre, grado, seccion)), lower($1)) > 0
        ORDER BY id LIMIT $2 OFFSET $3`, [buscar, limit, offset])).rows;
    },
    async editar(id, datos) {
      // Los nombres de columnas proceden exclusivamente de esta lista interna.
      const keys = ["codigo", "nombre", "grado", "seccion"].filter(k => Object.hasOwn(datos, k));
      return modificar(async client => (await client.query(`UPDATE estudiantes SET
        ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING ${PUBLICOS}`,
      [id, ...keys.map(k => datos[k])])).rows[0]);
    },
    async desactivar(id) {
      return modificar(async client => (await client.query(`UPDATE estudiantes SET activo = FALSE
        WHERE id = $1 RETURNING ${PUBLICOS}`, [id])).rows[0]);
    },
  };
}

module.exports = { createEstudianteRepository };
