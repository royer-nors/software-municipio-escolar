import { useEffect, useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import TarjetaLista from "../components/TarjetaLista";
import { obtenerListas } from "../api/estudiantes";

const COLORES = ["azul", "verde", "morado", "naranja"];

// Pantalla "Elecciones Municipio Escolar": tarjetas de listas + voto en blanco.
// onVotar recibe { tipo: "lista", nombre } o { tipo: "blanco" }.
// Registrar el voto lo hace quien implemente el diálogo de confirmación y el endpoint.
export default function ListasCandidatos({ token, estudiante, onVotar, onSalir }) {
  const [listas, setListas] = useState(null);
  const [error, setError] = useState("");
  const [seleccion, setSeleccion] = useState(null);

  useEffect(() => {
    let activo = true;
    obtenerListas(token)
      .then((datos) => activo && setListas(datos))
      .catch((e) => activo && setError(e.message));
    return () => {
      activo = false;
    };
  }, [token]);

  const esLista = (nombre) => seleccion?.tipo === "lista" && seleccion.nombre === nombre;

  return (
    <MarcoPantalla onSalir={onSalir}>
      <div className="lista-cabecera">
        <div>
          <h2>Elecciones Municipio Escolar</h2>
          <p>Haz clic en la tarjeta de tu preferencia.</p>
        </div>
        <div className="lista-votante">
          <span>Votante: {estudiante.nombre}</span>
          <span>DNI: {estudiante.dni}</span>
        </div>
      </div>

      {error && <p className="estado estado-error" role="alert">{error}</p>}
      {!error && !listas && <p className="estado">Cargando listas…</p>}
      {listas && listas.length === 0 && (
        <p className="estado">Todavía no hay listas registradas.</p>
      )}

      {listas && listas.length > 0 && (
        <div className="tarjetas" role="radiogroup" aria-label="Listas electorales">
          {listas.map((lista, i) => (
            <TarjetaLista
              key={lista.nombre}
              lista={lista}
              color={COLORES[i % COLORES.length]}
              seleccionada={esLista(lista.nombre)}
              onElegir={() => setSeleccion({ tipo: "lista", nombre: lista.nombre })}
            />
          ))}
        </div>
      )}

      <div className="barra-votar">
        <button
          type="button"
          role="radio"
          aria-checked={seleccion?.tipo === "blanco"}
          className="btn-blanco"
          onClick={() => setSeleccion({ tipo: "blanco" })}
        >
          Voto en blanco
        </button>
        <p className="cuadro-info">
          Haz clic en una tarjeta para seleccionarla. Luego pulsa Votar para confirmar tu elección.
        </p>
        <button
          type="button"
          className="btn-verde"
          disabled={!seleccion}
          onClick={() => onVotar(seleccion)}
        >
          Votar
        </button>
      </div>
    </MarcoPantalla>
  );
}
