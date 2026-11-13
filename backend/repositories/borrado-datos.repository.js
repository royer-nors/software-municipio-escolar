function createBorradoDatosRepository(pool) {
  return {
    async registrarIntento({ administradorId = null, administradorUsuario = "(sin autenticar)", operacion = null, modo, resultado, detalle }) {
      const result = await pool.query(`
        INSERT INTO auditoria_borrado_datos
          (administrador_id, administrador_usuario, operacion, modo, resultado, detalle)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id
      `, [administradorId, administradorUsuario, operacion, modo, resultado, JSON.stringify(detalle)]);
      return Number(result.rows[0].id);
    },

    async obtenerResumen() {
      const result = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM estudiantes) AS estudiantes,
          (SELECT COUNT(*)::int FROM listas) AS listas,
          (SELECT COUNT(*)::int FROM candidatos) AS candidatos,
          (SELECT COUNT(*)::int FROM votos) AS votos,
          (SELECT COUNT(*)::int FROM estudiantes WHERE ya_voto = TRUE) AS estudiantes_marcados_ya_voto,
          EXISTS (SELECT 1 FROM configuracion_votacion WHERE id = 1) AS configuracion_disponible,
          COALESCE((SELECT votacion_abierta FROM configuracion_votacion WHERE id = 1), FALSE) AS votacion_abierta,
          EXISTS (SELECT 1 FROM votos) AS votos_registrados,
          EXISTS (SELECT 1 FROM estudiantes WHERE ya_voto = TRUE) AS estudiantes_ya_votaron
      `);
      return result.rows[0];
    },

    async registrarSimulacion({ administradorId, administradorUsuario, operacion, resultado, detalle }) {
      const result = await pool.query(`
        INSERT INTO auditoria_borrado_datos
          (administrador_id, administrador_usuario, operacion, modo, resultado, detalle)
        VALUES ($1, $2, $3, 'simulacion', $4, $5::jsonb) RETURNING id
      `, [administradorId, administradorUsuario, operacion, resultado, JSON.stringify(detalle)]);
      return Number(result.rows[0].id);
    },

    async obtenerSimulacion(id, administradorId, operacion) {
      const result = await pool.query(`
        SELECT id, administrador_id, operacion, resultado, detalle
        FROM auditoria_borrado_datos
        WHERE id = $1 AND administrador_id = $2 AND operacion = $3 AND modo = 'simulacion'
          AND consumida_en IS NULL AND creado_en > NOW() - INTERVAL '10 minutes'
      `, [id, administradorId, operacion]);
      return result.rows[0] ?? null;
    },

    async consumirSimulacion(id, administradorId, operacion) {
      const result = await pool.query(`
        UPDATE auditoria_borrado_datos
        SET consumida_en = NOW()
        WHERE id = $1 AND administrador_id = $2 AND operacion = $3 AND modo = 'simulacion'
          AND consumida_en IS NULL AND creado_en > NOW() - INTERVAL '10 minutes'
        RETURNING id, administrador_id, operacion, resultado, detalle
      `, [id, administradorId, operacion]);
      return result.rows[0] ?? null;
    },

    async ejecutar({ operacion, excepcion = false, exigirConfiguracion, proyeccionEsperada }) {
      const client = await pool.connect();
      const cantidades = { estudiantes: 0, listas: 0, candidatos: 0, votos: 0, marcasYaVotoRestablecidas: 0 };
      let transaccionIniciada = false;
      try {
        await client.query("BEGIN");
        transaccionIniciada = true;
        const config = await client.query("SELECT id, votacion_abierta FROM configuracion_votacion WHERE id = 1 FOR UPDATE");
        if (!config.rows.length) throw Object.assign(new Error("La configuración de votación no está disponible."), { bloqueo: true });
        const nombre = (await client.query("SELECT current_database() AS nombre")).rows[0].nombre;
        if (!exigirConfiguracion(nombre)) throw Object.assign(new Error("La eliminación real solo está habilitada para la base de pruebas configurada."), { bloqueo: true });
        if (config.rows[0].votacion_abierta && !excepcion) throw Object.assign(new Error("La elección está abierta."), { bloqueo: true });
        if (!excepcion) {
          const bloqueos = await client.query(`
            SELECT EXISTS (SELECT 1 FROM votos) AS votos,
                   EXISTS (SELECT 1 FROM estudiantes WHERE ya_voto = TRUE) AS ya_voto
          `);
          if (bloqueos.rows[0].votos) throw Object.assign(new Error("Hay votos registrados."), { bloqueo: true });
          if (bloqueos.rows[0].ya_voto) throw Object.assign(new Error("Hay estudiantes marcados como votantes."), { bloqueo: true });
        }
        const conteos = (await client.query(`
          SELECT (SELECT COUNT(*)::int FROM estudiantes) AS estudiantes,
                 (SELECT COUNT(*)::int FROM listas) AS listas,
                 (SELECT COUNT(*)::int FROM candidatos) AS candidatos,
                 (SELECT COUNT(*)::int FROM votos) AS votos,
                 (SELECT COUNT(*)::int FROM estudiantes WHERE ya_voto = TRUE) AS marcas
        `)).rows[0];
        const cero = { estudiantes: 0, listas: 0, candidatos: 0, votos: 0, marcasYaVotoRestablecidas: 0 };
        const actual = operacion === "solo_votos"
          ? { ...cero, votos: conteos.votos, marcasYaVotoRestablecidas: conteos.marcas }
          : operacion === "candidatos_listas"
            ? { ...cero, listas: conteos.listas, candidatos: conteos.candidatos, votos: conteos.votos, marcasYaVotoRestablecidas: conteos.marcas }
            : operacion === "estudiantes"
              ? { ...cero, estudiantes: conteos.estudiantes }
              : { ...cero, estudiantes: conteos.estudiantes, listas: conteos.listas, candidatos: conteos.candidatos, votos: conteos.votos };
        const campos = ["estudiantes", "listas", "candidatos", "votos", "marcasYaVotoRestablecidas"];
        if (campos.some(campo => Number(actual[campo]) !== Number(proyeccionEsperada?.[campo]))) {
          throw Object.assign(new Error("Los datos cambiaron desde la simulación. Simula de nuevo."), { codigo: "simulacion_obsoleta" });
        }
        const borrar = async (sql, key) => {
          const result = await client.query(sql);
          cantidades[key] = Number(result.rowCount);
        };
        if (excepcion || operacion === "solo_votos" || operacion === "candidatos_listas") {
          await borrar("DELETE FROM votos", "votos");
          const marcas = await client.query("UPDATE estudiantes SET ya_voto = FALSE WHERE ya_voto = TRUE");
          cantidades.marcasYaVotoRestablecidas = Number(marcas.rowCount);
        }
        if (excepcion || operacion === "candidatos_listas") {
          await borrar("DELETE FROM candidatos", "candidatos");
          await borrar("DELETE FROM listas", "listas");
        }
        if (excepcion || operacion === "estudiantes") await borrar("DELETE FROM estudiantes", "estudiantes");
        await client.query("COMMIT");
        transaccionIniciada = false;
        return { cantidades, nombreBase: nombre };
      } catch (error) {
        if (transaccionIniciada) {
          try { await client.query("ROLLBACK"); } catch { /* Preserva el error que provocó el rollback. */ }
        }
        throw error;
      } finally { client.release(); }
    },
  };
}

module.exports = { createBorradoDatosRepository };
