import "../styles/panel-administrativo.css";
import Icono from "./IconoAdministrativo";

export default function NavegacionAdministrativa({ onVolver }) {
  return <nav className="admin-navegacion" aria-label="Navegación administrativa"><button type="button" className="admin-regresar" onClick={onVolver}><Icono nombre="volver" width="18" height="18" />Volver al panel</button></nav>;
}
