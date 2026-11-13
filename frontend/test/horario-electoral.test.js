import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaIsoDesdeTexto, fechaTextoDesdeIso, describirHorario } from "../src/utils/horario-electoral.js";
import { guardarConfiguracionElectoral } from "../src/api/control-votacion.js";

test("12/11/2026 es 12 de noviembre y 11/12/2026 es 11 de diciembre, sin heurísticas regionales", () => {
  assert.equal(fechaIsoDesdeTexto("12/11/2026"),"2026-11-12");
  assert.equal(fechaIsoDesdeTexto("11/12/2026"),"2026-12-11");
  assert.equal(fechaTextoDesdeIso("2026-12-11"),"11/12/2026");
  assert.equal(fechaTextoDesdeIso("2026-11-12"),"12/11/2026");
});

test("rechaza fechas inexistentes, formato americano sin ceros e instantes UTC en el campo de fecha civil", () => {
  for(const fecha of ["31/11/2026","29/02/2026","12/31/2026","1/2/2026","2026-11-12","12/11/2026T00:00Z",""]) assert.equal(fechaIsoDesdeTexto(fecha),"");
  assert.equal(fechaIsoDesdeTexto("29/02/2028"),"2028-02-29");
});

test("el resumen identifica el mes en letras y las horas 22:00 a 23:00 sin desplazarlas a UTC", () => {
  const horario = describirHorario({fecha:"2026-11-12",horaInicio:"22:00",horaFin:"23:00"});
  assert.match(horario,/12 de noviembre de 2026/);
  assert.match(horario,/22:00 a 23:00/); assert.match(horario,/America\/Lima/);
  assert.match(describirHorario({fecha:"2026-12-11"}),/11 de diciembre/);
});

test("el transporte conserva ISO civil y 22:00/23:00 del control time aunque visualmente muestre AM o PM", async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async (url,opciones)=>{
    const body=JSON.parse(opciones.body);
    assert.equal(body.fecha,"2026-11-12"); assert.equal(body.horaInicio,"22:00"); assert.equal(body.horaFin,"23:00");
    return {ok:true,json:async()=>({configuracion:{...body,votacionAbierta:false,votoBlancoHabilitado:true}})};
  };
  try { await guardarConfiguracionElectoral({fecha:fechaIsoDesdeTexto("12/11/2026"),horaInicio:"22:00",horaFin:"23:00"},"admin"); }
  finally { globalThis.fetch=original; }
});

test("el transporte admite mañana, tarde y noche sin horas predeterminadas ni conversión de zona", async () => {
  const original=globalThis.fetch;
  try {
    for(const [fecha,inicio,fin] of [["18/05/2032","07:13","10:47"],["31/12/2035","13:25","17:42"],["29/02/2036","21:17","23:51"]]) {
      globalThis.fetch=async(url,opciones)=>{
        const body=JSON.parse(opciones.body);
        assert.equal(body.fecha,fechaIsoDesdeTexto(fecha)); assert.equal(body.horaInicio,inicio); assert.equal(body.horaFin,fin);
        return {ok:true,json:async()=>({configuracion:{...body,votacionAbierta:false,votoBlancoHabilitado:true}})};
      };
      const config=await guardarConfiguracionElectoral({fecha:fechaIsoDesdeTexto(fecha),horaInicio:inicio,horaFin:fin},"admin");
      assert.ok(describirHorario(config).includes(`${inicio} a ${fin}`));
    }
  } finally {globalThis.fetch=original;}
});
