import { useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import Avatar from "../components/Avatar";
import { loginEstudiante } from "../api/estudiantes";
import "../styles/autenticar.css";

function TarjetaDni() {
  return (
    <div className="tarjeta-dni" aria-hidden="true">
      <span className="tarjeta-dni-tit">DNI</span>
      <div className="tarjeta-dni-cuerpo">
        <Avatar tam={44} />
        <div className="tarjeta-dni-lineas"><i /><i /><i /></div>
      </div>
      <span className="tarjeta-dni-num">87654321</span>
    </div>
  );
}

// Pantalla "Autenticar votante": el estudiante escribe su DNI.
// onAutenticado recibe { token, estudiante } cuando el DNI es válido.
export default function AutenticarVotante({ onAutenticado, onSalir }) {
  const [dni, setDni] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  function cambiar(e) {
    setDni(e.target.value.replace(/\D/g, "").slice(0, 8)); // solo dígitos, máximo 8
    setError("");
  }

  async function enviar(e) {
    e.preventDefault();
    if (!/^\d{8}$/.test(dni)) {
      setError("El DNI debe tener 8 dígitos.");
      return;
    }
    setCargando(true);
    setError("");
    try {
      const datos = await loginEstudiante(dni);
      onAutenticado({ token: datos.token, estudiante: datos.estudiante });
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <MarcoPantalla onSalir={onSalir}>
      <div className="id-grid">
        <form className="aut-izq" onSubmit={enviar} noValidate>
          <section className="panel aut-titulo">
            <span className="icono-caja" aria-hidden="true">✓</span>
            <div className="aut-titulo-texto">
              <h2>AUTENTICAR VOTANTE</h2>
              <p>Ingresa tu DNI y presiona el botón para validar tu identidad.</p>
            </div>
            <div className="sello-seguro">Tu voto es seguro y confidencial</div>
          </section>

          <section className="panel">
            <div className="aut-fila">
              <div>
                <label htmlFor="dni" className="etiqueta">DNI</label>
                <input
                  id="dni"
                  className="aut-input"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  placeholder="Ingresa tu número de DNI"
                  value={dni}
                  onChange={cambiar}
                  aria-invalid={Boolean(error)}
                  aria-describedby="dni-ayuda"
                />
                <p
                  id="dni-ayuda"
                  className={error ? "aut-ayuda aut-error" : "aut-ayuda"}
                  role={error ? "alert" : undefined}
                >
                  {error ||
                    "Asegúrate de ingresar correctamente tu DNI. El sistema verificará si estás habilitado para votar."}
                </p>
              </div>
              <div className="aut-ejemplo">
                <TarjetaDni />
                <p>Ejemplo: 87654321</p>
              </div>
            </div>

            <div className="aut-pie">
              <ol className="aut-stepper">
                <li className="activo"><span className="paso-num">1</span>Ingresar DNI</li>
                <li><span className="paso-num">2</span>Validar identidad</li>
                <li><span className="paso-num">3</span>Enviar voto</li>
              </ol>
              <button type="submit" className="btn-verde aut-boton" disabled={cargando}>
                {cargando ? "Validando…" : "Autenticar"}
              </button>
            </div>
          </section>
        </form>

        <aside className="panel">
          <h2>Proceso de votación</h2>
          <ol className="pasos">
            <li><span className="paso-num">1</span>Ingresa tu DNI</li>
            <li><span className="paso-num">2</span>El sistema valida tu identidad</li>
            <li><span className="paso-num">3</span>Si es válido, podrás votar</li>
          </ol>
          <div className="listo">
            <strong>Votación segura</strong>
            <p>Tu votación está protegida y sólo se usa para este proceso.</p>
          </div>
        </aside>
      </div>
    </MarcoPantalla>
  );
}
