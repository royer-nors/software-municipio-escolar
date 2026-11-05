import MarcoPantalla from "../components/MarcoPantalla";
import Avatar from "../components/Avatar";

// Pantalla "Votante identificado" (tras validar el DNI).
// estudiante = { nombre, dni }  ->  viene de loginEstudiante().
export default function VotanteIdentificado({ estudiante, onVotar, onSalir }) {
  return (
    <MarcoPantalla onSalir={onSalir}>
      <div className="id-grid">
        <section className="panel">
          <div className="panel-cabecera">
            <span className="icono-caja" aria-hidden="true">✓</span>
            <div>
              <h2>Autenticar votante</h2>
              <p>Identidad validada. Verifica tus datos antes de continuar.</p>
            </div>
          </div>

          <p className="etiqueta">DNI</p>
          <div className="campo-dni">
            <span>{estudiante.dni}</span>
            <span className="check" aria-hidden="true">✓</span>
          </div>
          <p className="aviso-ok">DNI validado. ¡Bienvenido!</p>

          <div className="votante-card">
            <Avatar tam={56} />
            <div className="votante-datos">
              <strong>{estudiante.nombre}</strong>
              <span>DNI: {estudiante.dni}</span>
            </div>
            <span className="insignia">Habilitado</span>
          </div>
          <p className="nota">Tu identidad fue validada. Ahora puedes pasar a la votación.</p>
        </section>

        <aside className="panel">
          <h2>Proceso de votación</h2>
          <ol className="pasos">
            <li><span className="paso-num">1</span>Ingresa tu DNI</li>
            <li><span className="paso-num">2</span>Identidad validada</li>
            <li><span className="paso-num">3</span>Puedes emitir tu voto</li>
          </ol>
          <div className="listo">
            <strong>¡Listo!</strong>
            <p>Tu identidad ha sido verificada. Ya puedes emitir tu voto.</p>
          </div>
          <button type="button" className="btn-verde" onClick={onVotar}>Votar</button>
          <p className="nota">Continuar a las listas electorales</p>
        </aside>
      </div>
    </MarcoPantalla>
  );
}
