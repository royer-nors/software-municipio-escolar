const { createResultadosRepository } = require("./resultados.repository");
const { createResultadosService } = require("../services/resultados.service");
const { UsuariosError } = require("../errors/usuarios.error");
const PUBLICOS = "id,usuario,activo,actualizado_en";
function createConsultoresResultadosRepository(pool) {
  return {
    async findByUsuario(usuario) { return (await pool.query("SELECT * FROM consultores_resultados WHERE usuario=$1", [usuario])).rows[0]; },
    async findById(id) { return (await pool.query("SELECT * FROM consultores_resultados WHERE id=$1", [id])).rows[0]; },
    async listar() { return (await pool.query(`SELECT ${PUBLICOS} FROM consultores_resultados ORDER BY id`)).rows; },
    async guardar(id, datos, administradorId) {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const anterior = (await c.query("SELECT * FROM consultores_resultados WHERE id=$1 FOR UPDATE", [id])).rows[0];
        if (!anterior) throw new UsuariosError(404, "Consultor no encontrado.");
        if (datos.activo && !datos.hash && !anterior.password_hash) throw new UsuariosError(400, "Configura una contraseña para habilitar la cuenta.");
        const r = await c.query(`UPDATE consultores_resultados SET usuario=$2,activo=$3,password_hash=COALESCE($4,password_hash),
          version_token=version_token+1,actualizado_en=clock_timestamp() WHERE id=$1 RETURNING ${PUBLICOS}`,
        [id, datos.usuario, datos.activo, datos.hash || null]);
        await c.query("INSERT INTO auditoria_consultores_resultados(administrador_id,consultor_id,accion) VALUES($1,$2,$3)",
          [administradorId, id, datos.activo ? "actualizar_habilitar" : "actualizar_deshabilitar"]);
        await c.query("COMMIT"); return r.rows[0];
      } catch (e) {
        await c.query("ROLLBACK");
        if (e.code === "23505") throw new UsuariosError(409, "Ese usuario ya está asignado a otro consultor.");
        throw e;
      } finally { c.release(); }
    },
    async consultarResultados() {
      const c = await pool.connect();
      try {
        // Estado y conteos pertenecen a una misma instantánea: una nueva
        // programación/reapertura concurrente no filtra sus votos parciales.
        await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
        const estado = (await c.query(`SELECT automatica AND estado_votacion(c)='Finalizada' AS publicada
          FROM configuracion_votacion c WHERE id=1`)).rows[0];
        if (!estado?.publicada) { await c.query("COMMIT"); return null; }
        const resultado = await createResultadosService(createResultadosRepository(c)).obtenerResultados();
        await c.query("COMMIT"); return resultado;
      } catch (e) { await c.query("ROLLBACK"); throw e; }
      finally { c.release(); }
    },
  };
}
module.exports = { createConsultoresResultadosRepository };
