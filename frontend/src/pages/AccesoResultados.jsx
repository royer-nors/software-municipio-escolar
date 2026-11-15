import { useRef, useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import Resultados from "./Resultados";
import { loginConsultor, obtenerResultadosConsultor } from "../api/consultores-resultados";
export default function AccesoResultados({ onSalir }) {
  const [sesion, setSesion] = useState(null), [error, setError] = useState(""), [ocupado, setOcupado] = useState(false);
  const envio = useRef(false);
  async function ingresar(e) {
    e.preventDefault(); if (envio.current) return;
    const f = e.currentTarget, datos = new FormData(f);
    f.reset(); envio.current = true; setOcupado(true); setError("");
    try { setSesion(await loginConsultor(datos.get("usuario"), datos.get("password"))); }
    catch (e) { setError(e.message); }
    finally { envio.current = false; setOcupado(false); }
  }
  // La sesión solo existe en memoria; nunca se convierte en sesión administrativa.
  if (sesion) return <Resultados token={sesion.token} consultar={obtenerResultadosConsultor} consultor onSalir={() => { setSesion(null); onSalir(); }} />;
  return <MarcoPantalla onSalir={onSalir}><section className="borrar-datos-panel">
    <h2>Resultados · Acceso de consultores</h2><p>Acceso exclusivo para los dos estudiantes autorizados.</p>
    {error && <p role="alert">{error}</p>}
    <form onSubmit={ingresar}>
      <label htmlFor="consultor-usuario">Usuario</label><input id="consultor-usuario" name="usuario" autoComplete="username" maxLength={50} required disabled={ocupado} />
      <label htmlFor="consultor-password">Contraseña</label><input id="consultor-password" name="password" type="password" autoComplete="current-password" required disabled={ocupado} />
      <button disabled={ocupado}>Ingresar a resultados</button>
    </form>
  </section></MarcoPantalla>;
}
