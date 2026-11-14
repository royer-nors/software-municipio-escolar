import { useEffect, useRef, useState } from "react";
import { guardarComputadora, listarComputadoras } from "../api/computadoras";
import VinculacionComputadora from "./VinculacionComputadora";
import "../styles/control-votacion.css";
import "../styles/padron.css";
import "../styles/computadoras.css";

const vacio = { identificador: "", nombre: "", grado: 1 };
const porPagina = 50;

export default function GestionComputadoras({ token }) {
  const [equipos, setEquipos] = useState([]);
  const [hayMas, setHayMas] = useState(false);
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [formulario, setFormulario] = useState(vacio);
  const [editando, setEditando] = useState(null);
  const ocupado = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    listarComputadoras(token, { offset, limit: porPagina, signal: controller.signal })
      .then(datos => {
        if (controller.signal.aborted) return;
        setEquipos(datos.computadoras); setHayMas(datos.hayMas);
      }).catch(e => {
        if (controller.signal.aborted) return;
        setEquipos([]); setHayMas(false); setError(e.message);
      }).finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, [token, offset, revision]);

  const bloqueado = cargando || guardando || !token;
  function consultar(nuevoOffset = offset) {
    if (ocupado.current) return;
    setError(""); setCargando(true); setOffset(nuevoOffset); setRevision(v => v + 1);
  }
  function cancelar() { setEditando(null); setFormulario(vacio); }
  function editar(equipo) {
    setError(""); setMensaje(""); setEditando(equipo.id);
    setFormulario({ identificador: equipo.identificador, nombre: equipo.nombre, grado: equipo.grado });
    document.getElementById("computadora-nombre")?.focus();
  }
  async function guardar(datos, id) {
    if (ocupado.current || bloqueado) return;
    ocupado.current = true; setGuardando(true); setError(""); setMensaje("");
    try {
      const equipo = await guardarComputadora(datos, token, id);
      setMensaje(`${equipo.identificador}: ${id === undefined ? "registrada" : "actualizada"} correctamente.`);
      cancelar();
      setCargando(true); setRevision(v => v + 1);
      if (id === undefined) setOffset(0);
    } catch (e) { setError(e.message); }
    finally { ocupado.current = false; setGuardando(false); }
  }
  function enviar(e) {
    e.preventDefault();
    const datos = { nombre: formulario.nombre, grado: formulario.grado };
    if (editando === null) datos.identificador = formulario.identificador;
    guardar(datos, editando ?? undefined);
  }

  return <section className="control-votacion gestion-padron computadoras" aria-labelledby="titulo-computadoras" aria-busy={cargando || guardando}>
    <h2 id="titulo-computadoras">Computadoras de votación</h2>
    <p>Registra y asigna equipos a grados de secundaria. Habilitar un registro no vincula el navegador ni concede acceso a votación.</p>
    {error && <p role="alert" className="padron-aviso padron-error">{error}</p>}
    {mensaje && <p role="status" className="padron-aviso padron-exito">{mensaje}</p>}
    {(cargando || guardando) && <p role="status">{guardando ? "Guardando computadora…" : "Consultando computadoras…"}</p>}
    <form onSubmit={enviar}>
      <fieldset disabled={bloqueado} className="padron-formulario">
        <legend>{editando === null ? "Registrar computadora" : `Editar ${formulario.identificador}`}</legend>
        <label htmlFor="computadora-identificador">Identificador único</label>
        <input id="computadora-identificador" value={formulario.identificador} readOnly={editando !== null} maxLength={30} pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,29}" required placeholder="PC-01"
          onChange={e => setFormulario({ ...formulario, identificador: e.target.value })} />
        {editando !== null && <small>El identificador se conserva al editar.</small>}
        <label htmlFor="computadora-nombre">Nombre descriptivo</label>
        <input id="computadora-nombre" value={formulario.nombre} maxLength={100} required placeholder="Equipo del aula de informática"
          onChange={e => setFormulario({ ...formulario, nombre: e.target.value })} />
        <label htmlFor="computadora-grado">Grado de secundaria</label>
        <select id="computadora-grado" value={formulario.grado} onChange={e => setFormulario({ ...formulario, grado: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5].map(grado => <option key={grado} value={grado}>{grado}.º de secundaria</option>)}
        </select>
        <div className="control-votacion-acciones">
          <button type="submit">{editando === null ? "Registrar computadora" : "Guardar cambios"}</button>
          {editando !== null && <button type="button" onClick={cancelar}>Cancelar edición</button>}
        </div>
      </fieldset>
    </form>
    <div className="computadoras-listado">
      <h3>Equipos registrados</h3>
      <button type="button" disabled={bloqueado} onClick={() => consultar()}>Actualizar lista</button>
      {!cargando && !error && equipos.length === 0 && <p>No hay computadoras en esta página.</p>}
      <div className="computadoras-tabla">
        <table>
          <caption>Computadoras · página {Math.floor(offset / porPagina) + 1}</caption>
          <thead><tr><th scope="col">Identificador</th><th scope="col">Nombre</th><th scope="col">Grado</th><th scope="col">Estado</th><th scope="col">Registro (Lima)</th><th scope="col">Acciones</th><th scope="col">Vinculación</th></tr></thead>
          <tbody>{equipos.map(equipo => <tr key={equipo.id} data-equipo={equipo.identificador}>
            <th scope="row">{equipo.identificador}</th><td>{equipo.nombre}</td><td>{equipo.grado}.º secundaria</td>
            <td>{equipo.activo ? "Habilitada" : "Deshabilitada"}</td>
            <td><time dateTime={equipo.fecha_registro}>{new Date(equipo.fecha_registro).toLocaleString("es-PE", { timeZone: "America/Lima" })}</time></td>
            <td><div className="control-votacion-acciones">
              <button type="button" disabled={bloqueado} onClick={() => editar(equipo)} aria-label={`Editar ${equipo.identificador}`}>Editar</button>
              <button type="button" disabled={bloqueado} onClick={() => guardar({ activo: !equipo.activo }, equipo.id)} aria-label={`${equipo.activo ? "Deshabilitar" : "Habilitar"} ${equipo.identificador}`}>{equipo.activo ? "Deshabilitar" : "Habilitar"}</button>
            </div></td>
            <td><VinculacionComputadora equipo={equipo} token={token} bloqueado={bloqueado} onCambio={() => consultar()} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="control-votacion-acciones">
        <button type="button" disabled={bloqueado || offset === 0} onClick={() => consultar(Math.max(0, offset - porPagina))}>Página anterior</button>
        <button type="button" disabled={bloqueado || !hayMas} onClick={() => consultar(offset + porPagina)}>Página siguiente</button>
      </div>
    </div>
  </section>;
}
