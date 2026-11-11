import { useEffect, useRef, useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import TarjetaLista from "../components/TarjetaLista";
import ConfirmarVoto from "../components/ConfirmarVoto";
import VotoRegistrado from "../components/VotoRegistrado";
import AtencionElectoral from "../components/AtencionElectoral";
import { obtenerConfiguracion, obtenerListas, registrarVoto } from "../api/estudiantes";
import { coloresPorNombre } from "../utils/elecciones";
import "../styles/elecciones.css";

export default function ListasCandidatos({ token, estudiante, onFinalizar, onSalir }) {
  const [listas, setListas] = useState(null);
  const [configuracion, setConfiguracion] = useState(null);
  const [error, setError] = useState("");
  const [seleccion, setSeleccion] = useState(null);
  const [dialogo, setDialogo] = useState(null);
  const [atencion, setAtencion] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [errorVoto, setErrorVoto] = useState("");
  const ocupado = useRef(false);
  const colores = coloresPorNombre(listas || []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([obtenerListas(token, controller.signal), obtenerConfiguracion(controller.signal)])
      .then(([datos, config]) => { if (!controller.signal.aborted) { setListas(datos); setConfiguracion(config); } })
      .catch(e => {
        if (controller.signal.aborted) return;
        setError(e.message);
        if (e.status === 401 || e.status === 409) setAtencion({ mensaje: e.message });
      });
    // Solo consultas de lectura: la protección definitiva permanece en PostgreSQL.
    async function actualizarEstado() {
      try {
        const config = await obtenerConfiguracion(controller.signal);
        if (!controller.signal.aborted) setConfiguracion(config);
      } catch {
        if (!controller.signal.aborted) setConfiguracion(null);
      }
    }
    const intervalo = setInterval(actualizarEstado, 20000);
    window.addEventListener("focus", actualizarEstado);
    return () => { controller.abort(); clearInterval(intervalo); window.removeEventListener("focus", actualizarEstado); };
  }, [token]);

  const abierta = configuracion?.votacionAbierta === true;
  const seleccionValida = seleccion?.tipo === "lista"
    ? listas?.some(l => l.id === seleccion.id)
    : seleccion?.tipo === "blanco" && configuracion?.votoBlancoHabilitado === true;
  const bloqueado = !listas || Boolean(error) || !abierta || enviando || Boolean(atencion) || dialogo === "registrado";

  function abrirConfirmacion() {
    if (bloqueado || !seleccionValida) return;
    setErrorVoto("");
    setDialogo("confirmar");
  }

  async function confirmar() {
    if (ocupado.current || bloqueado || !seleccionValida) return;
    ocupado.current = true;
    setEnviando(true);
    setErrorVoto("");
    try {
      // Comprobar la configuración de nuevo antes de la única escritura.
      const actual = await obtenerConfiguracion();
      setConfiguracion(actual);
      if (!actual.votacionAbierta) { setDialogo(null); return; }
      if (seleccion.tipo === "blanco" && !actual.votoBlancoHabilitado) {
        setSeleccion(null); setDialogo(null); return;
      }
      await registrarVoto(token, seleccion);
      setDialogo("registrado");
    } catch (e) {
      if (e.incierto) {
        setDialogo(null);
        setAtencion({ mensaje: "No se pudo confirmar si tu voto fue registrado.", incierto: true });
      } else if (e.status === 401 || e.status === 409) {
        setDialogo(null);
        setAtencion({ mensaje: e.message });
      } else setErrorVoto(e.message);
    } finally { ocupado.current = false; setEnviando(false); }
  }

  return (
    <MarcoPantalla electoral onSalir={onSalir} salidaDeshabilitada={enviando}>
      <div className="lista-cabecera">
        <div className="electoral-titulo-con-icono"><span className="electoral-icono" aria-hidden="true">▣</span>
          <div><h2>ELECCIONES MUNICIPIO ESCOLAR</h2><p>Selecciona una sola lista de tu preferencia.</p></div></div>
        <div className="lista-votante"><strong>{estudiante.nombre}</strong><span>DNI: {estudiante.dni}</span>
          {(estudiante.grado || estudiante.seccion) && <span>
            {estudiante.grado && <>Grado: {estudiante.grado} </>}{estudiante.seccion && <>Sección: {estudiante.seccion}</>}
          </span>}
        </div>
      </div>
      {error && <p className="electoral-alerta electoral-alerta-error" role="alert">{error}</p>}
      {!error && !listas && <p className="estado" role="status">Consultando listas y estado de la elección…</p>}
      {listas && !configuracion && <p className="electoral-alerta" role="alert">No se puede verificar el estado de la elección. La votación permanecerá bloqueada.</p>}
      {configuracion && !abierta && <p className="electoral-alerta" role="status"><strong>La votación está cerrada.</strong> Avisa al encargado para conocer el horario de atención.</p>}
      {listas?.length === 0 && <p className="estado">Todavía no hay listas registradas.</p>}
      {listas && <fieldset className="electoral-papeleta" disabled={bloqueado}>
        <legend className="electoral-sr">Elige una opción electoral</legend>
        <div className="tarjetas">
          {listas.map(lista => <TarjetaLista key={lista.id} lista={lista} color={colores.get(lista.nombre)}
            seleccionada={seleccion?.tipo === "lista" && seleccion.id === lista.id} disabled={bloqueado}
            onElegir={() => setSeleccion({ tipo: "lista", id: lista.id, nombre: lista.nombre, numero: lista.numero })} />)}
        </div>
        <div className="barra-votar">
          {configuracion?.votoBlancoHabilitado && <label className={`btn-blanco${seleccion?.tipo === "blanco" ? " electoral-blanco-activo" : ""}`}>
            <input className="electoral-radio" type="radio" name="opcion-electoral" value="blanco"
              checked={seleccion?.tipo === "blanco"} onChange={() => setSeleccion({ tipo: "blanco" })} />
            Voto en blanco
          </label>}
          <p className="cuadro-info">Selecciona una opción y pulsa Votar. Podrás revisar tu elección antes de confirmarla.</p>
          <button type="button" className="btn-verde" disabled={bloqueado || !seleccionValida} onClick={abrirConfirmacion}>Votar <span aria-hidden="true">→</span></button>
        </div>
      </fieldset>}
      <p className="electoral-nota">Tu voto es personal, libre y secreto. Después de confirmar no podrás modificarlo.</p>
      {dialogo === "confirmar" && <ConfirmarVoto seleccion={seleccion} enviando={enviando} error={errorVoto}
        bloqueado={!abierta || !seleccionValida} onConfirmar={confirmar} onCancelar={() => setDialogo(null)} />}
      {dialogo === "registrado" && <VotoRegistrado onFinalizar={onFinalizar} />}
      {atencion && <AtencionElectoral {...atencion} onAceptar={onSalir} />}
    </MarcoPantalla>
  );
}
