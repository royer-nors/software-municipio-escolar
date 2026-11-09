import React, { useEffect, useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import { obtenerResultados } from "../api/estudiantes";

export default function Resultados({ onSalir }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const tokenAdmin = localStorage.getItem("tokenAdmin") || "";
    obtenerResultados(tokenAdmin)
      .then((datos) => setData(datos))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <MarcoPantalla onSalir={onSalir}>
      <div style={{ padding: "20px", maxWidth: "900px", margin: "0 auto" }}>
        <h2>📊 Resultados Electorales (PostgreSQL)</h2>

        {error && <p className="estado estado-error" role="alert">⚠️ {error}</p>}
        {!error && !data && <p className="estado">Cargando datos del servidor...</p>}

        {data && (
          <>
            {/* Tarjetas informativas */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "15px", marginBottom: "25px" }}>
              <div className="panel" style={{ textAlign: "center" }}>
                <span className="etiqueta">Habilitados</span>
                <h3 style={{ fontSize: "22px", color: "#2563eb", margin: "5px 0" }}>{data.estudiantesHabilitados}</h3>
              </div>
              <div className="panel" style={{ textAlign: "center" }}>
                <span className="etiqueta">Votos Emitidos</span>
                <h3 style={{ fontSize: "22px", color: "#16a34a", margin: "5px 0" }}>{data.votosEmitidos}</h3>
              </div>
              <div className="panel" style={{ textAlign: "center" }}>
                <span className="etiqueta">Participación</span>
                <h3 style={{ fontSize: "22px", color: "#d97706", margin: "5px 0" }}>{data.participacionElectoral}%</h3>
              </div>
              <div className="panel" style={{ textAlign: "center" }}>
                <span className="etiqueta">Blancos / Nulos</span>
                <h3 style={{ fontSize: "22px", color: "#475569", margin: "5px 0" }}>{data.votosBlancosNulos}</h3>
              </div>
            </div>

            {/* Tabla de Resultados por Lista */}
            <div className="panel">
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #cbd5e1" }}>
                    <th style={{ padding: "10px" }}>Posición</th>
                    <th style={{ padding: "10px" }}>Lista Electoral</th>
                    <th style={{ padding: "10px" }}>Votos Válidos</th>
                    <th style={{ padding: "10px" }}>Porcentaje</th>
                  </tr>
                </thead>
                <tbody>
                  {data.listas?.map((l, index) => (
                    <tr key={l.id || index} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px", fontWeight: "bold" }}>#{index + 1}</td>
                      <td style={{ padding: "10px" }}>{l.nombre}</td>
                      <td style={{ padding: "10px" }}>{l.votos}</td>
                      <td style={{ padding: "10px", color: "#2563eb", fontWeight: "bold" }}>{l.porcentaje}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </MarcoPantalla>
  );
}