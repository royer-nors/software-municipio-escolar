import React, { useState } from 'react';
import AgregarVotante from './components/AgregarVotante';
import AgregarCandidatos from './components/AgregarCandidatos';
import MarcoPantalla from './components/MarcoPantalla';

function App() {
  const [vistaActual, setVistaActual] = useState('menu');

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#eef2f6' }}>
      <MarcoPantalla>
        {vistaActual === 'menu' && (
          <div style={{ display: 'flex', gap: '20px', padding: '20px', minHeight: 'calc(100vh - 140px)', boxSizing: 'border-box' }}>
            
            {/* Panel Izquierdo - Lateral de Configuración */}
            <div style={{ width: '260px', backgroundColor: '#0284c7', color: '#fff', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                  <span style={{ fontSize: '28px' }}>⚙️</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>Configuración</h3>
                    <p style={{ margin: 0, fontSize: '11px', opacity: 0.9 }}>Administra y personaliza el sistema de votación.</p>
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'center', fontSize: '13px', fontStyle: 'italic', opacity: 0.95 }}>
                "Una buena configuración garantiza un proceso electoral seguro y transparente."
              </div>
            </div>

            {/* Panel Central - Lista de Opciones */}
            <div style={{ flex: 1, backgroundColor: '#fff', borderRadius: '12px', padding: '20px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                <span style={{ fontSize: '24px' }}>⚙️</span>
                <div>
                  <h3 style={{ margin: 0, color: '#1e293b' }}>Configurar Sistema de Votación</h3>
                  <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>Selecciona la opción que deseas configurar:</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                
                {/* Opciones inhabilitadas */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 15px', backgroundColor: '#f8fafc', borderRadius: '8px', opacity: 0.5, border: '1px solid #e2e8f0', cursor: 'not-allowed' }}>
                  <span style={{ fontSize: '20px', marginRight: '12px' }}>🏫</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#334155' }}>Configurar centro educativo</strong>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Datos de la I.E., año electoral y parámetros generales.</span>
                  </div>
                  <span>›</span>
                </div>

                {/* BOTÓN 1: HABILITADO */}
                <div 
                  onClick={() => setVistaActual('votante')}
                  style={{ display: 'flex', alignItems: 'center', padding: '12px 15px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '2px solid #2563eb', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '20px', marginRight: '12px' }}>👤</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#1e40af' }}>Agregar un votante</strong>
                    <span style={{ fontSize: '11px', color: '#1d4ed8' }}>Registra manualmente a un votante (estudiante).</span>
                  </div>
                  <span style={{ color: '#2563eb', fontWeight: 'bold' }}>›</span>
                </div>

                {/* BOTÓN 2: HABILITADO */}
                <div 
                  onClick={() => setVistaActual('candidatos')}
                  style={{ display: 'flex', alignItems: 'center', padding: '12px 15px', backgroundColor: '#f0fdf4', borderRadius: '8px', border: '2px solid #16a34a', cursor: 'pointer' }}
                >
                  <span style={{ fontSize: '20px', marginRight: '12px' }}>🍊</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#15803d' }}>Agregar candidatos</strong>
                    <span style={{ fontSize: '11px', color: '#16a34a' }}>Registra a los candidatos de cada lista.</span>
                  </div>
                  <span style={{ color: '#16a34a', fontWeight: 'bold' }}>›</span>
                </div>

                {/* Opciones inhabilitadas adicionales */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 15px', backgroundColor: '#f8fafc', borderRadius: '8px', opacity: 0.5, border: '1px solid #e2e8f0', cursor: 'not-allowed' }}>
                  <span style={{ fontSize: '20px', marginRight: '12px' }}>🗳️</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#334155' }}>Configurar voto en blanco</strong>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Activa o desactiva la opción de voto en blanco.</span>
                  </div>
                  <span>›</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', padding: '12px 15px', backgroundColor: '#f8fafc', borderRadius: '8px', opacity: 0.5, border: '1px solid #e2e8f0', cursor: 'not-allowed' }}>
                  <span style={{ fontSize: '20px', marginRight: '12px' }}>🔒</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{ display: 'block', fontSize: '14px', color: '#334155' }}>Seguridad</strong>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Cambia contraseñas y gestiona accesos al sistema.</span>
                  </div>
                  <span>›</span>
                </div>

              </div>
            </div>

            {/* Panel Derecho */}
            <div style={{ width: '220px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div style={{ backgroundColor: '#e0f2fe', padding: '15px', borderRadius: '10px', fontSize: '12px', color: '#0369a1' }}>
                <strong>ℹ️ Importante</strong>
                <p style={{ margin: '5px 0 0 0' }}>Solo el personal autorizado puede acceder a la configuración del sistema.</p>
              </div>
              <div style={{ backgroundColor: '#f0fdf4', padding: '15px', borderRadius: '10px', fontSize: '12px', color: '#15803d' }}>
                <strong>🛡️ Mantén la seguridad</strong>
                <p style={{ margin: '5px 0 0 0' }}>Usa contraseñas seguras y no compartas tus accesos.</p>
              </div>
            </div>

          </div>
        )}

        {vistaActual === 'votante' && (
          <AgregarVotante onVolver={() => setVistaActual('menu')} />
        )}

        {vistaActual === 'candidatos' && (
          <AgregarCandidatos onVolver={() => setVistaActual('menu')} />
        )}
      </MarcoPantalla>
    </div>
  );
}

export default App;
