import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { apiPuesto } from "../api/estudiantes";
import AutenticarVotante from "../pages/AutenticarVotante";
import ListasCandidatos from "../pages/ListasCandidatos";
import VotoRegistrado from "./VotoRegistrado";

export default function VotacionPuesto({ onBloqueo }) {
  const [sesion, setSesion] = useState(null);
  const [terminado, setTerminado] = useState(false);
  const [configuracion, setConfiguracion] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const limpiar = useCallback(() => { setSesion(null); setTerminado(false); setRevision(v => v + 1); }, []);
  const sesionInvalida = useCallback(e => {
    limpiar(); setError(e.message);
    if (e.codigo === "PUESTO_INVALIDO") onBloqueo();
  }, [limpiar, onBloqueo]);
  useEffect(() => {
    const controller = new AbortController();
    async function leer() {
      try {
        const c = await apiPuesto.obtenerConfiguracion(controller.signal);
        if (!controller.signal.aborted) { setConfiguracion(c); }
      } catch (e) {
        if (!controller.signal.aborted) {
          setConfiguracion(null); setError(e.message);
          if (e.codigo === "PUESTO_INVALIDO") onBloqueo();
        }
      }
    }
    leer(); const timer = setInterval(leer, 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [revision, onBloqueo]);
  useEffect(() => {
    // Antes de entrar a BFCache, retirar identidad, token y papeleta del DOM.
    const ocultar = () => flushSync(limpiar);
    const volver = e => { if (e.persisted) limpiar(); };
    window.addEventListener("pagehide", ocultar);
    window.addEventListener("pageshow", volver);
    window.addEventListener("popstate", ocultar);
    return () => {
      window.removeEventListener("pagehide", ocultar);
      window.removeEventListener("pageshow", volver);
      window.removeEventListener("popstate", ocultar);
    };
  }, [limpiar]);
  if (terminado) return <VotoRegistrado onFinalizar={limpiar} />;
  if (sesion) return <ListasCandidatos token={sesion.token} estudiante={sesion.estudiante} api={apiPuesto}
    onFinalizar={limpiar} onSalir={limpiar} onSesionInvalida={sesionInvalida}
    onRegistrado={() => { setSesion(null); setTerminado(true); setError(""); }} />;
  return <section aria-label="Votación del puesto">
    {error && <p role="alert">{error}</p>}
    {!configuracion && <p role="status">Consultando la disponibilidad de la votación…</p>}
    {configuracion && !configuracion.votacionAbierta && <p role="status">La votación está cerrada. Espera las indicaciones del encargado.</p>}
    <button type="button" onClick={() => { setError(""); setRevision(v => v + 1); }}>Consultar votación</button>
    {configuracion?.votacionAbierta && <AutenticarVotante key={revision} identificar={apiPuesto.loginEstudiante}
      onAutenticado={setSesion} onSalir={limpiar} onSesionInvalida={sesionInvalida} />}
  </section>;
}
