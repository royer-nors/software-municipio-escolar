import { useEffect, useRef, useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import Avatar from "../components/Avatar";
import PasosVotacion from "../components/PasosVotacion";
import AtencionElectoral from "../components/AtencionElectoral";
import { loginEstudiante } from "../api/estudiantes";
import "../styles/autenticar.css";
import "../styles/elecciones.css";

function TarjetaDni() {
  return <div className="aut-ejemplo" aria-hidden="true">
    <div className="tarjeta-dni"><span className="tarjeta-dni-tit">DNI</span>
      <div className="tarjeta-dni-cuerpo"><Avatar tam={44} /><div className="tarjeta-dni-lineas"><i /><i /><i /></div></div>
      <span className="tarjeta-dni-num">87654321</span>
    </div><p>Ejemplo: 87654321</p>
  </div>;
}

export default function AutenticarVotante({ onAutenticado, onSalir }) {
  const [dni, setDni] = useState("");
  const [error, setError] = useState("");
  const [atencion, setAtencion] = useState("");
  const [cargando, setCargando] = useState(false);
  const activo = useRef(true);
  const ocupado = useRef(false);
  useEffect(() => { activo.current = true; return () => { activo.current = false; }; }, []);

  async function enviar(e) {
    e.preventDefault();
    if (ocupado.current) return;
    if (!/^\d{8}$/.test(dni)) { setError("Ingresa los ocho dígitos de tu DNI."); return; }
    ocupado.current = true;
    setCargando(true);
    setError("");
    try {
      const datos = await loginEstudiante(dni);
      if (activo.current) onAutenticado({ token: datos.token, estudiante: datos.estudiante });
    } catch (err) {
      if (activo.current) {
        if (err.status === 409) setAtencion(`DNI ${dni}: ${err.message}`);
        else setError(err.message);
      }
    } finally {
      ocupado.current = false;
      if (activo.current) setCargando(false);
    }
  }

  return (
    <MarcoPantalla electoral onSalir={onSalir} salidaDeshabilitada={cargando}>
      <div className="electoral-seccion-label">IDENTIFICACIÓN DEL ESTUDIANTE</div>
      <div className="id-grid">
        <form className="aut-izq" onSubmit={enviar} noValidate>
          <section className="panel aut-titulo">
            <span className="electoral-icono" aria-hidden="true">✓</span>
            <div className="aut-titulo-texto"><h2>AUTENTICAR VOTANTE</h2><p>Ingresa tu DNI para validar tu identidad.</p></div>
            <div className="sello-seguro">Tu voto es seguro y confidencial</div>
          </section>
          <section className="panel electoral-formulario">
            <div className="aut-fila">
              <div>
                <label htmlFor="dni" className="etiqueta">Documento Nacional de Identidad</label>
                <p className="electoral-campo-descripcion">Escribe tu número de DNI, sin espacios.</p>
                <input id="dni" className="aut-input" inputMode="numeric" autoComplete="off" autoFocus maxLength={8}
                  placeholder="Ingresa tu número de DNI" value={dni} disabled={cargando}
                  onChange={e => { setDni(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(""); }}
                  aria-invalid={Boolean(error)} aria-describedby="dni-ayuda" />
                <p id="dni-ayuda" className={error ? "aut-ayuda aut-error" : "aut-ayuda"} role={error ? "alert" : undefined}>
                  {error || "El sistema verificará si estás habilitado en el padrón electoral."}
                </p>
              </div>
              <TarjetaDni />
            </div>
            <div className="aut-pie">
              <ol className="aut-stepper" aria-label="Etapas del proceso">
                <li className="activo" aria-current="step"><span className="paso-num">1</span>Ingresar DNI</li>
                <li><span className="paso-num">2</span>Validar identidad</li>
                <li><span className="paso-num">3</span>Enviar voto</li>
              </ol>
              <button type="submit" className="btn-verde aut-boton" disabled={cargando} aria-busy={cargando}>
                {cargando ? "Validando identidad…" : "Autenticar"} <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        </form>
        <PasosVotacion />
      </div>
      {atencion && <AtencionElectoral mensaje={atencion} onAceptar={() => { setAtencion(""); setDni(""); }} />}
    </MarcoPantalla>
  );
}
