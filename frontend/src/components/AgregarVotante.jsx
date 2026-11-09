import React, { useState } from 'react';

export default function AgregarVotante({ onVolver }) {
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

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Votante a registrar:", formData);
    alert(`Estudiante ${formData.nombres} registrado con éxito`);
  };

  return (
    <div style={{ padding: '20px', backgroundColor: '#fff', borderRadius: '8px', maxWidth: '600px', margin: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>👤 Registrar Nuevo Votante</h2>
        <button onClick={onVolver} style={{ padding: '6px 12px', cursor: 'pointer' }}>Volver</button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '15px' }}>
        <div>
          <label style={{ display: 'block', fontWeight: 'bold' }}>DNI o ID:</label>
          <input type="text" name="dni" value={formData.dni} onChange={handleChange} placeholder="Ej: 87654321" required style={{ width: '100%', padding: '8px' }} />
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
          Guardar Votante
        </button>
      </form>
    </div>
  );
}