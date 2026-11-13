import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cambiarPassword, validarPassword } from "../src/api/seguridad.js";
const original=globalThis.fetch;
afterEach(()=>{globalThis.fetch=original;});
const formulario={actual:"Anterior-Prueba1!",nueva:"Nueva-Prueba2!",confirmar:"Nueva-Prueba2!"};

test("cambia contraseña por el endpoint existente con JWT y solo los campos permitidos",async()=>{
  globalThis.fetch=async(url,opciones)=>{
    assert.ok(url.endsWith("/api/auth/password")); assert.equal(opciones.method,"PATCH");
    assert.equal(opciones.headers.Authorization,"Bearer admin");
    assert.deepEqual(JSON.parse(opciones.body),{passwordActual:formulario.actual,passwordNueva:formulario.nueva});
    return {ok:true,status:200,json:async()=>({mensaje:"Contraseña actualizada. Inicia sesión nuevamente."})};
  };
  await cambiarPassword(formulario,"admin");
});
test("valida confirmación, contraseña distinta y límite bcrypt de 72 bytes sin enviar solicitudes",async()=>{
  globalThis.fetch=()=>assert.fail("No debe enviar solicitudes");
  for(const cambio of [{actual:""},{nueva:"corta",confirmar:"corta"},{confirmar:"Otra"},{nueva:formulario.actual,confirmar:formulario.actual},{nueva:"á".repeat(37),confirmar:"á".repeat(37)}]) {
    assert.throws(()=>validarPassword({...formulario,...cambio}));
    await assert.rejects(cambiarPassword({...formulario,...cambio},"admin"));
  }
  await assert.rejects(cambiarPassword(formulario,""),/sesión/);
});
test("rechazo o respuesta incierta nunca se anuncia como éxito ni se reintenta",async()=>{
  globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({mensaje:"La contraseña actual no es correcta o la cuenta no está activa."})});
  await assert.rejects(cambiarPassword(formulario,"admin"),/actual no es correcta/);
  let llamadas=0;
  globalThis.fetch=async()=>{llamadas++;throw new Error("red");};
  await assert.rejects(cambiarPassword(formulario,"admin"),/No se pudo confirmar/); assert.equal(llamadas,1);
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({})});
  await assert.rejects(cambiarPassword(formulario,"admin"),/verificar/);
});
