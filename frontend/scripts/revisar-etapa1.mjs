// Revisión DOM aislada de la etapa 1: todas las API se interceptan; ningún backend real.
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const raiz=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const carpeta=await mkdtemp(path.join(tmpdir(),"municipio-etapa1-"));
const origen="http://127.0.0.1:4181";
const servidor=spawn(process.execPath,[path.join(raiz,"node_modules/vite/bin/vite.js"),"preview","--host","127.0.0.1","--port","4181","--strictPort"],{cwd:raiz,windowsHide:true,stdio:"ignore"});
let chrome,socket,sesion,secuencia=0;
const pendientes=new Map();
const dormir=ms=>new Promise(r=>setTimeout(r,ms));
const configuracion={votacionAbierta:false,votoBlancoHabilitado:true,automatica:false,revision:0,estado:"Cerrada"};
let blancos=0,passwords=0;
function enviar(method,params={},sessionId=sesion){return new Promise((resolve,reject)=>{
  const id=++secuencia;const timer=setTimeout(()=>{pendientes.delete(id);reject(new Error("Tiempo agotado: "+method));},15000);
  pendientes.set(id,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});
  socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
});}
async function evaluar(expression){const r=await enviar("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error("Falló una comprobación DOM");return r.result.value;}
async function esperar(expression){for(let i=0;i<180;i++){if(await evaluar(expression))return;await dormir(50);}throw new Error("No se cumplió una condición de la etapa 1: "+expression);}
const click=texto=>evaluar(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(texto)})?.click()`);
async function escribir(id,valor){await evaluar(`(()=>{const el=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(valor)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`);}
async function abrir(texto,titulo){await evaluar(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(texto)})).click()`);await esperar(`Boolean(document.getElementById(${JSON.stringify(titulo)}))`);}
try{
  for(let i=0;;i++){try{if((await fetch(origen)).ok)break;}catch{}if(i===100)throw new Error("No inició preview");await dormir(100);}
  chrome=spawn(process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",["--headless=new","--disable-gpu","--no-first-run","--no-default-browser-check","--remote-debugging-port=0","--user-data-dir="+path.join(carpeta,"perfil"),"about:blank"],{windowsHide:true,stdio:["ignore","ignore","pipe"]});
  const ws=await new Promise((resolve,reject)=>{let salida="";chrome.stderr.on("data",d=>{salida+=d;const m=/DevTools listening on (ws:\/\/[^\s]+)/.exec(salida);if(m)resolve(m[1]);});chrome.on("error",reject);chrome.on("exit",()=>reject(new Error("Chrome terminó antes de iniciar")));});
  socket=new WebSocket(ws);await new Promise((resolve,reject)=>{socket.addEventListener("open",resolve,{once:true});socket.addEventListener("error",reject,{once:true});});
  socket.addEventListener("message",({data})=>{const msg=JSON.parse(data);if(msg.id){const p=pendientes.get(msg.id);if(p){pendientes.delete(msg.id);if(msg.error)p.reject(new Error(msg.error.message));else p.resolve(msg.result);}}else if(msg.method==="Fetch.requestPaused") interceptar(msg.params).catch(()=>{process.exitCode=1;});});
  const target=await enviar("Target.createTarget",{url:"about:blank"});sesion=(await enviar("Target.attachToTarget",{targetId:target.targetId,flatten:true})).sessionId;
  async function interceptar({requestId,request}){
    const url=new URL(request.url);
    if(url.origin===origen&&!url.pathname.startsWith("/api/")){await enviar("Fetch.continueRequest",{requestId});return;}
    if(request.method==="OPTIONS"){await enviar("Fetch.fulfillRequest",{requestId,responseCode:204,responseHeaders:[{name:"Access-Control-Allow-Origin",value:"*"},{name:"Access-Control-Allow-Headers",value:"authorization,content-type"},{name:"Access-Control-Allow-Methods",value:"GET,POST,PATCH,OPTIONS"}]});return;}
    let status=200,datos;
    const body=request.postData?JSON.parse(request.postData):{};
    if(url.pathname.endsWith("/auth/login"))datos={token:"admin-aislado",administrador:{id:1,usuario:"admin"}};
    else if(url.pathname.endsWith("/auth/me"))datos={administrador:{id:1,usuario:"admin"}};
    else if(url.pathname.endsWith("/votacion/configuracion")){
      if(request.method==="PATCH"){
        assert.equal(Object.entries(request.headers).find(([k])=>k.toLowerCase()==="authorization")?.[1],"Bearer admin-aislado");
        assert.deepEqual(Object.keys(body).sort(),["revision","votoBlancoHabilitado"]);blancos++;
        configuracion.votoBlancoHabilitado=body.votoBlancoHabilitado;configuracion.revision++;
        datos={configuracion};
      }else datos=configuracion;
    }else if(url.pathname.endsWith("/auth/password")){
      passwords++;await dormir(100);
      assert.deepEqual(Object.keys(body).sort(),["passwordActual","passwordNueva"]);
      if(body.passwordActual!=="ClaveAnteriorPrueba!"){status=401;datos={mensaje:"La contraseña actual no es correcta o la cuenta no está activa."};}
      else datos={mensaje:"Contraseña actualizada. Inicia sesión nuevamente."};
    }else{await enviar("Fetch.failRequest",{requestId,errorReason:"BlockedByClient"});return;}
    await enviar("Fetch.fulfillRequest",{requestId,responseCode:status,responseHeaders:[{name:"Content-Type",value:"application/json"},{name:"Access-Control-Allow-Origin",value:"*"}],body:Buffer.from(JSON.stringify(datos)).toString("base64")});
  }
  await enviar("Fetch.enable",{patterns:[{urlPattern:"*"}]});await enviar("Page.enable");await enviar("Page.navigate",{url:origen});
  await esperar("Boolean(document.querySelector('.bv-opcion-administrador'))");await evaluar("document.querySelector('.bv-opcion-administrador').click()");
  await esperar("Boolean(document.getElementById('usuario'))");await escribir("usuario","admin");await escribir("password","ClaveAnteriorPrueba!");
  await evaluar("document.querySelector('form').requestSubmit()");await esperar("document.body.innerText.includes('Configurar Sistema de Votación')");
  await abrir("Configurar voto en blanco","titulo-voto-blanco");await esperar("Boolean(document.querySelector('[name=votoBlanco]:checked')) && !document.querySelector('[name=votoBlanco]').closest('fieldset').disabled");
  assert.equal(await evaluar("document.querySelectorAll('[name=votoBlanco]')[0].checked"),true);
  await evaluar("document.querySelectorAll('[name=votoBlanco]')[1].click();document.querySelector('[aria-labelledby=\"titulo-voto-blanco\"] form').requestSubmit();document.querySelector('[aria-labelledby=\"titulo-voto-blanco\"] form').requestSubmit()");
  await esperar("document.body.innerText.includes('Configuración guardada: voto en blanco deshabilitado')");assert.equal(blancos,1);
  await evaluar("document.querySelector('[aria-label=Cerrar]').click()");await abrir("Configurar voto en blanco","titulo-voto-blanco");
  await esperar("document.querySelectorAll('[name=votoBlanco]')[1]?.checked===true && !document.querySelector('[name=votoBlanco]').closest('fieldset').disabled");
  await click("Cancelar");assert.equal(blancos,1);
  configuracion.votacionAbierta=true;
  await abrir("Configurar voto en blanco","titulo-voto-blanco");await esperar("document.body.innerText.includes('solo se puede modificar fuera')");
  assert.equal(await evaluar("document.querySelector('[name=votoBlanco]').disabled"),true);
  await evaluar("document.querySelector('[aria-label=Cerrar]').click()");
  await abrir("Seguridad","titulo-seguridad");
  for(const nombre of ["actual","nueva","confirmar"]){
    assert.equal(await evaluar(`document.getElementById('seguridad-${nombre}').type`),"password");
    await evaluar(`document.querySelector('[aria-controls=seguridad-${nombre}]').click()`);
    assert.equal(await evaluar(`document.getElementById('seguridad-${nombre}').type`),"text");
    assert.equal(await evaluar("document.querySelectorAll('[id^=seguridad-][type=text]').length"),1);
    await evaluar(`document.querySelector('[aria-controls=seguridad-${nombre}]').click()`);
  }
  assert.equal(passwords,0);await click("Cancelar");await abrir("Seguridad","titulo-seguridad");
  await escribir("seguridad-actual","IncorrectaPrueba!");await escribir("seguridad-nueva","ClaveNuevaPrueba!");await escribir("seguridad-confirmar","DistintaPrueba!");
  await evaluar("document.querySelector('[aria-labelledby=\"titulo-seguridad\"] form').requestSubmit()");await esperar("document.body.innerText.includes('no coinciden')");assert.equal(passwords,0);
  await escribir("seguridad-confirmar","ClaveNuevaPrueba!");await evaluar("document.querySelector('[aria-labelledby=\"titulo-seguridad\"] form').requestSubmit()");
  await esperar("document.body.innerText.includes('actual no es correcta')");assert.equal(passwords,1);
  await escribir("seguridad-actual","ClaveAnteriorPrueba!");await evaluar("const f=document.querySelector('[aria-labelledby=\"titulo-seguridad\"] form');f.requestSubmit();f.requestSubmit()");
  await esperar("Boolean(document.getElementById('usuario')) && document.body.innerText.includes('Contraseña actualizada')");
  assert.equal(passwords,2);assert.equal(await evaluar("sessionStorage.getItem('admin_token')"),null);
  console.log("Etapa 1 aprobada: carga y recuperación de voto en blanco, bloqueo abierto, tres botones mostrar/ocultar, cancelación, validaciones, doble envío y cierre de sesión tras cambiar contraseña.");
  console.log("Todas las API interceptadas; ninguna modificación de datos ni contraseñas reales.");
}finally{if(socket?.readyState===WebSocket.OPEN)socket.close();chrome?.kill();servidor.kill();}
