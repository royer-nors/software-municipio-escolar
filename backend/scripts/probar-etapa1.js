// Integración real opt-in: usa exclusivamente un esquema nuevo de la base de pruebas.
// No modifica cuentas, configuración ni votos de public.
const path=require("node:path");
require("dotenv").config({path:path.join(__dirname,"../.env"),quiet:true});
const {Pool}=require("pg");
const {randomUUID,randomBytes}=require("node:crypto");
const bcrypt=require("bcryptjs");
const {once}=require("node:events");
const assert=require("node:assert/strict");
const {migrar}=require("../database/migrar");
const {createApp}=require("../app");
async function main(){
  if(!process.argv.includes("--confirmar-base-pruebas")) throw new Error("Se requiere --confirmar-base-pruebas.");
  const conexion={host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:"db_municipio_escolar_pruebas"};
  const control=new Pool(conexion), esquema="prueba_etapa1_"+randomUUID().replaceAll("-","");
  let creado=false,pool,server,url;
  const secreto=randomBytes(48).toString("hex");
  const anterior=randomBytes(20).toString("base64url"), nueva=randomBytes(20).toString("base64url");
  function conectar(){return new Pool({...conexion,options:`-c search_path=${esquema},pg_catalog`});}
  async function iniciar(){server=createApp({pool,jwtSecret:secreto}).listen(0,"127.0.0.1");await once(server,"listening");url=`http://127.0.0.1:${server.address().port}/api`;}
  async function cerrar(){if(server){await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));server=null;}}
  async function api(ruta,metodo="GET",body,token){
    const r=await fetch(url+ruta,{method:metodo,headers:{"Content-Type":"application/json",...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const datos=await r.json();
    assert.equal(JSON.stringify(datos).includes(anterior),false);assert.equal(JSON.stringify(datos).includes(nueva),false);assert.equal(Object.hasOwn(datos,"password_hash"),false);
    return {status:r.status,body:datos};
  }
  try{
    assert.equal((await control.query("SELECT current_database() base")).rows[0].base,"db_municipio_escolar_pruebas");
    assert.match(esquema,/^prueba_etapa1_[a-f0-9]{32}$/);await control.query(`CREATE SCHEMA "${esquema}"`);creado=true;
    pool=conectar();assert.equal((await pool.query("SELECT current_schema() esquema")).rows[0].esquema,esquema);
    await migrar(pool);
    await pool.query("INSERT INTO administradores(usuario,password_hash) VALUES ($1,$2)",["admin-etapa1",await bcrypt.hash(anterior,4)]);
    await pool.query("INSERT INTO estudiantes(codigo,nombre) VALUES ('01234567','Estudiante aislado')");
    await iniciar();
    const login=await api("/auth/login","POST",{usuario:"admin-etapa1",password:anterior});assert.equal(login.status,200);
    const token=login.body.token;
    assert.equal((await api("/votacion/configuracion","PATCH",{votoBlancoHabilitado:false})).status,401);
    assert.equal((await api("/votacion/configuracion","PATCH",{votoBlancoHabilitado:false,revision:0},token)).status,200);
    assert.equal((await api("/votacion/configuracion")).body.votoBlancoHabilitado,false);
    await api("/votacion/configuracion","PATCH",{votacionAbierta:true},token);
    assert.equal((await api("/votacion/configuracion","PATCH",{votoBlancoHabilitado:true},token)).status,409);
    const estudiante=await api("/auth/estudiante","POST",{dni:"01234567"});assert.equal(estudiante.status,200);
    assert.equal((await api("/votacion/configuracion","PATCH",{votoBlancoHabilitado:true},estudiante.body.token)).status,401);
    assert.equal((await api("/votos","POST",{listaId:null},estudiante.body.token)).status,409);
    assert.equal((await pool.query("SELECT ya_voto FROM estudiantes")).rows[0].ya_voto,false);
    await api("/votacion/configuracion","PATCH",{votacionAbierta:false},token);
    await api("/votacion/configuracion","PATCH",{votoBlancoHabilitado:true},token);
    await api("/votacion/configuracion","PATCH",{votacionAbierta:true},token);
    assert.equal((await api("/votos","POST",{listaId:null},estudiante.body.token)).status,201);
    await api("/votacion/configuracion","PATCH",{votacionAbierta:false},token);
    await api("/votacion/configuracion","PATCH",{votoBlancoHabilitado:false},token);
    const votos=(await pool.query("SELECT * FROM votos ORDER BY id")).rows;
    assert.equal((await api("/auth/password","PATCH",{passwordActual:"incorrecta",passwordNueva:nueva},token)).status,401);
    assert.equal((await api("/auth/password","PATCH",{passwordActual:anterior,passwordNueva:anterior},token)).status,400);
    assert.equal((await api("/auth/password","PATCH",{passwordActual:anterior,passwordNueva:nueva},token)).status,200);
    assert.equal((await api("/auth/me","GET",undefined,token)).status,401);
    assert.equal((await api("/auth/login","POST",{usuario:"admin-etapa1",password:anterior})).status,401);
    const admin=(await pool.query("SELECT password_hash,version_token FROM administradores")).rows[0];
    assert.equal(await bcrypt.compare(nueva,admin.password_hash),true);assert.equal(admin.version_token,1);
    await cerrar();await pool.end();pool=conectar();await iniciar();
    const nuevoLogin=await api("/auth/login","POST",{usuario:"admin-etapa1",password:nueva});assert.equal(nuevoLogin.status,200);
    assert.equal((await api("/auth/me","GET",undefined,nuevoLogin.body.token)).status,200);
    assert.equal((await api("/votacion/configuracion")).body.votoBlancoHabilitado,false);
    assert.deepEqual((await pool.query("SELECT * FROM votos ORDER BY id")).rows,votos);
    console.log("Aprobado: persistencia tras reiniciar API y conexiones, voto en blanco, permisos, bcrypt, contraseña anterior rechazada y JWT invalidado.");
    console.log("Solo esquema efímero en db_municipio_escolar_pruebas; datos existentes de public intactos.");
  }finally{
    await cerrar();if(pool)await pool.end();
    if(creado&&/^prueba_etapa1_[a-f0-9]{32}$/.test(esquema))await control.query(`DROP SCHEMA "${esquema}" CASCADE`);
    await control.end();
  }
}
main().catch(()=>{console.error("Falló la integración aislada de etapa 1. No se muestran contraseñas ni respuestas sensibles.");process.exitCode=1;});
