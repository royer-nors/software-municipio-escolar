import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { registrarCandidatura, validarImagen } from "../src/api/candidaturas.js";
import { urlImagen, esperarImagenes } from "../src/utils/imagenes.js";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
test("valida formato y tamaño de las imágenes seleccionadas", () => {
  assert.throws(() => validarImagen(new File(["x"],"foto.svg",{type:"image/svg+xml"})));
  assert.throws(() => validarImagen({name:"foto.png",type:"image/png",size:2*1024*1024+1}));
  assert.doesNotThrow(() => validarImagen(new File(["png de transporte"],"foto.PNG",{type:"image/png"})));
});
test("envía logo y fotografía como archivos distintos con el token administrativo", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/api/candidaturas"));
    assert.deepEqual(opciones.headers, { Authorization: "Bearer admin" });
    assert.equal(opciones.body.get("logo").name,"logo.png");
    assert.equal(opciones.body.get("foto").name,"foto.jpg");
    assert.equal(opciones.body.get("numeroLista"),"7");
    return {ok:true,status:201,json:async()=>({lista:{id:1,candidatos:[{id:1}]}})};
  };
  await registrarCandidatura({numeroLista:"7",nombreLista:"Lista",candidatoAlcalde:"Candidata"},
    new File(["logo"],"logo.png",{type:"image/png"}),new File(["foto"],"foto.jpg",{type:"image/jpeg"}),"admin");
});
test("no anuncia éxito si el servidor rechaza el registro", async () => {
  globalThis.fetch = async () => ({ok:false,status:409,json:async()=>({mensaje:"Número duplicado"})});
  await assert.rejects(registrarCandidatura({},null,null,"admin"), /Número duplicado/);
});
test("las imágenes relativas se resuelven contra el backend, no contra Vite", () => {
  assert.equal(urlImagen("/api/archivos/test.webp"),"http://localhost:3000/api/archivos/test.webp");
  assert.equal(urlImagen("javascript:alert(1)"),"");
  assert.equal(urlImagen("data:image/png;base64,xxx"),"");
});
test("la impresión espera imágenes cargadas y rechaza imágenes rotas", async () => {
  await esperarImagenes({querySelectorAll:()=>[{complete:true,naturalWidth:100}]});
  await assert.rejects(esperarImagenes({querySelectorAll:()=>[{complete:true,naturalWidth:0,decode:async()=>{throw new Error("Rota")}}]}), /No se puede imprimir/);
});
