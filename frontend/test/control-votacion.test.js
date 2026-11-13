import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { cambiarEstadoVotacion, guardarConfiguracionElectoral } from "../src/api/control-votacion.js";
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

test("guarda centro y programación por la misma ruta con revisión, confirmación y motivo", async () => {
  const datos = { institucion: "I.E.", ubicacion: "Abancay", anio: 2099, fecha: "2099-11-12", horaInicio: "08:00", horaFin: "15:00", automatica: true, revision: 3, confirmarCambioActivo: true, motivo: "Reprogramación acordada" };
  globalThis.fetch = async (url, opciones) => {
    assert.ok(url.endsWith("/votacion/configuracion"));
    assert.equal(opciones.headers.Authorization,"Bearer admin");
    assert.deepEqual(JSON.parse(opciones.body),datos);
    return {ok:true,json:async()=>({configuracion:{...datos,revision:4,estado:"Programada",votacionAbierta:false,votoBlancoHabilitado:true}})};
  };
  const actual = await guardarConfiguracionElectoral(datos,"admin");
  assert.equal(actual.estado,"Programada"); assert.equal(actual.revision,4);
});

test("la emergencia transmite motivo y revisión sin habilitar automáticamente el horario", async () => {
  globalThis.fetch = async (url, opciones) => {
    assert.deepEqual(JSON.parse(opciones.body),{votacionAbierta:false,revision:1,confirmarCambioActivo:true,motivo:"Emergencia"});
    return {ok:true,json:async()=>({configuracion:{automatica:false,votacionAbierta:false,votoBlancoHabilitado:true}})};
  };
  assert.equal((await cambiarEstadoVotacion(false,"admin",{revision:1,confirmarCambioActivo:true,motivo:"Emergencia"})).automatica,false);
});

test("abre y cierra por la ruta existente con JWT sin cambiar voto en blanco", async () => {
  for (const abierta of [true, false]) {
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith("/api/votacion/configuracion"));
      assert.equal(options.method, "PATCH");
      assert.equal(options.headers.Authorization, "Bearer admin");
      assert.deepEqual(JSON.parse(options.body), { votacionAbierta: abierta });
      return { ok: true, json: async () => ({ configuracion: { votacionAbierta: abierta, votoBlancoHabilitado: false } }) };
    };
    assert.equal((await cambiarEstadoVotacion(abierta, "admin")).votacionAbierta, abierta);
  }
});

test("no envía cambios sin sesión o con valores inválidos", async () => {
  globalThis.fetch = () => { assert.fail("No debe enviar una solicitud"); };
  await assert.rejects(cambiarEstadoVotacion(true, ""), /sesión/);
  await assert.rejects(cambiarEstadoVotacion("true", "admin"), /inválido/);
});

test("muestra rechazos y no reintenta ni anuncia éxito ante una respuesta incierta", async () => {
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ mensaje: "La sesión fue invalidada." }) });
  await assert.rejects(cambiarEstadoVotacion(true, "admin"), /invalidada/);
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ mensaje: "ok" }) });
  await assert.rejects(cambiarEstadoVotacion(true, "admin"), /configuración válida/);
  let llamadas = 0;
  globalThis.fetch = async () => { llamadas++; throw new Error("red"); };
  await assert.rejects(cambiarEstadoVotacion(false, "admin"), /Consultar|Consulta/);
  assert.equal(llamadas, 1);
});
