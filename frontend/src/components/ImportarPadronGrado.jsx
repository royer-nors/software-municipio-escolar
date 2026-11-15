import { useRef, useState } from 'react';
import Dialogo from './Dialogo';
import { importarPadron, previsualizarPadron, validarArchivoPadron } from '../api/padron';
const etiquetas = { agregados: 'Se agregarán', actualizados: 'Se actualizarán', eliminados: 'Se eliminarán', sinCambios: 'Sin cambios' };
export default function ImportarPadronGrado({ token, bloqueado = false }) {
  const [grado, setGrado] = useState(''), [modo, setModo] = useState('agregar'), [archivo, setArchivo] = useState(null);
  const [vista, setVista] = useState(null), [error, setError] = useState(''), [errores, setErrores] = useState([]), [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false), [confirmar, setConfirmar] = useState(false), [pagina, setPagina] = useState(0);
  const envio = useRef(false), selector = useRef(null);
  function limpiarVista() { setVista(null); setConfirmar(false); setPagina(0); setError(''); setErrores([]); setAviso(''); }
  async function previsualizar() {
    if (envio.current) return;
    limpiarVista(); envio.current = true; setOcupado(true);
    try { setVista(await previsualizarPadron(archivo, grado, modo, token)); }
    catch (e) { setError(e.message); setErrores(e.errores || []); }
    finally { envio.current = false; setOcupado(false); }
  }
  async function ejecutar(e) {
    e.preventDefault(); if (envio.current || !vista) return;
    envio.current = true; setOcupado(true); const id = vista.vistaPreviaId;
    setVista(null); setConfirmar(false); setError('');
    try {
      const r = await importarPadron(id, token);
      setAviso(`Grado ${r.grado}: ${r.cantidades.agregados} agregados, ${r.cantidades.actualizados} actualizados y ${r.cantidades.eliminados} eliminados. Los otros grados se conservaron.`);
      setArchivo(null); if (selector.current) selector.current.value = '';
    } catch (e) { setError(e.message); }
    finally { envio.current = false; setOcupado(false); }
  }
  const deshabilitado = ocupado || bloqueado || !token;
  return <section className="padron-importacion" aria-busy={ocupado}>
    <h3>Importar Excel por grado</h3>
    <p>Selecciona el grado, revisa la vista previa y confirma. La elección debe estar cerrada y sin votos ni marcas de participación.</p>
    <fieldset className="padron-formulario" disabled={deshabilitado}>
      <label htmlFor="padron-grado">Grado del Excel</label>
      <select id="padron-grado" value={grado} onChange={e => { setGrado(e.target.value); limpiarVista(); }}>
        <option value="">Selecciona un grado</option>{[1, 2, 3, 4, 5].map(g => <option key={g} value={g}>{g}.º de secundaria</option>)}
      </select>
      <label htmlFor="padron-modo">Operación</label>
      <select id="padron-modo" value={modo} onChange={e => { setModo(e.target.value); limpiarVista(); }}>
        <option value="agregar">Agregar sin reemplazar estudiantes existentes</option><option value="reemplazar">Reemplazar únicamente el grado seleccionado</option>
      </select>
      <p>Excel .xlsx de hasta 5 MiB y 10 000 filas. Columnas: DNI, Nombre completo, Sección. Grado es opcional; si existe debe coincidir con el seleccionado. Guarda el DNI como texto de ocho dígitos.</p>
      <a href={`${import.meta.env.BASE_URL}plantilla_padron_por_grado.xlsx`} download>Descargar plantilla Excel de ejemplo</a>
      <input ref={selector} id="padron-archivo" type="file" accept=".xlsx" onChange={e => {
        limpiarVista(); setArchivo(null); const f = e.target.files?.[0]; if (!f) return;
        try { validarArchivoPadron(f); setArchivo(f); } catch (error) { setError(error.message); e.target.value = ''; }
      }} />
      <button type="button" className="padron-importar" disabled={!grado || !archivo} onClick={previsualizar}>Ver vista previa</button>
    </fieldset>
    {error && <p role="alert" className="padron-aviso padron-error">{error}</p>}
    {aviso && <p role="status" className="padron-aviso padron-exito">{aviso}</p>}
    {errores.length > 0 && <ul>{errores.map((e, i) => <li key={i}>Fila {e.fila}: {e.campo} · {e.mensaje}</li>)}</ul>}
    {vista && <div className="padron-errores">
      <h4>Vista previa · {vista.grado}.º · {vista.modo === 'reemplazar' ? 'Reemplazo del grado' : 'Agregar'}</h4>
      <p>Vence: {new Date(vista.venceEn).toLocaleString('es-PE')}. Si los datos cambian, deberás generar otra.</p>
      <ul>{Object.entries(etiquetas).map(([k, nombre]) => <li key={k}>{nombre}: {vista.cantidades[k]}</li>)}</ul>
      <table><caption>Estudiantes del archivo ({vista.estudiantes.length})</caption><thead><tr><th>DNI</th><th>Nombre</th><th>Grado</th><th>Sección</th><th>Acción</th></tr></thead>
        <tbody>{vista.estudiantes.slice(pagina * 50, (pagina + 1) * 50).map(e => <tr key={e.dni}><td>{e.dni}</td><td>{e.nombre}</td><td>{e.grado}</td><td>{e.seccion || '—'}</td><td>{e.accion}</td></tr>)}</tbody></table>
      <button type="button" disabled={pagina === 0 || deshabilitado} onClick={() => setPagina(p => p - 1)}>Anterior</button>
      <button type="button" disabled={(pagina + 1) * 50 >= vista.estudiantes.length || deshabilitado} onClick={() => setPagina(p => p + 1)}>Siguiente</button>
      {vista.eliminados.length > 0 && <details><summary>Estudiantes que saldrán de este grado ({vista.eliminados.length})</summary><ul>{vista.eliminados.map(e => <li key={e.dni}>{e.dni} · {e.nombre} · {e.grado} · {e.seccion || '—'}</li>)}</ul></details>}
      <button type="button" className="padron-importar" disabled={deshabilitado} onClick={() => setConfirmar(true)}>Revisar y confirmar importación</button>
    </div>}
    {confirmar && vista && <Dialogo titulo="Confirmar importación por grado" onCerrar={() => setConfirmar(false)}>
      <form onSubmit={ejecutar}>
        <p>Se modificará únicamente {vista.grado}.º de secundaria. Los demás grados, administradores, consultores, listas y candidatos se conservarán.</p>
        <ul>{Object.entries(etiquetas).map(([k, nombre]) => <li key={k}>{nombre}: {vista.cantidades[k]}</li>)}</ul>
        <label><input type="checkbox" required />He revisado la vista previa y confirmo {vista.modo === 'reemplazar' ? 'el reemplazo del grado y sus eliminaciones' : 'la carga del grado'}.</label>
        <button type="button" onClick={() => setConfirmar(false)}>Cancelar</button><button disabled={deshabilitado}>Confirmar importación</button>
      </form>
    </Dialogo>}
  </section>;
}
