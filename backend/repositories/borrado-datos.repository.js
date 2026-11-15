const { BorradoDatosError, crearProyeccion, obtenerBloqueos } = require("../services/borrado-datos.modelo");
async function resumen(client) {
  return (await client.query(`SELECT current_database() AS nombre_base,
    (SELECT COUNT(*)::int FROM estudiantes) AS estudiantes,
    (SELECT COUNT(*)::int FROM estudiantes WHERE origen_registro='excel') AS estudiantes_importados,
    (SELECT COUNT(*)::int FROM estudiantes WHERE origen_registro='desconocido') AS estudiantes_desconocidos,
    (SELECT COUNT(*)::int FROM listas) AS listas,(SELECT COUNT(*)::int FROM candidatos) AS candidatos,
    (SELECT COUNT(*)::int FROM votos) AS votos,
    (SELECT COUNT(*)::int FROM estudiantes WHERE ya_voto=TRUE) AS estudiantes_marcados_ya_voto,
    EXISTS(SELECT 1 FROM configuracion_votacion WHERE id=1) AS configuracion_disponible,
    COALESCE((SELECT estado_votacion(c)='Abierta' FROM configuracion_votacion c WHERE id=1),FALSE) AS votacion_abierta,
    encode(sha256(convert_to(concat_ws('|',
      (SELECT string_agg(to_jsonb(e)::text,',' ORDER BY e.id) FROM estudiantes e),
      (SELECT string_agg(to_jsonb(l)::text,',' ORDER BY l.id) FROM listas l),
      (SELECT string_agg(to_jsonb(c)::text,',' ORDER BY c.id) FROM candidatos c),
      (SELECT string_agg(to_jsonb(v)::text,',' ORDER BY v.id) FROM votos v),
      (SELECT to_jsonb(c)::text FROM configuracion_votacion c WHERE id=1)), 'UTF8')), 'hex') AS huella`)).rows[0];
}
async function auditar(client, { administradorId, administradorUsuario, operacion, modo, resultado, detalle }) {
  return Number((await client.query(`INSERT INTO auditoria_borrado_datos(administrador_id,administrador_usuario,operacion,modo,resultado,detalle)
    VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING id`, [administradorId, administradorUsuario, operacion, modo, resultado, JSON.stringify(detalle)])).rows[0].id);
}
function createBorradoDatosRepository(pool) {
  return {
    obtenerResumen: () => resumen(pool),
    async listarAuditoria() {
      return (await pool.query(`SELECT id,administrador_usuario,operacion,resultado,creado_en,
        detalle->'cantidades' AS cantidades FROM auditoria_borrado_datos ORDER BY creado_en DESC,id DESC LIMIT 50`)).rows;
    },
    registrarIntento: datos => auditar(pool, datos),
    registrarSimulacion: datos => auditar(pool, { ...datos, modo: "simulacion" }),
    async ejecutar({ operacion, administrador, simulacionId, verificarPassword, exigirConfiguracion }) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // NOWAIT evita interbloqueos con voto, importación y candidaturas:
        // si hay trabajo concurrente se rechaza sin borrar parcialmente.
        await client.query("LOCK TABLE computadoras IN SHARE ROW EXCLUSIVE MODE NOWAIT");
        await client.query("SELECT id FROM computadoras ORDER BY id FOR UPDATE NOWAIT");
        await client.query("LOCK TABLE estudiantes,votos,listas,candidatos IN SHARE ROW EXCLUSIVE MODE NOWAIT");
        await client.query("SELECT id FROM configuracion_votacion WHERE id=1 FOR UPDATE NOWAIT");
        const a = (await client.query("SELECT id,usuario,password_hash,activo FROM administradores WHERE id=$1 FOR SHARE NOWAIT", [administrador.id])).rows[0];
        if (!a?.activo || !(await verificarPassword(a.password_hash))) throw new BorradoDatosError(401, "La contraseña administrativa es incorrecta o la cuenta está inactiva.");
        const r = await resumen(client);
        const permiso = exigirConfiguracion(r.nombre_base);
        if (!permiso.habilitado) throw new BorradoDatosError(403, permiso.motivo);
        const sim = (await client.query(`UPDATE auditoria_borrado_datos SET consumida_en=clock_timestamp()
          WHERE id=$1 AND administrador_id=$2 AND operacion=$3 AND modo='simulacion' AND resultado='simulado'
          AND consumida_en IS NULL AND creado_en>clock_timestamp()-interval '10 minutes' RETURNING detalle`, [simulacionId, a.id, operacion])).rows[0];
        if (sim && (sim.detalle.huellaPolitica || null) !== (permiso.huella || null)) throw new BorradoDatosError(409, "La autorización cambió. Simula de nuevo.");
        if (!sim) throw new BorradoDatosError(409, "Realiza una simulación vigente, propia y sin bloqueos antes de continuar.");
        const bloqueos = obtenerBloqueos(operacion, r);
        if (bloqueos.length) throw new BorradoDatosError(409, bloqueos.join(" "));
        if (sim.detalle.huella !== r.huella) throw new BorradoDatosError(409, "Los datos cambiaron desde la simulación. Simula de nuevo.");
        const cantidades = crearProyeccion(operacion, r);
        const borrar = async (sql, campo) => {
          const result = await client.query(sql);
          if (Number(result.rowCount) !== cantidades[campo]) throw new BorradoDatosError(409, "Las cantidades eliminadas no coinciden con la vista previa. No se guardó ningún cambio.");
        };
        const borrarVotos = ["solo_votos", "candidatos_listas", "reinicio_pruebas"].includes(operacion);
        if (borrarVotos) {
          await borrar("DELETE FROM votos", "votos");
          if (operacion !== "reinicio_pruebas") await borrar("UPDATE estudiantes SET ya_voto=FALSE WHERE ya_voto=TRUE", "marcasYaVotoRestablecidas");
        }
        if (["solo_candidatos", "candidatos_listas", "reinicio_pruebas"].includes(operacion)) await borrar("DELETE FROM candidatos", "candidatos");
        if (["solo_listas", "candidatos_listas", "reinicio_pruebas"].includes(operacion)) await borrar("DELETE FROM listas", "listas");
        if (["estudiantes", "reinicio_pruebas"].includes(operacion)) await borrar("DELETE FROM estudiantes", "estudiantes");
        if (operacion === "estudiantes_importados") await borrar("DELETE FROM estudiantes WHERE origen_registro='excel'", "estudiantes");
        // Conserva los identificadores referenciados por auditoría, pero retira
        // el padrón temporal y evita reutilizar preparaciones de otra elección.
        const vistas = await client.query("UPDATE vistas_previas_padron SET estudiantes=NULL,consumida_en=clock_timestamp() WHERE consumida_en IS NULL");
        const autorizaciones = await client.query("UPDATE autorizaciones_puesto SET revocada_en=clock_timestamp() WHERE revocada_en IS NULL AND consumida_en IS NULL");
        const vinculaciones = await client.query("UPDATE vinculaciones_puesto SET revocada_en=clock_timestamp() WHERE revocada_en IS NULL");
        await client.query(`UPDATE configuracion_votacion SET votacion_abierta=FALSE,automatica=FALSE,revision=revision+1,actualizado_en=clock_timestamp()
          ${operacion === "reinicio_pruebas" ? ",fecha_votacion=NULL,hora_inicio=NULL,hora_fin=NULL,anio_electoral=NULL" : ""} WHERE id=1`);
        const revocaciones = { autorizaciones: autorizaciones.rowCount, vinculaciones: vinculaciones.rowCount, vistasPrevias: vistas.rowCount };
        const vigente = exigirConfiguracion(r.nombre_base);
        if (!vigente.habilitado || (vigente.huella || null) !== (permiso.huella || null)) throw new BorradoDatosError(403, "La configuración de reinicio cambió durante la operación.");
        await auditar(client, { administradorId: a.id, administradorUsuario: a.usuario, operacion, modo: "eliminacion", resultado: "ejecutado",
          detalle: { autorizacion: permiso.autorizacion, cantidades, revocaciones, simulacionId, configuracion: "cerrada_sin_programacion_automatica", anterior: r.huella } });
        await client.query("COMMIT");
        return { cantidades, revocaciones };
      } catch (e) { await client.query("ROLLBACK"); throw e; }
      finally { client.release(); }
    },
  };
}
module.exports = { createBorradoDatosRepository };
