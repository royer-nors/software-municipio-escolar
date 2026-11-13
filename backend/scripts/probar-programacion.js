// Prueba PostgreSQL real opt-in, aislada en un esquema nuevo de la base de pruebas.
// No modifica public ni utiliza el nombre de base del .env.
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname,"../.env"), quiet: true });
const { Pool } = require("pg");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const { migrar } = require("../database/migrar");
async function main() {
  if (!process.argv.includes("--confirmar-base-pruebas")) throw new Error("Se requiere --confirmar-base-pruebas.");
  const conexion = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432), user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: "db_municipio_escolar_pruebas" };
  const control = new Pool(conexion);
  const esquema = "prueba_horario_" + randomUUID().replaceAll("-", "");
  let pool, creado = false;
  try {
    assert.equal((await control.query("SELECT current_database() base")).rows[0].base,"db_municipio_escolar_pruebas");
    assert.match(esquema,/^prueba_horario_[a-f0-9]{32}$/);
    await control.query(`CREATE SCHEMA "${esquema}"`); creado = true;
    pool = new Pool({ ...conexion, max: 8, options: `-c search_path=${esquema} -c statement_timeout=15000 -c lock_timeout=10000` });
    assert.equal((await pool.query("SELECT current_schema() esquema")).rows[0].esquema,esquema);
    await migrar(pool);
    await pool.query("INSERT INTO listas(nombre) VALUES ('Lista aislada')");
    await pool.query("INSERT INTO estudiantes(codigo,nombre) SELECT lpad(n::text,8,'0'),'Puesto '||n FROM generate_series(1,7) n");
    await pool.query(`UPDATE configuracion_votacion SET automatica=TRUE, institucion='I.E. aislada',ubicacion='Pruebas',
      fecha_votacion=(clock_timestamp() AT TIME ZONE 'America/Lima')::date,
      anio_electoral=EXTRACT(YEAR FROM clock_timestamp() AT TIME ZONE 'America/Lima'),hora_inicio='00:00',hora_fin='24:00'`);
    await Promise.all([1,2,3,4,5].map(id => pool.query("SELECT registrar_voto($1,1)",[id])));
    const duplicados = await Promise.allSettled(Array.from({length:5},()=>pool.query("SELECT registrar_voto(6,1)")));
    assert.equal(duplicados.filter(r=>r.status==="fulfilled").length,1);
    assert.ok(duplicados.filter(r=>r.status==="rejected").every(r=>r.reason.code==="P0001"));
    console.log("Cinco conexiones simultáneas: votos únicos y protección de duplicados aprobados.");

    // Una orden de cierre retiene el bloqueo; las solicitudes esperan y ven el cierre confirmado.
    const cierre = await pool.connect();
    try {
      await cierre.query("BEGIN");
      await cierre.query("UPDATE configuracion_votacion SET automatica=FALSE,votacion_abierta=FALSE WHERE id=1");
      const pendiente = pool.query("SELECT registrar_voto(7,1)").then(()=>({ok:true}),error=>({error}));
      await cierre.query("COMMIT");
      assert.equal((await pendiente).error?.code,"V0001");
    } finally { await cierre.query("ROLLBACK"); cierre.release(); }

    // La transacción del voto empieza antes del fin pero espera una fila hasta después del fin.
    await pool.query(`UPDATE configuracion_votacion SET automatica=TRUE,
      fecha_votacion=((clock_timestamp()+interval '3 seconds') AT TIME ZONE 'America/Lima')::date,
      anio_electoral=EXTRACT(YEAR FROM (clock_timestamp()+interval '3 seconds') AT TIME ZONE 'America/Lima'),
      hora_inicio='00:00',hora_fin=((clock_timestamp()+interval '3 seconds') AT TIME ZONE 'America/Lima')::time`);
    const fila = await pool.connect(), voto = await pool.connect();
    try {
      await fila.query("BEGIN");
      await fila.query("SELECT id FROM estudiantes WHERE id=7 FOR UPDATE");
      const pendiente = voto.query("SELECT registrar_voto(7,1)").then(()=>({ok:true}),error=>({error}));
      let bloqueado = false;
      for (let i=0;i<40;i++) {
        const r = await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",[voto.processID]);
        if (r.rows[0]?.wait_event_type === "Lock") { bloqueado = true; break; }
        await new Promise(resolve=>setTimeout(resolve,25));
      }
      assert.equal(bloqueado,true,"El voto debe esperar el bloqueo de fila antes del cierre");
      await fila.query("SELECT pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM ((fecha_votacion+hora_fin) AT TIME ZONE 'America/Lima') - clock_timestamp())) + 0.15) FROM configuracion_votacion");
      await fila.query("ROLLBACK");
      assert.equal((await pendiente).error?.code,"V0001");
      assert.equal((await pool.query("SELECT ya_voto FROM estudiantes WHERE id=7")).rows[0].ya_voto,false);
    } finally { await fila.query("ROLLBACK"); fila.release(); voto.release(); }
    assert.equal((await pool.query("SELECT count(*)::int n FROM votos")).rows[0].n,6);
    console.log("Cierre concurrente y voto que esperó hasta después del fin: rechazados sin marcar ya_voto.");
    console.log("Destino: db_municipio_escolar_pruebas; únicamente esquema efímero. Tablas public intactas.");
  } finally {
    if (pool) await pool.end();
    if (creado && /^prueba_horario_[a-f0-9]{32}$/.test(esquema)) await control.query(`DROP SCHEMA "${esquema}" CASCADE`);
    await control.end();
  }
}
main().catch(error=>{ console.error(error.message); process.exitCode=1; });
