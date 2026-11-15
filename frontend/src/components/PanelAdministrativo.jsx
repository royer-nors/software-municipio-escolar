import { useEffect, useState } from "react";
import { obtenerResumenAdministrativo } from "../api/resumen-administrativo.js";
import { fechaTextoDesdeIso } from "../utils/horario-electoral.js";
import Icono from "./IconoAdministrativo";
import "../styles/panel-administrativo.css";

const preparacion = [
  { id: "centro", icono: "colegio", nombre: "Centro educativo", descripcion: "Institución y horario electoral." },
  { id: "padron", icono: "estudiantes", nombre: "Padrón electoral", descripcion: "Carga de estudiantes desde Excel." },
  { id: "candidatos", icono: "listas", nombre: "Listas y candidatos", descripcion: "Candidaturas y propuestas." },
  { id: "computadoras", icono: "computadora", nombre: "Computadoras", descripcion: "Equipos y grados asignados." },
  { id: "blanco", icono: "documento", nombre: "Voto en blanco", descripcion: "Disponibilidad de esta opción en la cédula." },
];

const jornada = [
  { id: "control-votacion", icono: "urna", nombre: "Control de votación", descripcion: "Apertura, cierre y seguimiento de la jornada.", verde: true },
  { id: "resultados", icono: "grafico", nombre: "Resultados", descripcion: "Porcentajes y reporte de impresión." },
];
const inicial = { resultados: null, configuracion: null, equipos: null, errores: [], cargando: true };

function indicador(id, datos) {
  if (datos.cargando) return "Consultando…";
  const { resultados, configuracion, equipos } = datos;
  const numero = valor => valor.toLocaleString("es-PE");
  const conteo = (valor, singular, plural) => `${numero(valor)} ${valor === 1 ? singular : plural}`;
  const modo = typeof configuracion?.automatica === "boolean" ? configuracion.automatica ? "automático" : "manual" : "no disponible";
  switch (id) {
    case "centro": return !configuracion || !Object.hasOwn(configuracion, "fecha") ? "No disponible" : !configuracion.fecha ? "Fecha pendiente" : fechaTextoDesdeIso(configuracion.fecha) || "Fecha no disponible";
    case "padron": return resultados ? conteo(resultados.resumen.estudiantesHabilitados, "estudiante habilitado", "estudiantes habilitados") : "No disponible";
    case "candidatos": return resultados ? conteo(resultados.listas.length, "lista registrada", "listas registradas") : "No disponible";
    case "computadoras": return equipos ? `${equipos.hayMas ? "Más de " : ""}${conteo(equipos.computadoras.length, "equipo registrado", "equipos registrados")}` : "No disponible";
    case "blanco": return configuracion ? configuracion.votoBlancoHabilitado ? "Habilitado" : "Deshabilitado" : "No disponible";
    case "control-votacion": return configuracion ? `${configuracion.estado || (configuracion.votacionAbierta ? "Abierta" : "Cerrada")} · Modo ${modo}` : "No disponible";
    case "resultados": return resultados ? conteo(resultados.resumen.votosEmitidos, "voto emitido", "votos emitidos") : "No disponible";
    default: return "No disponible";
  }
}

function TarjetaModulo({ modulo, datos, onSeleccionar }) {
  const sinVotos = modulo.id === "resultados" && !datos.resultados?.resumen.votosEmitidos;
  return (
    <button type="button" className={`admin-modulo${modulo.verde ? " admin-modulo-verde" : ""}${sinVotos ? " admin-modulo-secundario" : ""}`} onClick={() => onSeleccionar(modulo.id)}>
      <span className={`admin-modulo-icono admin-icono-${modulo.icono}`}><Icono nombre={modulo.icono} width="32" height="32" /></span>
      <span className="admin-modulo-nombre">{modulo.nombre}</span>
      <span className="admin-modulo-descripcion">{modulo.descripcion}</span>
      <span className="admin-modulo-dato"><span>{indicador(modulo.id, datos)}</span><Icono nombre="flecha" width="18" height="18" /></span>
    </button>
  );
}

export default function PanelAdministrativo({ token, onSeleccionar, onResultados, mensaje, modalAbierto = false }) {
  const [datos, setDatos] = useState(inicial);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (modalAbierto) return;
    const controller = new AbortController();
    let ocupado = false;
    async function leer() {
      if (ocupado) return;
      ocupado = true;
      try {
        const resumen = await obtenerResumenAdministrativo(token, controller.signal);
        if (!controller.signal.aborted) setDatos({ ...resumen, cargando: false });
      } catch {
        if (!controller.signal.aborted) setDatos({ ...inicial, cargando: false, errores: ["resumen"] });
      } finally { ocupado = false; }
    }
    leer();
    const intervalo = setInterval(leer, 20000);
    window.addEventListener("focus", leer);
    return () => { controller.abort(); clearInterval(intervalo); window.removeEventListener("focus", leer); };
  }, [token, revision, modalAbierto]);

  function actualizar() {
    setDatos(inicial);
    setRevision(valor => valor + 1);
  }
  function abrir(id) {
    if (id === "resultados") onResultados();
    else onSeleccionar(id);
  }
  const actualizado = datos.resultados?.generadoEn;
  return (
    <section className="admin-panel" aria-labelledby="admin-titulo" aria-busy={datos.cargando}>
      <div className="admin-portada">
        <div><h2 id="admin-titulo">Panel de control</h2><p className="admin-introduccion">Preparación y seguimiento de la elección escolar.</p></div>
        <div className="admin-actualizacion"><button type="button" className="admin-enlace" onClick={actualizar} disabled={datos.cargando}><Icono nombre="actualizar" width="17" height="17" />{datos.cargando ? "Consultando…" : "Actualizar resumen"}</button>{actualizado && <small>Actualizado a las {new Date(actualizado).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" })}</small>}</div>
      </div>
      {datos.errores.length > 0 && <p className="admin-aviso" role="status">Algunos datos no están disponibles. Puedes actualizar el resumen o abrir el módulo correspondiente.</p>}
      <section className="admin-seccion" aria-labelledby="admin-preparacion">
        <div className="admin-seccion-titulo"><span className="admin-numero">01</span><h3 id="admin-preparacion">Prepara la elección</h3></div>
        <div className="admin-modulos admin-modulos-preparacion">{preparacion.map(modulo => <TarjetaModulo key={modulo.id} modulo={modulo} datos={datos} onSeleccionar={abrir} />)}</div>
      </section>
      <section className="admin-seccion" aria-labelledby="admin-jornada">
        <div className="admin-seccion-titulo"><span className="admin-numero">02</span><h3 id="admin-jornada">Supervisa la jornada</h3></div>
        <div className="admin-modulos admin-modulos-jornada">{jornada.map(modulo => <TarjetaModulo key={modulo.id} modulo={modulo} datos={datos} onSeleccionar={abrir} />)}</div>
      </section>
      <div className="admin-datos"><span className="admin-datos-icono"><Icono nombre="borrar" /></span><div><h3>Datos de prueba</h3><p>Simula una limpieza antes de confirmarla.</p></div><button type="button" onClick={() => onSeleccionar("borrar")}>Revisar limpieza<Icono nombre="flecha" width="16" height="16" /></button></div>
      {mensaje && <p className="admin-aviso" role="status">{mensaje}</p>}
    </section>
  );
}
