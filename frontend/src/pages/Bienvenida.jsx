import { useState } from "react";
import "../styles/bienvenida.css";

function IconoUrna() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h16l1.5 8h-19L4 12Z" />
      <path d="M9 4h6l2 8H7l2-8Z" />
      <path d="m10 8 1.5 1.5L15 6" />
      <path d="M3.5 16h17" />
    </svg>
  );
}

function IconoAdministrador() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1" />
      <path d="M12 16v2" />
    </svg>
  );
}

function IlustracionAlternativa() {
  return (
    <svg className="bv-fallback" viewBox="0 0 420 300" role="img" aria-label="Urna electoral con una papeleta y estudiantes">
      <circle cx="210" cy="146" r="132" fill="#dbe9fb" />
      <circle cx="89" cy="68" r="9" fill="#f3cf71" />
      <circle cx="339" cy="100" r="7" fill="#9eb7e9" />
      <rect x="118" y="158" width="185" height="106" rx="15" fill="#2c67b4" />
      <rect x="132" y="169" width="157" height="82" rx="10" fill="#85b1e8" />
      <path d="M145 159h133" stroke="#173f84" strokeWidth="12" strokeLinecap="round" />
      <g transform="rotate(-12 207 127)">
        <rect x="170" y="58" width="82" height="99" rx="9" fill="white" stroke="#7c9fc9" strokeWidth="3" />
        <path d="m192 110 14 13 24-29" stroke="#2d9b71" strokeWidth="9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="91" cy="188" r="25" fill="#efc4a3" />
      <path d="M44 257c5-43 25-60 47-60s42 17 47 60" fill="#154c99" />
      <circle cx="329" cy="188" r="25" fill="#efc4a3" />
      <path d="M282 257c5-43 25-60 47-60s42 17 47 60" fill="#154c99" />
    </svg>
  );
}

/**
 * Contenido de la portada. App.jsx ya lo envuelve en MarcoPantalla:
 * no agregamos otro encabezado, pie ni escudo.
 */
export default function Bienvenida({ onVotar, onAdministrador }) {
  const [imagenNoDisponible, setImagenNoDisponible] = useState(false);

  return (
    <section className="bv-inicio" aria-labelledby="bv-titulo">
      <div className="bv-visual">
        <div className="bv-visual-marco">
          <span className="bv-visual-destello bv-visual-destello-uno" aria-hidden="true" />
          <span className="bv-visual-destello bv-visual-destello-dos" aria-hidden="true" />
          {imagenNoDisponible ? (
            <IlustracionAlternativa />
          ) : (
            <img
              src="/ilustracion-votacion-escolar.png"
              alt="Estudiantes de secundaria participando en la elección del Municipio Escolar"
              className="bv-ilustracion"
              onError={() => setImagenNoDisponible(true)}
            />
          )}
        </div>
        <span className="bv-visual-pie">Tu voz también cuenta en nuestra institución</span>
      </div>

      <div className="bv-contenido">
        <h2 id="bv-titulo" className="bv-titulo">¡Bienvenidos!</h2>
        <p className="bv-subtitulo">Participa en las elecciones de nuestra institución.</p>
        <p className="bv-descripcion">Selecciona una opción para continuar:</p>

        <div className="bv-opciones" role="group" aria-label="Tipo de acceso">
          <button type="button" className="bv-opcion bv-opcion-estudiante" onClick={onVotar}>
            <span className="bv-opcion-icono bv-opcion-icono-estudiante"><IconoUrna /></span>
            <span className="bv-opcion-texto">
              <strong>Ingresar como estudiante</strong>
              <small>Identifícate y emite tu voto</small>
            </span>
            <span className="bv-opcion-flecha" aria-hidden="true">→</span>
          </button>

          <button type="button" className="bv-opcion bv-opcion-administrador" onClick={onAdministrador}>
            <span className="bv-opcion-icono bv-opcion-icono-administrador"><IconoAdministrador /></span>
            <span className="bv-opcion-texto">
              <strong>Ingresar como administrador</strong>
              <small>Gestiona el proceso electoral</small>
            </span>
            <span className="bv-opcion-flecha" aria-hidden="true">→</span>
          </button>
        </div>

        <p className="bv-nota">Si eres estudiante, ten a mano tu DNI para identificarte.</p>
      </div>
    </section>
  );
}
