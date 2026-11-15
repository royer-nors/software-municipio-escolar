import { useEffect, useRef } from "react";
import Icono from "./IconoAdministrativo";

export default function MenuAdmin({ usuario, onSeguridad, onCerrarSesion }) {
  const menu = useRef(null);

  useEffect(() => {
    function cerrarFuera(evento) {
      if (!menu.current?.contains(evento.target)) menu.current?.removeAttribute("open");
    }
    document.addEventListener("pointerdown", cerrarFuera);
    return () => document.removeEventListener("pointerdown", cerrarFuera);
  }, []);

  function ejecutar(accion) {
    menu.current.removeAttribute("open");
    accion();
  }

  return (
    <details ref={menu} className="admin-cuenta" onKeyDown={evento => {
      if (evento.key === "Escape") {
        menu.current.removeAttribute("open");
        menu.current.querySelector("summary").focus();
      }
    }}>
      <summary aria-label={`Cuenta de ${usuario}`}><span className="admin-avatar" aria-hidden="true">{usuario?.charAt(0).toUpperCase() || "A"}</span><span>{usuario}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></summary>
      <div className="admin-cuenta-opciones">
        <button type="button" aria-label="Seguridad" onClick={() => ejecutar(onSeguridad)}><Icono nombre="escudo" width="21" height="21" /><span><strong>Seguridad</strong><small>Contraseña de tu cuenta</small></span></button>
        <button type="button" aria-label="Cerrar sesión" aria-describedby="admin-destino-salida" className="admin-cuenta-salir" onClick={() => ejecutar(onCerrarSesion)}><Icono nombre="salir" width="21" height="21" /><span><strong>Cerrar sesión</strong><small id="admin-destino-salida">Volver al selector de acceso</small></span></button>
      </div>
    </details>
  );
}
