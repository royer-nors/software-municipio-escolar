import Avatar from "./Avatar";

const TONOS = { azul: "#1b5fae", verde: "#1e8a55", morado: "#7447b8", naranja: "#d9770f" };

// Una tarjeta por lista electoral. "color": azul | verde | morado | naranja.
export default function TarjetaLista({ lista, color, seleccionada, onElegir }) {
  const nombres = lista.candidatos.map((c) => c.nombre).join(", ");
  return (
    <button
      type="button"
      role="radio"
      aria-checked={seleccionada}
      title={nombres}
      className={`tarjeta tarjeta-${color}${seleccionada ? " tarjeta-activa" : ""}`}
      onClick={onElegir}
    >
      <div className="tarjeta-retratos">
        {lista.candidatos.slice(0, 2).map((c) => (
          <Avatar key={c.id} tono={TONOS[color]} />
        ))}
      </div>
      <span className="tarjeta-nombre">{lista.nombre}</span>
    </button>
  );
}
