import Dialogo from "./Dialogo";

// Diálogo "Confirmar voto".
// seleccion = { tipo: "lista", nombre, numero? } o { tipo: "blanco" }
export default function ConfirmarVoto({ seleccion, enviando, error, bloqueado = false, onConfirmar, onCancelar }) {
  const opcion =
    seleccion.tipo === "blanco"
      ? "Voto en blanco"
      : seleccion.numero
        ? `Lista ${seleccion.numero} — ${seleccion.nombre}`
        : seleccion.nombre;

  return (
    <Dialogo titulo="Confirmar voto" onCerrar={enviando ? undefined : onCancelar}>
      <p className="dialogo-pregunta">¿Deseas registrar esta opción?</p>
      <p className="dialogo-opcion">{opcion}</p>
      <p className="dialogo-aviso">Después de confirmar no podrás cambiar tu voto.</p>
      {error && <p className="dialogo-error" role="alert">{error}</p>}
      {bloqueado && <p className="dialogo-error" role="alert">El estado de la elección cambió. Cancela y revisa las opciones disponibles.</p>}
      <div className="dialogo-botones">
        <button type="button" className="btn-claro" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="button" className="btn-verde" onClick={onConfirmar} disabled={enviando || bloqueado}>
          {enviando ? "Registrando…" : "Confirmar voto"}
        </button>
      </div>
    </Dialogo>
  );
}
