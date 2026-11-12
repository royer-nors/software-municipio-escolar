import Avatar from "./Avatar";
import ImagenElectoral from "./ImagenElectoral";
import { TONOS } from "../utils/elecciones";

export default function TarjetaLista({ lista, color, seleccionada, onElegir, disabled = false }) {
  const propuestas = Array.isArray(lista.propuestas) ? lista.propuestas : [];
  return (
    <label className={`tarjeta tarjeta-${color}${seleccionada ? " tarjeta-activa" : ""}${disabled ? " tarjeta-deshabilitada" : ""}`}>
      <input className="electoral-radio" type="radio" name="opcion-electoral" value={lista.id}
        checked={seleccionada} onChange={onElegir} disabled={disabled} aria-label={lista.nombre} />
      <span className="electoral-tarjeta-superior"><span>{lista.numero ? `Lista ${lista.numero}` : `ID ${lista.id}`}</span>
        <span className="electoral-selector" aria-hidden="true">{seleccionada ? "✓" : ""}</span></span>
      {lista.logoUrl && <ImagenElectoral src={lista.logoUrl} className="electoral-logo-lista" alt={`Logo de ${lista.nombre}`} />}
      <span className="tarjeta-retratos">
        {lista.candidatos.slice(0, 2).map(c => c.foto_url || c.fotoUrl
          ? <ImagenElectoral key={c.id} className="electoral-foto" src={c.foto_url || c.fotoUrl} alt={c.nombre} />
          : <Avatar key={c.id} tono={TONOS[color]} tam={64} />)}
      </span>
      <span className="tarjeta-nombre">{lista.nombre}</span>
      <span className="electoral-candidatos">
        {lista.candidatos.map(c => <span key={c.id}><strong>{c.nombre}</strong>{c.cargo && <small>{c.cargo}</small>}</span>)}
      </span>
      {propuestas.length > 0 && <span className="electoral-propuestas">
        <strong>Propuestas</strong>{propuestas.map((p, i) => <span key={i}>• {p}</span>)}
      </span>}
      <span className="electoral-elegir">{seleccionada ? "Opción seleccionada" : "Seleccionar lista"}</span>
    </label>
  );
}
