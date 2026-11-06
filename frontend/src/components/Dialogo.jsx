import { useEffect, useRef } from "react";
import "../styles/dialogo.css";

// Ventana modal sobre la pantalla (usa <dialog>: bloquea lo de atrás y maneja el foco).
// Si pasas onCerrar se muestra la "×" y la tecla Esc cierra; sin onCerrar no se puede cerrar.
export default function Dialogo({ titulo, onCerrar, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (dialogo && !dialogo.open) dialogo.showModal();
    return () => {
      if (dialogo?.open) dialogo.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialogo"
      aria-labelledby="dialogo-titulo"
      onCancel={(e) => {
        e.preventDefault();
        onCerrar?.();
      }}
    >
      <div className="dialogo-barra">
        <h2 id="dialogo-titulo">{titulo}</h2>
        {onCerrar && (
          <button type="button" className="dialogo-x" aria-label="Cerrar" onClick={onCerrar}>×</button>
        )}
      </div>
      <div className="dialogo-cuerpo">{children}</div>
    </dialog>
  );
}
