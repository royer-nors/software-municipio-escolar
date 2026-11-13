const { ComputadorasError } = require("../errors/computadoras.error");
const PUBLICOS = "id, identificador, nombre, grado, activo, fecha_registro";

function createComputadorasRepository(pool) {
  return {
    async crear({ identificador, nombre, grado }) {
      return (await pool.query(`INSERT INTO computadoras (identificador, nombre, grado)
        VALUES ($1, $2, $3) RETURNING ${PUBLICOS}`, [identificador, nombre, grado])).rows[0];
    },
    async listar({ limit, offset }) {
      const { rows } = await pool.query(`SELECT ${PUBLICOS} FROM computadoras ORDER BY id LIMIT $1 OFFSET $2`, [limit + 1, offset]);
      return { computadoras: rows.slice(0, limit), hayMas: rows.length > limit };
    },
    async editar(id, datos) {
      // Columnas exclusivamente internas; todos los valores usan parámetros.
      const keys = ["nombre", "grado", "activo"].filter(k => Object.hasOwn(datos, k));
      const { rows } = await pool.query(`UPDATE computadoras SET
        ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} WHERE id = $1 RETURNING ${PUBLICOS}`,
      [id, ...keys.map(k => datos[k])]);
      if (!rows.length) throw new ComputadorasError(404, "Computadora no encontrada.");
      return rows[0];
    },
  };
}
module.exports = { createComputadorasRepository };
