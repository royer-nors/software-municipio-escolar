const { UsuariosError } = require("../errors/usuarios.error");
const CONSULTA = `SELECT c.*, to_char(fecha_votacion, 'YYYY-MM-DD') AS fecha,
  estado_votacion(c) AS estado FROM configuracion_votacion c WHERE id = 1`;
function presentar(row) {
  if (!row) return null;
  return {
    votacionAbierta: row.estado === "Abierta", votoBlancoHabilitado: row.voto_blanco_habilitado,
    actualizadoEn: row.actualizado_en, estado: row.estado, automatica: row.automatica,
    institucion: row.institucion, ubicacion: row.ubicacion, anio: row.anio_electoral,
    fecha: row.fecha, horaInicio: row.hora_inicio?.slice(0, 5) ?? null,
    horaFin: row.hora_fin?.slice(0, 5) ?? null, revision: row.revision, zonaHoraria: "America/Lima",
  };
}
function createVotacionConfiguracionRepository(pool) {
  return {
    async obtener() {
      return presentar((await pool.query(CONSULTA)).rows[0]);
    },

    async actualizar(datos, administrador) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const anterior = (await client.query("SELECT * FROM configuracion_votacion WHERE id = 1 FOR UPDATE")).rows[0];
        if (!anterior) throw new UsuariosError(503, "La configuración no está disponible.");
        if (datos.revision !== undefined && datos.revision !== anterior.revision) throw new UsuariosError(409, "Otro administrador modificó la configuración. Vuelve a abrir la ventana para consultar los datos actuales.");
        const estado = (await client.query(CONSULTA)).rows[0].estado;
        const programa = Object.hasOwn(datos, "institucion");
        const emergencia = Object.hasOwn(datos, "votacionAbierta");
        if (Object.hasOwn(datos, "votoBlancoHabilitado") && datos.votoBlancoHabilitado !== anterior.voto_blanco_habilitado && estado === "Abierta") {
          throw new UsuariosError(409, "No se puede cambiar el voto en blanco mientras la votación está abierta.");
        }
        if ((programa && estado === "Abierta") || (emergencia && anterior.automatica)) {
          if (datos.confirmarCambioActivo !== true || !datos.motivo?.trim()) throw new UsuariosError(409, "Confirma el cambio y escribe un motivo: afecta una elección activa o reemplaza el horario automático.");
        }
        const campos = { votacionAbierta: "votacion_abierta", votoBlancoHabilitado: "voto_blanco_habilitado",
          institucion: "institucion", ubicacion: "ubicacion", anio: "anio_electoral", fecha: "fecha_votacion",
          horaInicio: "hora_inicio", horaFin: "hora_fin", automatica: "automatica" };
        const entradas = Object.entries(campos).filter(([key]) => Object.hasOwn(datos, key));
        const sets = entradas.map(([, col], i) => `${col} = $${i + 1}`);
        if (emergencia) sets.push("automatica = FALSE");
        if (programa && !datos.automatica) sets.push(`votacion_abierta = ${estado === "Abierta" ? "TRUE" : "FALSE"}`);
        await client.query(`UPDATE configuracion_votacion SET ${sets.join(", ")}, actualizado_en = clock_timestamp(), revision = revision + 1 WHERE id = 1`, entradas.map(([key]) => datos[key]));
        const nueva = (await client.query("SELECT * FROM configuracion_votacion WHERE id = 1")).rows[0];
        await client.query(`INSERT INTO auditoria_configuracion_electoral
          (administrador_id, administrador_usuario, motivo, anterior, nueva) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)`,
        [administrador.id, administrador.usuario, datos.motivo?.trim() || "Actualización de configuración electoral", JSON.stringify(anterior), JSON.stringify(nueva)]);
        const resultado = presentar((await client.query(CONSULTA)).rows[0]);
        await client.query("COMMIT");
        return resultado;
      } catch (e) { await client.query("ROLLBACK"); throw e; }
      finally { client.release(); }
    },
  };
}

module.exports = { createVotacionConfiguracionRepository };
