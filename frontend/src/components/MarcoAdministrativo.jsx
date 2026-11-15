import MarcoPantalla from "./MarcoPantalla";
import MenuAdmin from "./MenuAdmin";
import "../styles/panel-administrativo.css";

export default function MarcoAdministrativo({ children, usuario, onSeguridad, onConsultores, onCerrarSesion, electoral = false }) {
  return (
    <div className={`pantalla-administracion${electoral ? " admin-vista-resultados" : ""}`}>
      <MarcoPantalla
        electoral={electoral}
        mostrarMarca={false}
        mostrarLema={false}
        complementoCabecera={<div className="admin-utilidades"><span className="admin-etiqueta-area">Administración electoral</span><MenuAdmin usuario={usuario} onSeguridad={onSeguridad} onConsultores={onConsultores} onCerrarSesion={onCerrarSesion} /></div>}
        pie={({ fecha, hora }) => <footer className="marco-pie admin-pie"><span className="marco-fecha">{fecha}</span><span className="marco-hora">{hora}</span></footer>}
      >{children}</MarcoPantalla>
    </div>
  );
}
