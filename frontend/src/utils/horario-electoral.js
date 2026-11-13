// La fecha electoral es una fecha civil, no un instante UTC del navegador.
export function fechaIsoDesdeTexto(texto) {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto || "");
  if (!partes) return "";
  const [, dia, mes, anio] = partes;
  const iso = `${anio}-${mes}-${dia}`;
  const fecha = new Date(Date.UTC(Number(anio), Number(mes) - 1, Number(dia)));
  return Number(anio) >= 2000 && Number(anio) <= 2100 && fecha.toISOString().slice(0, 10) === iso ? iso : "";
}

export function fechaTextoDesdeIso(iso) {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!partes) return "";
  const texto = `${partes[3]}/${partes[2]}/${partes[1]}`;
  return fechaIsoDesdeTexto(texto) === iso ? texto : "";
}

export function describirHorario({ fecha, horaInicio, horaFin } = {}) {
  const texto = fechaTextoDesdeIso(fecha);
  if (!texto) return "Fecha electoral sin configurar";
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [anio, mes, dia] = fecha.split("-");
  return `${Number(dia)} de ${meses[Number(mes) - 1]} de ${anio} (${texto}) · ${horaInicio || "--:--"} a ${horaFin || "--:--"} · America/Lima (horas de 00 a 23)`;
}
