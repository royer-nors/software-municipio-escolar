
import { useState } from "react";
import "../styles/impresion-resultados.css";

const listas = [
  { nombre: "Lista 1", lema: "Juntos por un mejor futuro", votos: 501, color: "#1762ad" },
  { nombre: "Lista 2", lema: "Unidos por el cambio", votos: 328, color: "#168052" },
  { nombre: "Lista 3", lema: "Ideas que transforman", votos: 104, color: "#7848c5" },
  { nombre: "Lista 4", lema: "La fuerza de todos", votos: 67, color: "#df800d" }
];

const habilitados = 1200;
const emitidos = 1000;
const totalValidos = listas.reduce((s, l) => s + l.votos, 0);
const participacion = (emitidos / habilitados * 100).toFixed(1);

export default function PruebaResultados() {
  const [imprimir, setImprimir] = useState(false);

  return (
    <main style={{ padding: 24, background: "#dce6f2", minHeight: "100vh", fontFamily: "Arial" }}>
      <header style={{ background: "#10458e", color: "white", padding: 20, borderRadius: 8 }}>
        <h2>I.E. Micaela Bastidas Puyucahua</h2>
        <p>Municipio Escolar - Resultados electorales</p>
      </header>

      <p style={{ background: "#fff3cd", padding: 12 }}>
        MODO DEMOSTRACIÓN: los datos no provienen de la base de datos.
      </p>

      <section style={{ maxWidth: 1100, margin: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2>RESULTADOS DE LA ELECCIÓN</h2>
          <button onClick={() => setImprimir(true)}>🖨 Imprimir resultados</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          {listas.map((lista, i) => (
            <article key={lista.nombre} style={{
              background: "white", border: `2px solid ${lista.color}`,
              borderRadius: 9, padding: 16
            }}>
              <strong style={{ color: lista.color }}>{lista.nombre} · {i + 1}.° lugar</strong>
              <h2 style={{ color: lista.color }}>{(lista.votos / totalValidos * 100).toFixed(1)}%</h2>
              <p>{lista.votos} votos</p>
              <div style={{ background: lista.color, color: "white", padding: 12, borderRadius: 6 }}>
                {lista.lema}
              </div>
            </article>
          ))}
        </div>

        <div style={{ background: "white", marginTop: 18, padding: 20, borderRadius: 9 }}>
          <h3>Resumen de la votación</h3>
          <p>Estudiantes habilitados: {habilitados}</p>
          <p>Votos emitidos: {emitidos}</p>
          <p>No votaron: {habilitados - emitidos}</p>
          <p>Participación: {participacion}%</p>
          <h3>Porcentaje de votos por lista</h3>
          {listas.map(lista => (
            <div key={lista.nombre} style={{ marginBottom: 12 }}>
              <span>{lista.nombre} — {(lista.votos / totalValidos * 100).toFixed(1)}%</span>
              <div style={{ background: "#e2e8f0", borderRadius: 6, height: 17 }}>
                <div style={{
                  background: lista.color, height: "100%", borderRadius: 6,
                  width: `${lista.votos / totalValidos * 100}%`
                }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {imprimir && (
        <div role="dialog" aria-modal="true" aria-label="Vista de impresión"
          style={{ position: "fixed", inset: 0, background: "#0008", display: "grid", placeItems: "center", padding: 16 }}>
          <div style={{ background: "white", borderRadius: 12, padding: 24, width: "min(850px, 95vw)", maxHeight: "85vh", overflowY: "auto" }}>
            <h2>Vista de impresión</h2>
            <h3>RESULTADOS DE LA ELECCIÓN ESCOLAR</h3>
            <p>I.E. Micaela Bastidas Puyucahua</p>
            <p style={{ fontSize: 12 }}>Datos de demostración</p>

            <div style={{ display: "flex", alignItems: "end", gap: 20, height: 280, borderBottom: "1px solid #aaa", padding: 15 }}>
              {listas.map(lista => (
                <div key={lista.nombre} style={{ flex: 1, textAlign: "center" }}>
                  <strong>{(lista.votos / totalValidos * 100).toFixed(1)}%</strong>
                  <div style={{
                    height: `${lista.votos / totalValidos * 100 * 4}px`,
                    background: lista.color, margin: "8px auto", width: "70%",
                    borderRadius: 5
                  }} />
                  <small>{lista.nombre}</small>
                  <p>{lista.votos} votos</p>
                </div>
              ))}
            </div>

            <p>Habilitados: {habilitados} · Emitidos: {emitidos} · No votaron: {habilitados - emitidos} · Participación: {participacion}%</p>

            <div style={{ display: "flex", justifyContent: "end", gap: 12 }}>
              <button onClick={() => setImprimir(false)}>Cerrar vista</button>
              <button onClick={() => window.print()}>Imprimir</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
