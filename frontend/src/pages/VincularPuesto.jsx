import { useCallback, useEffect, useRef, useState } from "react";
import VotacionPuesto from "../components/VotacionPuesto";
import { consultarPuesto, vincularPuesto, etiquetasVinculacion } from "../api/vinculacion";
import "../styles/control-votacion.css";
import "../styles/padron.css";
import "../styles/computadoras.css";

export default function VincularPuesto() {
  const [estado, setEstado] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);
  const [revision, setRevision] = useState(0);
  const ocupado = useRef(false);
  const bloquear = useCallback(() => { setEstado(null); setCargando(true); setRevision(v => v + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    async function leer() {
      if (ocupado.current) return;
      try {
        const datos = await consultarPuesto(controller.signal);
        if (!controller.signal.aborted && !ocupado.current) { setEstado(datos); setError(""); }
      } catch (e) { if (!controller.signal.aborted && !ocupado.current) { setEstado(null); setError(e.message); } }
      finally { if (!controller.signal.aborted && !ocupado.current) setCargando(false); }
    }
    leer();
    const timer = setInterval(leer, 15000);
    window.addEventListener("focus", leer);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", leer); };
  }, [revision]);
  async function vincular(e) {
    e.preventDefault();
    if (ocupado.current || cargando) return;
    ocupado.current = true; setCargando(true); setError("");
    try {
      await vincularPuesto(codigo);
      setCodigo(""); setEstado(await consultarPuesto());
    } catch (e) { setEstado(null); setError(e.message); }
    finally { ocupado.current = false; setCargando(false); }
  }
  return (
  <div
    className="control-votacion gestion-padron computadoras puesto"
    style={{ maxWidth: 1100, margin: "24px auto" }}
    aria-busy={cargando}
  >
    {estado?.estado === "vinculada" ? (
      <VotacionPuesto onBloqueo={bloquear} />
    ) : (
      <>
        <h1>Vincular puesto</h1>

        <p>Solicita al administrador una autorización temporal para esta computadora.</p>

        {cargando && <p role="status">Consultando el servidor…</p>}

        {error && <p role="alert">{error}</p>}

        <form onSubmit={vincular}>
          <fieldset className="padron-formulario" disabled={cargando}>
            <label htmlFor="puesto-codigo">Código temporal</label>

            <input
              id="puesto-codigo"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={codigo}
              onChange={e => setCodigo(e.target.value)}
              required
              minLength={64}
              maxLength={64}
            />

            <button type="submit">Vincular este navegador</button>
          </fieldset>
        </form>

        <button
          type="button"
          disabled={cargando}
          onClick={() => {
            setCargando(true);
            setRevision(v => v + 1);
          }}
        >
          Consultar estado
        </button>
      </>
    )}
  </div>
);
}
