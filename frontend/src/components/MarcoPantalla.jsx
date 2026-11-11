import { useEffect, useState } from "react";
import "../styles/estudiante.css";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "setiembre", "octubre", "noviembre", "diciembre",
];

function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return ahora;
}

// Marco compartido; etiquetaCabecera añade una leyenda opcional al encabezado,
// sin cambiar el escudo ni las pantallas existentes.
export default function MarcoPantalla({ children, onSalir, mostrarMarca = true, pie, etiquetaCabecera = null }) {
  const ahora = useAhora();
  const fecha = `${DIAS[ahora.getDay()]}, ${ahora.getDate()} de ${MESES[ahora.getMonth()]} de ${ahora.getFullYear()}`;
  const hora = ahora.toLocaleTimeString("es-PE", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div className="marco">
      <header className="marco-cabecera">
        <img
          className="marco-logo"
          src="logoo.png"
          alt="Escudo de la institución"
          onError={(e) => (e.currentTarget.style.visibility = "hidden")}
        />
        <div className="marco-colegio">
          <h1>I.E Micaela Bastidas Puyucahua</h1>
          <p>Tamburco - Abancay - Apurímac</p>
        </div>
        <p className="marco-lema">Tu voz también construye una mejor institución</p>
        {etiquetaCabecera && (
          <span className="marco-etiqueta-cabecera">{etiquetaCabecera}</span>
        )}
        {mostrarMarca && (
          <div className="marco-marca">
            <strong>MUNICIPIO ESCOLAR</strong>
            <span>Participa • Propón • Construye</span>
          </div>
        )}
      </header>

      <main className="marco-contenido">{children}</main>

      {pie ? (
        pie({ fecha, hora })
      ) : (
        <footer className="marco-pie">
          <span className="marco-fecha">{fecha}</span>
          <span className="marco-hora">{hora}</span>
          <button type="button" className="btn-salir" onClick={onSalir}>Salir</button>
        </footer>
      )}
    </div>
  );
}
