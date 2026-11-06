import { useEffect, useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import TarjetaLista from "../components/TarjetaLista";
import ConfirmarVoto from "../components/ConfirmarVoto";
import VotoRegistrado from "../components/VotoRegistrado";
import { obtenerListas, registrarVoto } from "../api/estudiantes";

const COLORES = ["azul", "verde", "morado", "naranja"];

// Pantalla "Elecciones Municipio Escolar": tarjetas de listas + voto en blanco,
// con los diálogos de confirmar y de voto registrado.
// onFinalizar se llama al pulsar "Finalizar" (el padre cierra la sesión del estudiante).
export default function ListasCandidatos({ token, estudiante, onFinalizar, onSalir }) {
  const [listas, setListas] = useState(null);
  const [error, setError] = useState("");
  const [seleccion, setSeleccion] = useState(null); // { tipo: "lista", nombre } | { tipo: "blanco" }
  const [dialogo, setDialogo] = useState(null); // null | "confirmar" | "registrado"
  const [enviando, setEnviando] = useState(false);
  const [errorVoto, setErrorVoto] = useState("");

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

  function abrirConfirmacion() {
    setErrorVoto("");
    setDialogo("confirmar");
  }

  async function confirmar() {
    setEnviando(true);
    setErrorVoto("");
    try {
      await registrarVoto(token, seleccion);
      setDialogo("registrado");
    } catch (e) {
      setErrorVoto(e.message);
    } finally {
      setEnviando(false);
    }
  }

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
              onElegir={() =>
                setSeleccion({ tipo: "lista", nombre: lista.nombre, numero: lista.numero })
              }
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
          onClick={abrirConfirmacion}
        >
          Votar
        </button>
      </div>

      {dialogo === "confirmar" && (
        <ConfirmarVoto
          seleccion={seleccion}
          enviando={enviando}
          error={errorVoto}
          onConfirmar={confirmar}
          onCancelar={() => setDialogo(null)}
        />
      )}
      {dialogo === "registrado" && <VotoRegistrado onFinalizar={onFinalizar} />}
    </MarcoPantalla>
  );
}
