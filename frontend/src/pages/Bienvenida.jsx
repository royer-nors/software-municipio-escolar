import { useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import "../styles/bienvenida.css";

// Ilustración de reemplazo. Si pones la imagen del diseño en frontend/public/bienvenida.png
// se muestra esa en lugar de este dibujo.
function Ilustracion() {
  return (
    <svg viewBox="0 0 400 300" role="img" aria-label="Estudiantes depositando su voto" className="bv-svg">
      {[90, 200, 310].map((x) => (
        <g key={x} transform={`translate(${x} 0)`}>
          <circle cx="0" cy="80" r="22" fill="#f0c9a4" />
          <path d="M-38 150c4-34 20-48 38-48s34 14 38 48z" fill="#1f4e8c" />
        </g>
      ))}
      <rect x="130" y="170" width="140" height="90" rx="8" fill="#9ec5ee" />
      <rect x="150" y="150" width="100" height="26" rx="4" fill="#cfe3f8" />
      <circle cx="200" cy="215" r="22" fill="#3b82d6" />
      <path d="M190 215l8 8 14-16" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const Calendario = () => (
  <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const Encendido = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path d="M12 3v8M6.5 6.5a8 8 0 1 0 11 0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
);

const Urna = () => (
  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
    <path d="M3 13h18v7H3z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    <path d="M8 4h8v7H8z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

// Pantalla "Bienvenido": primera pantalla del estudiante.
export default function Bienvenida({ onVotar, onAyuda, onSalir }) {
  const [hayImagen, setHayImagen] = useState(true);

  const pie = ({ fecha }) => (
    <footer className="bv-pie">
      <span className="bv-fecha"><Calendario />{fecha}</span>
      <button type="button" className="bv-ayuda" onClick={onAyuda}>
        <span className="bv-ayuda-icono" aria-hidden="true">?</span>Ayuda
      </button>
      <button type="button" className="btn-salir bv-salir" onClick={onSalir}>
        <Encendido />Salir
      </button>
    </footer>
  );

  return (
    <MarcoPantalla mostrarMarca={false} pie={pie}>
      <div className="bv-grid">
        <div className="bv-ilustracion">
          {hayImagen ? (
            <img
              src="/icono.png"
              alt="Estudiantes depositando su voto"
              onError={() => setHayImagen(false)}
            />
          ) : (
            <Ilustracion />
          )}
        </div>

        <div className="bv-derecha">
          <h2 className="bv-titulo">Bienvenido</h2>
          <button type="button" className="bv-votar" onClick={onVotar}>
            <span className="bv-votar-icono"><Urna /></span>
            <span className="bv-votar-texto">
              <strong>Votación</strong>
              <span>Participa en la elección</span>
            </span>
            <span className="bv-flecha" aria-hidden="true">›</span>
          </button>
        </div>
      </div>
    </MarcoPantalla>
  );
}
