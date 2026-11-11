export default function PasosVotacion({ identificado = false, onVotar }) {
  return (
    <aside className="panel electoral-pasos">
      <h2><span aria-hidden="true">✓</span> Proceso de votación</h2>
      <ol className="pasos">
        <li><span className="paso-num">1</span>Ingresa tu DNI</li>
        <li><span className="paso-num">2</span>{identificado ? "Identidad validada" : "El sistema valida tu identidad"}</li>
        <li><span className="paso-num">3</span>{identificado ? "Puedes emitir tu voto" : "Si es válido, podrás votar"}</li>
      </ol>
      <div className="listo">
        <strong>{identificado ? "¡Todo listo para votar!" : "Votación segura"}</strong>
        <p>{identificado ? "Revisa tus datos y continúa a la papeleta electoral." : "Tu voto es confidencial y se registra una sola vez."}</p>
      </div>
      {onVotar && <button type="button" className="btn-verde" onClick={onVotar}>Votar <span aria-hidden="true">→</span></button>}
    </aside>
  );
}
