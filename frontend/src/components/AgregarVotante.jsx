import { useRef, useState } from 'react';
import Dialogo from './Dialogo';
import { importarPadron, registrarEstudiante, validarArchivoPadron } from '../api/padron.js';
import '../styles/padron.css';

export default function AgregarVotante({ onVolver, token }) {
  const tokenAdmin = token || sessionStorage.getItem('admin_token') || '';
  const [guardando, setGuardando] = useState(false);
  const [avisoManual, setAvisoManual] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [importando, setImportando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [avisoExcel, setAvisoExcel] = useState(null);
  const [erroresExcel, setErroresExcel] = useState([]);
  const selectorArchivo = useRef(null);
  const ocupado = useRef(false);
  const bloqueado = guardando || importando;
  const [formData, setFormData] = useState({
    dni: '',
    nombres: '',
    apellidos: '',
    grado: '3°',
    seccion: 'A'
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (ocupado.current) return;
    ocupado.current = true;
    setGuardando(true);
    setAvisoManual(null);
    try {
      const estudiante = await registrarEstudiante(formData, tokenAdmin);
      setAvisoManual({ tipo: 'exito', mensaje: `Estudiante ${estudiante.nombre} registrado correctamente.` });
      setFormData(datos => ({ ...datos, dni: '', nombres: '', apellidos: '' }));
    } catch (error) { setAvisoManual({ tipo: 'error', mensaje: error.message }); }
    finally { ocupado.current = false; setGuardando(false); }
  };

  function seleccionarArchivo(e) {
    setArchivo(null);
    setAvisoExcel(null);
    setErroresExcel([]);
    const elegido = e.target.files?.[0];
    if (!elegido) return;
    try { validarArchivoPadron(elegido); setArchivo(elegido); }
    catch (error) { setAvisoExcel({ tipo: 'error', mensaje: error.message }); e.target.value = ''; }
  }

  function solicitarImportacion() {
    setAvisoExcel(null);
    setErroresExcel([]);
    try {
      validarArchivoPadron(archivo);
      if (!tokenAdmin) throw new Error('Inicia sesión como administrador antes de importar.');
      setConfirmar(true);
    } catch (error) { setAvisoExcel({ tipo: 'error', mensaje: error.message }); }
  }

  async function confirmarImportacion() {
    if (ocupado.current) return;
    ocupado.current = true;
    setImportando(true);
    setAvisoManual(null);
    setAvisoExcel(null);
    setErroresExcel([]);
    try {
      const datos = await importarPadron(archivo, tokenAdmin);
      setAvisoExcel({ tipo: 'exito', mensaje: `Importación completada: ${datos.total} ${datos.total === 1 ? 'estudiante importado' : 'estudiantes importados'}; ${datos.reemplazados} ${datos.reemplazados === 1 ? 'estudiante anterior reemplazado' : 'estudiantes anteriores reemplazados'}.` });
      setArchivo(null);
      if (selectorArchivo.current) selectorArchivo.current.value = '';
    } catch (error) {
      setAvisoExcel({ tipo: 'error', mensaje: error.message, incierto: error.incierto });
      setErroresExcel(error.errores || []);
    } finally {
      ocupado.current = false;
      setImportando(false);
      setConfirmar(false);
    }
  }

  return (
    <div className="gestion-padron" style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '8px', maxWidth: '600px', margin: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>👤 Registrar Nuevo Votante</h2>
        <button onClick={onVolver} disabled={bloqueado} style={{ padding: '6px 12px', cursor: 'pointer' }}>Volver</button>
      </div>

      {!tokenAdmin && <p className="padron-aviso padron-error" role="alert">Inicia sesión como administrador para gestionar el padrón.</p>}
      <form onSubmit={handleSubmit}>
        <fieldset disabled={bloqueado || !tokenAdmin} className="padron-formulario">
        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>DNI o ID:</label>
          <input id="votante-dni" type="text" name="dni" value={formData.dni} onChange={handleChange} inputMode="numeric" maxLength={8} pattern="[0-9]{8}" placeholder="Ej: 87654321" required style={{ width: '100%', padding: '8px' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Nombres:</label>
          <input type="text" name="nombres" value={formData.nombres} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
        </div>

        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>Apellidos:</label>
          <input type="text" name="apellidos" value={formData.apellidos} onChange={handleChange} required style={{ width: '100%', padding: '8px' }} />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Grado:</label>
            <select name="grado" value={formData.grado} onChange={handleChange} style={{ width: '100%', padding: '8px' }}>
              <option value="1°">1° Sec</option>
              <option value="2°">2° Sec</option>
              <option value="3°">3° Sec</option>
              <option value="4°">4° Sec</option>
              <option value="5°">5° Sec</option>
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontWeight: 'bold' }}>Sección:</label>
            <select name="seccion" value={formData.seccion} onChange={handleChange} style={{ width: '100%', padding: '8px' }}>
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </div>
        </div>

        <button type="submit" style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '10px', borderRadius: '4px', cursor: 'pointer', marginTop: '10px' }}>
          {guardando ? 'Guardando votante…' : 'Guardar Votante'}
        </button>
        </fieldset>
      </form>
      {avisoManual && <p className={`padron-aviso padron-${avisoManual.tipo}`} role={avisoManual.tipo === 'error' ? 'alert' : 'status'}>{avisoManual.mensaje}</p>}

      <section className="padron-importacion" aria-labelledby="padron-importacion-titulo" aria-busy={importando}>
        <h3 id="padron-importacion-titulo">Importar estudiantes desde Excel</h3>
        <p>Carga el padrón completo en formato .xlsx. Tamaño máximo: 5 MiB.</p>
        <p className="padron-formato">Columnas recomendadas: <strong>DNI, Nombre completo, Grado y Sección</strong>. Guarda el DNI como texto para conservar sus ocho dígitos.</p>
        <p className="padron-advertencia">Esta operación reemplaza el padrón actual. Si ya hay votos registrados, el servidor rechazará la importación.</p>
        <input ref={selectorArchivo} id="padron-archivo" type="file" accept=".xlsx" hidden onChange={seleccionarArchivo} disabled={bloqueado} />
        <div className="padron-archivo-fila">
          <button type="button" className="padron-seleccionar" onClick={() => selectorArchivo.current?.click()} disabled={bloqueado}>Seleccionar archivo Excel</button>
          <span className="padron-archivo-nombre" aria-live="polite">{archivo ? archivo.name : 'Ningún archivo seleccionado'}</span>
        </div>
        <button type="button" className="padron-importar" disabled={!archivo || bloqueado || !tokenAdmin} onClick={solicitarImportacion}>Importar estudiantes</button>
        {importando && <p role="status" className="padron-progreso">Importando estudiantes… No cierres esta pantalla.</p>}
        {avisoExcel && <div className={`padron-aviso padron-${avisoExcel.tipo}`} role={avisoExcel.tipo === 'error' ? 'alert' : 'status'}>
          <p>{avisoExcel.mensaje}</p>
          {avisoExcel.incierto && <p>No se reintentará automáticamente. Verifica el estado del padrón con el encargado antes de repetir la importación.</p>}
        </div>}
        {erroresExcel.length > 0 && <div className="padron-errores" role="region" aria-label="Errores del archivo Excel" tabIndex={0}>
          <table><caption>Corrige estas filas y vuelve a seleccionar el archivo</caption>
            <thead><tr><th scope="col">Fila</th><th scope="col">Campo</th><th scope="col">Error</th></tr></thead>
            <tbody>{erroresExcel.map((error, i) => <tr key={i}><td>{error.fila}</td><td>{error.campo}</td><td>{error.mensaje}</td></tr>)}</tbody>
          </table>
        </div>}
      </section>
      {confirmar && <Dialogo titulo="Confirmar importación del padrón" onCerrar={importando ? undefined : () => setConfirmar(false)}>
        <p className="dialogo-pregunta">¿Deseas importar <strong>{archivo?.name}</strong>?</p>
        <p className="dialogo-aviso">Se reemplazarán todos los estudiantes actuales por los del Excel. No es una carga que solo agregue estudiantes. Si ya existen votos, el backend bloqueará la operación.</p>
        <p className="dialogo-aviso">Verifica que el backend esté conectado a <strong>db_municipio_escolar_pruebas</strong> antes de confirmar.</p>
        {importando && <p role="status">Importando estudiantes… Espera la respuesta del servidor.</p>}
        <div className="dialogo-botones">
          <button type="button" className="btn-claro" disabled={importando} onClick={() => setConfirmar(false)}>Cancelar</button>
          <button type="button" className="padron-importar" disabled={importando} onClick={confirmarImportacion}>{importando ? 'Importando…' : 'Confirmar importación'}</button>
        </div>
      </Dialogo>}
    </div>
  );
}
