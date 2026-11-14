import { useEffect, useRef, useState } from "react";
import { guardarConsultor, listarConsultores } from "../api/consultores-resultados";
function Cuenta({ cuenta, token, onCambio }) {
  const [error, setError] = useState(""), [guardando, setGuardando] = useState(false);
  const ocupado = useRef(false);
  async function guardar(e) {
    e.preventDefault(); if (ocupado.current) return;
    const f = e.currentTarget, datos = new FormData(f), password = datos.get("password");
    const body = { usuario: datos.get("usuario"), activo: datos.get("activo") === "si", ...(password ? { password } : {}) };
    f.elements.password.value = ""; ocupado.current = true; setGuardando(true); setError("");
    try { await guardarConsultor(token, cuenta.id, body); onCambio(); }
    catch (e) { setError(e.message); }
    finally { ocupado.current = false; setGuardando(false); }
  }
  return <form className="borrar-datos-panel" onSubmit={guardar}>
    <h3>Consultor {cuenta.id}</h3><p>Estado: {cuenta.activo ? "Habilitado" : "Deshabilitado"}</p>
    {error && <p role="alert">{error}</p>}
    <label htmlFor={`cu-${cuenta.id}`}>Usuario</label><input id={`cu-${cuenta.id}`} name="usuario" defaultValue={cuenta.usuario || ""} maxLength={50} autoComplete="off" required disabled={guardando} />
    <label htmlFor={`cp-${cuenta.id}`}>Nueva contraseña (vacía conserva la actual)</label><input id={`cp-${cuenta.id}`} name="password" type="password" autoComplete="new-password" minLength={8} disabled={guardando} />
    <label><input name="activo" type="checkbox" value="si" defaultChecked={cuenta.activo} disabled={guardando} />Habilitar cuenta</label>
    <button disabled={guardando}>Guardar consultor {cuenta.id}</button>
  </form>;
}
export default function GestionConsultores({ token }) {
  const [cuentas, setCuentas] = useState([]), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    listarConsultores(token, c.signal).then(datos => { if (!c.signal.aborted) { setCuentas(datos); setError(""); } })
      .catch(e => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [token, revision]);
  return <section><h2>Consultores de resultados</h2>
    <p>Dos cuentas independientes del padrón. Solo consultan resultados al finalizar el horario automático. Cada cambio invalida sus sesiones anteriores.</p>
    {error && <p role="alert">{error}</p>}
    {cuentas.map(c => <Cuenta key={`${c.id}-${c.actualizado_en}`} cuenta={c} token={token} onCambio={() => setRevision(r => r + 1)} />)}
  </section>;
}
