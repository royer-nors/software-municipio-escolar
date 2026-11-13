// PostgreSQL real: esquema efímero en base fija de pruebas, reloj SQL controlado.
// No modifica public, las credenciales ni la hora del servidor.
const path = require("node:path");
require("dotenv").config({path:path.join(__dirname,"../.env"),quiet:true});
const {Pool}=require("pg");
const {randomUUID}=require("node:crypto");
const assert=require("node:assert/strict");
const {migrar}=require("../database/migrar");
async function main() {
  if(!process.argv.includes("--confirmar-base-pruebas")) throw new Error("Se requiere --confirmar-base-pruebas.");
  const conexion={host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:"db_municipio_escolar_pruebas"};
  const control=new Pool(conexion), esquema="prueba_reloj_"+randomUUID().replaceAll("-","");
  let pool,creado=false;
  try {
    assert.equal((await control.query("SELECT current_database() base")).rows[0].base,"db_municipio_escolar_pruebas");
    assert.match(esquema,/^prueba_reloj_[a-f0-9]{32}$/);
    await control.query(`CREATE SCHEMA "${esquema}"`); creado=true;
    pool=new Pool({...conexion,max:8,options:`-c search_path=${esquema},pg_catalog -c statement_timeout=15000`});
    await pool.query(`CREATE TABLE instante(valor timestamptz NOT NULL);
      INSERT INTO instante VALUES ('2032-05-18T07:12:00-05:00');
      CREATE FUNCTION clock_timestamp() RETURNS timestamptz LANGUAGE sql VOLATILE
      AS 'SELECT valor FROM ${esquema}.instante';`);
    await migrar(pool);
    await pool.query(`INSERT INTO listas(nombre) VALUES ('Lista aislada');
      INSERT INTO estudiantes(codigo,nombre) SELECT lpad(n::text,8,'0'),'Estudiante '||n FROM generate_series(1,6) n;
      UPDATE configuracion_votacion SET institucion='Pruebas',ubicacion='Abancay',automatica=TRUE,
      anio_electoral=2032,fecha_votacion='2032-05-18',hora_inicio='07:13',hora_fin='10:47'`);
    assert.equal((await pool.query("SELECT estado_votacion(c) estado FROM configuracion_votacion c")).rows[0].estado,"Programada");
    await assert.rejects(pool.query("SELECT registrar_voto(6,1)"),{code:"V0001"});
    await pool.query("UPDATE instante SET valor='2032-05-18T07:13:00-05:00'");
    assert.equal((await pool.query("SELECT estado_votacion(c) estado FROM configuracion_votacion c")).rows[0].estado,"Abierta");
    // Mantiene cinco conexiones distintas y comprueba sus PID antes de enviar votos.
    const puestos=await Promise.all(Array.from({length:5},()=>pool.connect()));
    try {
      assert.equal(new Set(puestos.map(p=>p.processID)).size,5);
      await Promise.all(puestos.map((puesto,i)=>puesto.query("SELECT registrar_voto($1,1)",[i+1])));
    } finally { puestos.forEach(p=>p.release()); }
    assert.equal((await pool.query("SELECT count(*)::int n FROM votos")).rows[0].n,5);
    await pool.query("UPDATE instante SET valor='2032-05-18T10:47:00-05:00'");
    assert.equal((await pool.query("SELECT estado_votacion(c) estado FROM configuracion_votacion c")).rows[0].estado,"Finalizada");
    await assert.rejects(pool.query("SELECT registrar_voto(6,1)"),{code:"V0001"});
    assert.equal((await pool.query("SELECT ya_voto FROM estudiantes WHERE id=6")).rows[0].ya_voto,false);
    assert.equal((await pool.query("SELECT count(*)::int n FROM votos")).rows[0].n,5);
    console.log("Aprobado: reloj controlado, apertura exacta, cinco conexiones distintas votando simultáneamente y cierre exacto.");
    console.log("Único destino: esquema efímero de db_municipio_escolar_pruebas. Ningún cambio en public ni esperas para alcanzar el horario.");
  } finally {
    if(pool) await pool.end();
    if(creado && /^prueba_reloj_[a-f0-9]{32}$/.test(esquema)) await control.query(`DROP SCHEMA "${esquema}" CASCADE`);
    await control.end();
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
