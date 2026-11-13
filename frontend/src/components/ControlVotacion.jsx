import { useEffect, useRef, useState } from "react";
import { obtenerConfiguracion } from "../api/estudiantes";
import { cambiarEstadoVotacion } from "../api/control-votacion";
import "../styles/control-votacion.css";
import { describirHorario } from "../utils/horario-electoral";

export default function ControlVotacion({ token }) {
  const [configuracion, setConfiguracion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [revision, setRevision] = useState(0);
  const ocupado = useRef(false);
  const lecturaActual = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    function leer() {
      if (ocupado.current) return;
      const lectura = ++lecturaActual.current;
      obtenerConfiguracion(controller.signal).then(datos => {
      if (!controller.signal.aborted && !ocupado.current && lectura === lecturaActual.current) {
        setConfiguracion(previa => !previa || !Number.isInteger(previa.revision) || datos.revision >= previa.revision ? datos : previa);
        setError("");
      }
    }).catch(e => {
      if (!controller.signal.aborted && lectura === lecturaActual.current && !ocupado.current) { setConfiguracion(null); setError(e.message); }
    }).finally(() => { if (!controller.signal.aborted && !ocupado.current && lectura === lecturaActual.current) setCargando(false); });
    }
    leer();
    const intervalo = setInterval(leer, 20000);
    window.addEventListener("focus", leer);
    return () => { controller.abort(); clearInterval(intervalo); window.removeEventListener("focus", leer); };
  }, [revision]);

  function consultar() {
    if (ocupado.current) return;
    setCargando(true); setError(""); setMensaje(""); setRevision(v => v + 1);
  }

  async function cambiar() {
    if (ocupado.current || cargando || !configuracion) return;
    const abrir = !configuracion.votacionAbierta;
    if (!window.confirm(`${abrir ? "¿Abrir" : "¿Cerrar"} la votación? ${abrir ? "Podrán votar los estudiantes habilitados que aún no hayan votado." : "Se impedirá registrar nuevos votos."} Los votos existentes se conservarán.`)) return;
    let opciones = Number.isInteger(configuracion.revision) ? { revision: configuracion.revision } : {};
    if (configuracion.automatica) {
      const motivo = window.prompt("Esta orden de emergencia desactivará el horario automático hasta que se reactive en Configurar centro educativo. Indica el motivo para la auditoría:")?.trim();
      if (!motivo) { setError("Indica un motivo para reemplazar el horario automático."); return; }
      opciones = { motivo, confirmarCambioActivo: true, revision: configuracion.revision };
    }
    ocupado.current = true; ++lecturaActual.current; setCargando(true); setError(""); setMensaje("");
    try {
      const actual = await cambiarEstadoVotacion(abrir, token, opciones);
      setConfiguracion(actual);
      setMensaje(actual.votacionAbierta ? "Votación abierta correctamente." : "Votación cerrada correctamente.");
    } catch (e) {
      setError(e.message);
      // Tras una respuesta incierta, no presentar el estado anterior como vigente.
      setConfiguracion(null);
    } finally { ocupado.current = false; setCargando(false); }
  }

  return <section className="control-votacion" aria-busy={cargando}>
    <h2>Control de votación</h2>
    <p>La apertura y el cierre se guardan en PostgreSQL y conservan los votos registrados.</p>
    {cargando && <p role="status">Consultando o guardando el estado…</p>}
    {configuracion && <p className="control-votacion-estado" role="status"><strong>{configuracion.automatica ? configuracion.estado : configuracion.votacionAbierta ? "Votación abierta" : "Votación cerrada"}</strong></p>}
    {error && <p role="alert">{error}</p>}
    {mensaje && <p role="status">{mensaje}</p>}
    <div className="control-votacion-acciones">
      {configuracion && <button type="button" disabled={cargando} onClick={cambiar}>{configuracion.votacionAbierta ? "Cerrar votación" : "Abrir votación"}</button>}
      <button type="button" disabled={cargando} onClick={consultar}>Consultar estado actual</button>
    </div>
    {configuracion?.estado && <p>Estado electoral: <strong>{configuracion.estado}</strong> · Modo {configuracion.automatica ? "automático" : "manual"} · America/Lima</p>}
    {configuracion?.fecha && <p><strong>Horario guardado:</strong> {describirHorario(configuracion)}</p>}
    <p>El control manual de emergencia tiene prioridad y desactiva el horario automático. Para reactivarlo, guarda la opción Apertura y cierre automáticos en Configurar centro educativo.</p>
  </section>;
}
