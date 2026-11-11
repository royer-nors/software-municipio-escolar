import Dialogo from "./Dialogo";
export default function AtencionElectoral({ mensaje, incierto = false, onAceptar }) {
  return (
    <Dialogo titulo="Atención">
      <div className="electoral-aviso-icono" aria-hidden="true">!</div>
      <p className="dialogo-pregunta">{mensaje}</p>
      <p className="dialogo-aviso">{incierto
        ? "No vuelvas a confirmar este voto. Identifícate de nuevo para consultar tu habilitación; si la duda continúa, avisa al encargado."
        : "Cada estudiante puede emitir un solo voto por elección."}</p>
      <div className="dialogo-centro">
        <button type="button" className="btn-verde" onClick={onAceptar} autoFocus>{incierto ? "Volver a identificarme" : "Aceptar"}</button>
      </div>
    </Dialogo>
  );
}
