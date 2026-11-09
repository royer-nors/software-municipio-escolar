import React, { useState } from 'react';

export default function AgregarCandidatos({ onVolver }) {
  const [lista, setLista] = useState({
    numeroLista: '',
    nombreLista: '',
    candidatoAlcalde: '',
    propuesta1: '',
    propuesta2: '',
    planTrabajo: null
  });

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'planTrabajo') {
      setLista({ ...lista, planTrabajo: files[0] });
    } else {
      setLista({ ...lista, [name]: value });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Lista registrada:", lista);
    alert(`Lista "${lista.nombreLista}" registrada correctamente.`);
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 'calc(100vh - 160px)',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '12px',
        padding: '25px 30px',
        maxWidth: '650px',
        width: '100%',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.08)',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#1e293b', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🍊</span> Registrar Lista de Candidatos
          </h2>
          <button 
            onClick={onVolver} 
            style={{
              padding: '6px 16px',
              backgroundColor: '#64748b',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            Volver
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#334155', fontSize: '14px' }}>
              Número de Lista:
            </label>
            <input 
              type="number" 
              name="numeroLista" 
              value={lista.numeroLista} 
              onChange={handleChange} 
              placeholder="Ej: 1" 
              required 
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#0f172a',
                boxSizing: 'border-box'
              }} 
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#334155', fontSize: '14px' }}>
              Nombre de la Lista:
            </label>
            <input 
              type="text" 
              name="nombreLista" 
              value={lista.nombreLista} 
              onChange={handleChange} 
              placeholder="Ej: Juntos por un mejor futuro" 
              required 
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#0f172a',
                boxSizing: 'border-box'
              }} 
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#334155', fontSize: '14px' }}>
              Candidato a Alcalde/sa:
            </label>
            <input 
              type="text" 
              name="candidatoAlcalde" 
              value={lista.candidatoAlcalde} 
              onChange={handleChange} 
              placeholder="Nombre completo" 
              required 
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#0f172a',
                boxSizing: 'border-box'
              }} 
            />
          </div>

          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#334155', fontSize: '14px' }}>
              Propuestas Principales:
            </label>
            <input 
              type="text" 
              name="propuesta1" 
              value={lista.propuesta1} 
              onChange={handleChange} 
              placeholder="Propuesta 1" 
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#0f172a',
                marginBottom: '8px',
                boxSizing: 'border-box'
              }} 
            />
            <input 
              type="text" 
              name="propuesta2" 
              value={lista.propuesta2} 
              onChange={handleChange} 
              placeholder="Propuesta 2" 
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#0f172a',
                boxSizing: 'border-box'
              }} 
            />
          </div>

          {/* OPCIÓN ADICIONAL: Cargar Plan de Trabajo (Opcional) */}
          <div>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px', color: '#334155', fontSize: '14px' }}>
              Plan de Trabajo (Opcional - PDF / Doc):
            </label>
            <input 
              type="file" 
              name="planTrabajo" 
              accept=".pdf,.doc,.docx"
              onChange={handleChange} 
              style={{
                width: '100%',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#f8fafc',
                color: '#334155',
                boxSizing: 'border-box'
              }} 
            />
          </div>

          <button 
            type="submit" 
            style={{
              backgroundColor: '#16a34a',
              color: '#fff',
              border: 'none',
              padding: '12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '15px',
              marginTop: '10px'
            }}
          >
            Guardar Lista de Candidatos
          </button>
        </form>
      </div>
    </div>
  );
}