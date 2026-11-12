const { UsuariosError } = require("../errors/usuarios.error");

function createCandidaturasRepository(pool) {
  return {
    async crear(datos) {
      const client = await pool.connect();
      let confirmando = false;
      try {
        await client.query("BEGIN");
        // Mismo orden que padrón; excluye el primer voto concurrente.
        await client.query("LOCK TABLE estudiantes, votos, listas, candidatos IN SHARE ROW EXCLUSIVE MODE");
        const configuracion = (await client.query("SELECT votacion_abierta FROM configuracion_votacion WHERE id = 1 FOR SHARE")).rows[0];
        const estado = (await client.query(`SELECT EXISTS (SELECT 1 FROM votos) OR
          EXISTS (SELECT 1 FROM estudiantes WHERE ya_voto = TRUE) AS iniciado`)).rows[0];
        if (!configuracion) throw new UsuariosError(503, "La configuración electoral no está disponible.");
        if (configuracion.votacion_abierta || estado.iniciado) throw new UsuariosError(409, "Registra listas antes de abrir la votación y antes del primer voto.");
        const lista = (await client.query(`INSERT INTO listas (numero, nombre, propuestas, logo_url)
          VALUES ($1, $2, $3, $4) RETURNING id, numero, nombre, propuestas, logo_url`,
        [datos.numero, datos.nombre, datos.propuestas, datos.logoUrl])).rows[0];
        const candidato = (await client.query(`INSERT INTO candidatos (nombre, lista_id, cargo, foto_url)
          VALUES ($1, $2, 'Alcalde escolar', $3) RETURNING id, nombre, cargo, foto_url`,
        [datos.candidato, lista.id, datos.fotoUrl])).rows[0];
        confirmando = true;
        await client.query("COMMIT");
        return { lista: { ...lista, candidatos: [candidato] } };
      } catch (error) {
        if (confirmando) error.conservarImagenes = true;
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
      finally { client.release(); }
    },
  };
}
module.exports = { createCandidaturasRepository };
