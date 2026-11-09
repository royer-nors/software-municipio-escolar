import React, { useState } from 'react';
import AutenticarVotante from './pages/AutenticarVotante';
import VotanteIdentificado from './pages/VotanteIdentificado';
import ListasCandidatos from './pages/ListasCandidatos';
import Resultados from './pages/Resultados';

function App() {
  const [paso, setPaso] = useState('autenticar'); // 'autenticar' | 'identificado' | 'papeleta' | 'resultados'
  const [sesion, setSesion] = useState(null); // { token, estudiante }

  const handleAutenticado = (datos) => {
    setSesion(datos);
    setPaso('identificado');
  };

  const handleCerrarSesion = () => {
    localStorage.removeItem('tokenEstudiante');
    setSesion(null);
    setPaso('autenticar');
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#eef2f6' }}>
      
      {/* Botón flotante para alternar entre Votación y Resultados (vista Admin) */}
      <div style={{ position: 'fixed', top: '12px', right: '12px', zIndex: 9999 }}>
        <button 
          onClick={() => setPaso(paso === 'resultados' ? 'autenticar' : 'resultados')}
          style={{ padding: '8px 14px', fontSize: '12px', borderRadius: '20px', border: 'none', backgroundColor: '#0f172a', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}
        >
          {paso === 'resultados' ? '🗳️ Ver Pantalla Votación' : '📊 Ver Resultados (Admin)'}
        </button>
      </div>

      {/* 1. Identificación con DNI */}
      {paso === 'autenticar' && (
        <AutenticarVotante 
          onAutenticado={handleAutenticado} 
          onSalir={handleCerrarSesion}
        />
      )}

      {/* 2. DNI Confirmado */}
      {paso === 'identificado' && sesion && (
        <VotanteIdentificado 
          estudiante={sesion.estudiante}
          onVotar={() => setPaso('papeleta')}
          onSalir={handleCerrarSesion}
        />
      )}

      {/* 3. Papeleta Electoral y Registro de Voto */}
      {paso === 'papeleta' && sesion && (
        <ListasCandidatos 
          token={sesion.token}
          estudiante={sesion.estudiante}
          onFinalizar={handleCerrarSesion}
          onSalir={handleCerrarSesion}
        />
      )}

      {/* 4. Dashboard de Resultados */}
      {paso === 'resultados' && (
        <Resultados onSalir={handleCerrarSesion} />
      )}

    </div>
  );
}

export default App;