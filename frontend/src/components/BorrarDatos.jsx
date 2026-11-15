import { useCallback, useEffect, useRef, useState } from "react";
import Dialogo from "./Dialogo";
import { ejecutarBorradoDatos, obtenerResumenBorrado, obtenerAuditoriaBorrado, simularBorradoDatos } from "../api/borrado-datos";
import "../styles/borrar-datos.css";
const OPERACIONES = [
  ["solo_votos", "Votos y marcas de participación"],
  ["estudiantes_importados", "Solo estudiantes importados desde Excel"],
  ["estudiantes", "Todo el padrón de estudiantes"],
  ["solo_candidatos", "Solo candidatos"], ["solo_listas", "Solo listas sin candidatos"],
  ["candidatos_listas", "Votos, candidatos y listas"], ["reinicio_pruebas", "Reinicio electoral completo"],
];
const CAMPOS = { estudiantes: "Estudiantes", listas: "Listas", candidatos: "Candidatos", votos: "Votos", marcasYaVotoRestablecidas: "Marcas de participación restablecidas" };
function Cantidades({ datos, titulo }) {
  return <section className="borrar-datos-cantidades"><h3>{titulo}</h3><dl>{Object.entries(CAMPOS).map(([k, nombre]) => <div key={k}><dt>{nombre}</dt><dd>{datos?.[k] ?? 0}</dd></div>)}</dl></section>;
}
export default function BorrarDatos({ token }) {
  const [resumen, setResumen] = useState(null), [auditoria, setAuditoria] = useState([]);
  const [operacion, setOperacion] = useState("solo_votos"), [simulacion, setSimulacion] = useState(null);
  const [error, setError] = useState(""), [aviso, setAviso] = useState("");
  const [trabajando, setTrabajando] = useState(false), [confirmando, setConfirmando] = useState(false);
  const ocupado = useRef(false), formulario = useRef(null);
  const cargar = useCallback(async signal => {
    try {
      const [r, a] = await Promise.all([obtenerResumenBorrado(token, signal), obtenerAuditoriaBorrado(token, signal)]);
      if (!signal?.aborted) { setResumen(r); setAuditoria(a.auditoria || []); }
    } catch (e) { if (!signal?.aborted) setError(e.message); }
  }, [token]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void cargar(controller.signal); });
    return () => controller.abort();
  }, [cargar]);
  async function simular() {
    if (ocupado.current) return;
    ocupado.current = true; setTrabajando(true); setError(""); setAviso(""); setSimulacion(null);
    try { setSimulacion(await simularBorradoDatos(token, operacion)); }
    catch (e) { setError(e.message); }
    finally { ocupado.current = false; setTrabajando(false); }
  }
  async function ejecutar(e) {
    e.preventDefault();
    if (ocupado.current || !simulacion || simulacion.bloqueada) return;
    const datos = new FormData(formulario.current);
    if (datos.get("aceptar") !== "si") return;
    const password = datos.get("password"); formulario.current.reset();
    ocupado.current = true; setTrabajando(true); setError(""); setAviso("");
    const previa = simulacion; setSimulacion(null);
    try {
      await ejecutarBorradoDatos(token, { operacion: previa.operacion, simulacionId: previa.simulacionId, password,
        confirmacion: previa.operacion === "reinicio_pruebas" ? "REINICIAR COMPLETAMENTE DATOS DE PRUEBA" : "BORRAR DATOS DE PRUEBA" });
      setAviso("Operación completada y auditada. Se conservaron administradores, consultores y computadoras. Los puestos deben vincularse nuevamente.");
    } catch (err) { setError(err.message); }
    finally { setConfirmando(false); ocupado.current = false; setTrabajando(false); await cargar(); }
  }
  const valida = simulacion && simulacion.operacion === operacion && !simulacion.bloqueada;
  return <main className="borrar-datos">
    <header className="borrar-datos-encabezado"><h2>Borrar datos</h2><p>Selecciona los datos y revisa la vista previa antes de confirmar con tu contraseña.</p></header>
    {error && <p role="alert" className="borrar-datos-mensaje borrar-datos-error">{error}</p>}
    {aviso && <p role="status">{aviso}</p>}
    {!resumen && <p role="status">Consultando datos…</p>}
    {resumen && <>
      <Cantidades datos={resumen} titulo="Registros actuales" />
      <p>Excel identificados: {resumen.estudiantesImportados}. Origen anterior desconocido: {resumen.estudiantesOrigenDesconocido}. Estos últimos no se incluyen en “solo importados”.</p>
      {!resumen.habilitado && <p role="alert">{resumen.motivoEntorno}</p>}
      {resumen.autorizacionReinicio?.tipo === "administrativa" && <p>Reinicio de la base real habilitado. Requiere tu contraseña vigente y la confirmación de la vista previa.</p>}
      {resumen.votacionAbierta && <p role="alert">La elección está abierta. Ciérrala antes de ejecutar cualquier borrado.</p>}
    </>}
    <section className="borrar-datos-panel">
      <label htmlFor="borrar-operacion">¿Qué deseas borrar?</label>
      <select id="borrar-operacion" disabled={trabajando} value={operacion} onChange={e => { setOperacion(e.target.value); setSimulacion(null); setAviso(""); setError(""); }}>
        {OPERACIONES.map(([k, nombre]) => <option key={k} value={k}>{nombre}</option>)}
      </select>
      <button type="button" className="borrar-datos-boton" disabled={trabajando || !resumen} onClick={simular}>Simular operación</button>
      {simulacion && <div className="borrar-datos-resultado">
        <Cantidades datos={simulacion.proyeccion} titulo="Datos que se eliminarán" />
        <p>La simulación no elimina registros y vence en 10 minutos.</p>
        {simulacion.bloqueos?.map(b => <p role="alert" key={b}>{b}</p>)}
        <ul>{simulacion.efectos?.map(efecto => <li key={efecto}>{efecto}</li>)}</ul>
      </div>}
      <button type="button" className="borrar-datos-boton peligro" disabled={trabajando || !valida || !resumen?.habilitado} onClick={() => setConfirmando(true)}>Revisar y confirmar</button>
      <button type="button" disabled={trabajando} onClick={() => cargar()}>Actualizar</button>
    </section>
    <section className="borrar-datos-panel"><h3>Auditoría reciente</h3><ul>{auditoria.map(a => <li key={a.id}>
      {new Date(a.creado_en).toLocaleString("es-PE", { timeZone: "America/Lima" })} · {a.administrador_usuario} · {a.operacion || "Solicitud inválida"} · {a.resultado}
      {a.cantidades && <span> · {Object.entries(CAMPOS).map(([k, nombre]) => `${nombre}: ${a.cantidades[k] ?? 0}`).join("; ")}</span>}
    </li>)}</ul></section>
    {confirmando && valida && <Dialogo titulo="Confirmar borrado de datos" onCerrar={trabajando ? undefined : () => setConfirmando(false)}>
      <form ref={formulario} onSubmit={ejecutar}>
        <p>{OPERACIONES.find(([k]) => k === operacion)?.[1]}. Esta acción no se puede deshacer desde el panel.</p>
        <Cantidades datos={simulacion.proyeccion} titulo="Cantidades afectadas" />
        <ul>{simulacion.efectos?.map(efecto => <li key={efecto}>{efecto}</li>)}</ul>
        <p>Las cuentas administrativas, sus contraseñas, consultores, computadoras, migraciones y auditorías permanecerán registradas.</p>
        <label><input type="checkbox" name="aceptar" value="si" required disabled={trabajando} />He revisado los datos y confirmo su eliminación.</label>
        <label htmlFor="borrar-password">Vuelve a introducir tu contraseña de administrador</label>
        <input id="borrar-password" name="password" type="password" autoComplete="current-password" required disabled={trabajando} />
        <div className="dialogo-botones"><button type="button" disabled={trabajando} onClick={() => setConfirmando(false)}>Cancelar</button>
          <button type="submit" disabled={trabajando}>Confirmar y ejecutar</button></div>
      </form>
    </Dialogo>}
  </main>;
}
