import { useRef, useState } from 'react';
import ImportarPadronGrado from './ImportarPadronGrado';
import { registrarEstudiante } from '../api/padron.js';
import '../styles/padron.css';

export default function AgregarVotante({ onVolver, token }) {
  const tokenAdmin = token || sessionStorage.getItem('admin_token') || '';
  const [guardando, setGuardando] = useState(false);
  const [avisoManual, setAvisoManual] = useState(null);
  const ocupado = useRef(false);
  const bloqueado = guardando;
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

      <ImportarPadronGrado token={tokenAdmin} bloqueado={bloqueado} />
    </div>
  );
}
