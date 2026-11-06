import Dialogo from "./Dialogo";

// Diálogo "Voto registrado". No se puede cerrar: solo con "Finalizar".
export default function VotoRegistrado({ onFinalizar }) {
  return (
    <Dialogo titulo="Voto registrado">
      <p className="dialogo-exito">Tu voto se registró correctamente.</p>
      <p className="dialogo-aviso">
        Tu sesión finalizará para que pueda ingresar el siguiente estudiante.
      </p>
      <div className="dialogo-centro">
        <button type="button" className="btn-verde" onClick={onFinalizar} autoFocus>
          Finalizar
        </button>
      </div>
    </Dialogo>
  );
}
