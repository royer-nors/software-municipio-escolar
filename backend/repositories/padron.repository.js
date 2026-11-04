const { PadronError } = require("../errors/padron.error");

function createPadronRepository(pool) {
  return {
    async reemplazar(estudiantes) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // El registro del voto bloquea primero estudiantes y después votos.
        await client.query("LOCK TABLE estudiantes, votos IN SHARE ROW EXCLUSIVE MODE");
        const estado = await client.query(`SELECT
          EXISTS (SELECT 1 FROM votos) OR
          EXISTS (SELECT 1 FROM estudiantes WHERE ya_voto = TRUE) AS bloqueado`);
        if (estado.rows[0].bloqueado) {
          throw new PadronError(409, "No se puede reemplazar el padrón después de que haya comenzado la votación.");
        }
        const previo = await client.query("SELECT COUNT(*)::int AS total FROM estudiantes");
        // No reiniciar la secuencia: los tokens del padrón anterior no deben
        // volver a identificar a otro estudiante al reutilizar identificadores.
        await client.query("DELETE FROM estudiantes");
        await client.query(`INSERT INTO estudiantes (codigo, nombre, grado, seccion)
          SELECT dni, nombre, grado, seccion
          FROM jsonb_to_recordset($1::jsonb) AS fila(dni TEXT, nombre TEXT, grado TEXT, seccion TEXT)`,
        [JSON.stringify(estudiantes)]);
        await client.query("COMMIT");
        return { total: estudiantes.length, reemplazados: previo.rows[0].total };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    },
  };
}

module.exports = { createPadronRepository };
