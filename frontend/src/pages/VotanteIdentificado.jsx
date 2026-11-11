import MarcoPantalla from "../components/MarcoPantalla";
import Avatar from "../components/Avatar";
import PasosVotacion from "../components/PasosVotacion";
import "../styles/elecciones.css";

export default function VotanteIdentificado({ estudiante, onVotar, onSalir }) {
  return (
    <MarcoPantalla electoral onSalir={onSalir}>
      <div className="electoral-seccion-label">IDENTIFICACIÓN DEL ESTUDIANTE</div>
      <div className="id-grid">
        <section className="panel electoral-identificado">
          <div className="panel-cabecera">
            <span className="electoral-icono" aria-hidden="true">✓</span>
            <div><h2>AUTENTICAR VOTANTE</h2><p>Identidad validada. Verifica tus datos antes de continuar.</p></div>
          </div>
          <p className="etiqueta">DNI</p>
          <div className="campo-dni"><span>{estudiante.dni}</span><span className="check" aria-label="Validado">✓</span></div>
          <p className="aviso-ok">DNI validado. ¡Bienvenido!</p>
          <div className="votante-card">
            <Avatar tam={64} />
            <div className="votante-datos"><span className="electoral-micro">VOTANTE IDENTIFICADO</span>
              <strong>{estudiante.nombre}</strong><span>DNI: {estudiante.dni}</span>
              {(estudiante.grado || estudiante.seccion) && <span>
                {estudiante.grado && <>Grado: {estudiante.grado} </>}{estudiante.seccion && <>Sección: {estudiante.seccion}</>}
              </span>}
            </div><span className="insignia">✓ Habilitado</span>
          </div>
          <p className="electoral-nota">Tu identidad se utilizará para verificar tu habilitación. Tu elección es confidencial.</p>
        </section>
        <PasosVotacion identificado onVotar={onVotar} />
      </div>
    </MarcoPantalla>
  );
}
