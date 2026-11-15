const { createHash, randomUUID } = require("node:crypto");
const { PadronError } = require("../errors/padron.error");
const { gradoSecundaria } = require("../services/grado-secundaria");
function planificar(actuales, estudiantes, grado, modo) {
  const actualesPorDni = new Map(actuales.map(e => [e.codigo, e]));
  const seleccionados = actuales.filter(e => gradoSecundaria(e.grado) === grado);
  const errores = [];
  const cantidades = { agregados: 0, actualizados: 0, eliminados: 0, sinCambios: 0 };
  const filas = estudiantes.map((e, i) => {
    const anterior = actualesPorDni.get(e.dni);
    if (anterior && gradoSecundaria(anterior.grado) !== grado) errores.push({ fila: e.fila || i + 2, campo: 'dni', mensaje: `El DNI ${e.dni} ya pertenece a otro grado o tiene un grado histórico sin validar.` });
    else if (anterior && modo === 'agregar') errores.push({ fila: e.fila || i + 2, campo: 'dni', mensaje: `El DNI ${e.dni} ya existe en este grado. Usa reemplazar para actualizarlo.` });
    const cambio = anterior && (anterior.nombre !== e.nombre || anterior.grado !== e.grado || anterior.seccion !== e.seccion || anterior.origen_registro !== 'excel');
    const accion = !anterior ? 'agregar' : cambio ? 'actualizar' : 'conservar';
    cantidades[!anterior ? 'agregados' : cambio ? 'actualizados' : 'sinCambios']++;
    return { ...e, accion };
  });
  if (errores.length) throw new PadronError(422, "Existen DNI en conflicto con el padrón. No se modificó ningún estudiante.", errores.slice(0, 100));
  const dnis = new Set(estudiantes.map(e => e.dni));
  const eliminados = modo === 'reemplazar' ? seleccionados.filter(e => !dnis.has(e.codigo)) : [];
  cantidades.eliminados = eliminados.length;
  return { cantidades, estudiantes: filas, eliminados: eliminados.map(e => ({ dni: e.codigo, nombre: e.nombre, grado: e.grado, seccion: e.seccion })), ids: seleccionados.map(e => e.id) };
}
function createPadronRepository(pool) {
  async function comprobarEstado(c) {
    const r = (await c.query(`SELECT estado_votacion(c)='Abierta' abierta,
      EXISTS(SELECT 1 FROM votos) OR EXISTS(SELECT 1 FROM estudiantes WHERE ya_voto) bloqueado
      FROM configuracion_votacion c WHERE id=1`)).rows[0];
    if (r.abierta) throw new PadronError(409, "Cierra la elección antes de importar estudiantes.");
    if (r.bloqueado) throw new PadronError(409, "No se puede modificar el padrón: existen votos o marcas de participación.");
  }
  async function transaccion(operacion) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      // Orden compatible con votación; NOWAIT evita esperar manteniendo
      // bloqueos que puedan interbloquearse con un puesto o el control horario.
      await c.query("LOCK TABLE estudiantes,votos IN SHARE ROW EXCLUSIVE MODE NOWAIT");
      await c.query("SELECT id FROM estudiantes ORDER BY id FOR UPDATE NOWAIT");
      const config = (await c.query("SELECT c.*,estado_votacion(c) AS estado FROM configuracion_votacion c WHERE id=1 FOR UPDATE NOWAIT")).rows[0];
      if (!config) throw new PadronError(503, "No está disponible la configuración electoral.");
      await comprobarEstado(c);
      const actuales = (await c.query("SELECT * FROM estudiantes ORDER BY id")).rows;
      const huella = createHash('sha256').update(JSON.stringify({ config, actuales })).digest('hex');
      const resultado = await operacion(c, actuales, huella);
      // El reloj puede abrir una elección sin modificar su configuración.
      await comprobarEstado(c);
      await c.query("COMMIT"); return resultado;
    } catch (e) {
      await c.query("ROLLBACK");
      if (['55P03', '40P01', '40001'].includes(e.code)) throw new PadronError(409, "Hay operaciones en curso. Espera y genera otra vista previa.");
      if (e.code === '23505') throw new PadronError(409, "El padrón cambió o existe un DNI duplicado. Genera otra vista previa.");
      throw e;
    } finally { c.release(); }
  }
  return {
    previsualizar(estudiantes, grado, modo, administrador) {
      return transaccion(async (c, actuales, huella) => {
        const plan = planificar(actuales, estudiantes, grado, modo), id = randomUUID();
        await c.query("UPDATE vistas_previas_padron SET estudiantes=NULL,consumida_en=clock_timestamp() WHERE consumida_en IS NULL AND (vence_en<=clock_timestamp() OR administrador_id=$1)", [administrador.id]);
        const r = await c.query(`INSERT INTO vistas_previas_padron(id,administrador_id,grado,modo,estudiantes,huella)
          VALUES($1,$2,$3,$4,$5::jsonb,$6) RETURNING vence_en`, [id, administrador.id, grado, modo, JSON.stringify(estudiantes), huella]);
        return { vistaPreviaId: id, grado, modo, venceEn: r.rows[0].vence_en, cantidades: plan.cantidades, estudiantes: plan.estudiantes, eliminados: plan.eliminados };
      });
    },
    confirmar(id, administrador) {
      return transaccion(async (c, actuales, huella) => {
        const vista = (await c.query(`SELECT * FROM vistas_previas_padron WHERE id=$1 AND administrador_id=$2
          AND consumida_en IS NULL AND vence_en>clock_timestamp() FOR UPDATE NOWAIT`, [id, administrador.id])).rows[0];
        if (!vista) throw new PadronError(409, "La vista previa venció, ya fue utilizada o no te pertenece. Genera otra.");
        if (vista.huella !== huella) throw new PadronError(409, "El padrón o la configuración cambiaron. Revisa una nueva vista previa.");
        const plan = planificar(actuales, vista.estudiantes, vista.grado, vista.modo);
        const json = JSON.stringify(vista.estudiantes);
        const borrados = await c.query("DELETE FROM estudiantes WHERE id=ANY($1::integer[]) AND NOT(codigo=ANY($2::text[]))", [vista.modo === 'reemplazar' ? plan.ids : [], vista.estudiantes.map(e => e.dni)]);
        const actualizados = await c.query(`UPDATE estudiantes e SET nombre=f.nombre,grado=f.grado,seccion=f.seccion,origen_registro='excel'
          FROM jsonb_to_recordset($1::jsonb) AS f(dni TEXT,nombre TEXT,grado TEXT,seccion TEXT)
          WHERE e.codigo=f.dni AND e.id=ANY($2::integer[]) AND (e.nombre,e.grado,e.seccion,e.origen_registro) IS DISTINCT FROM (f.nombre,f.grado,f.seccion,'excel')`, [json, plan.ids]);
        const agregados = await c.query(`INSERT INTO estudiantes(codigo,nombre,grado,seccion,origen_registro)
          SELECT f.dni,f.nombre,f.grado,f.seccion,'excel' FROM jsonb_to_recordset($1::jsonb) AS f(dni TEXT,nombre TEXT,grado TEXT,seccion TEXT)
          WHERE NOT EXISTS(SELECT 1 FROM estudiantes e WHERE e.codigo=f.dni)`, [json]);
        if (borrados.rowCount !== plan.cantidades.eliminados || actualizados.rowCount !== plan.cantidades.actualizados || agregados.rowCount !== plan.cantidades.agregados) throw new PadronError(409, "Las cantidades cambiaron; no se guardó la importación.");
        const consumida = await c.query("UPDATE vistas_previas_padron SET consumida_en=clock_timestamp(),estudiantes=NULL WHERE id=$1 AND vence_en>clock_timestamp()", [id]);
        if (consumida.rowCount !== 1) throw new PadronError(409, "La vista previa venció durante la importación; no se guardó ningún cambio.");
        await c.query(`INSERT INTO auditoria_importaciones_padron(administrador_id,administrador_usuario,vista_previa_id,grado,modo,cantidades)
          VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [administrador.id, administrador.usuario, id, vista.grado, vista.modo, JSON.stringify(plan.cantidades)]);
        return { grado: vista.grado, modo: vista.modo, total: vista.estudiantes.length, cantidades: plan.cantidades };
      });
    },
  };
}
module.exports = { createPadronRepository };
