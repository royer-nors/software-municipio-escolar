
import { useEffect, useState } from "react";

export default function ConfigurarVotoBlanco({ onVolver }) {
  const [habilitado, setHabilitado] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    function manejarTecla(evento) {
      if (evento.key === "Escape") {
        onVolver();
      }
    }

    window.addEventListener("keydown", manejarTecla);

    return () => {
      window.removeEventListener("keydown", manejarTecla);
    };
  }, [onVolver]);

  function guardar(evento) {
    evento.preventDefault();

    // Por ahora solamente se valida la selección.
    // Falta conectar con el backend y PostgreSQL.
    setMensaje(
      `Opción seleccionada: voto en blanco ${
        habilitado ? "habilitado" : "deshabilitado"
      }. Pendiente de guardar en el servidor.`
    );
  }

  const estiloOpcion = {
    display: "flex",
    alignItems: "center",
    gap: 18,
    padding: "20px 18px",
    background: "#eaf2fb",
    border: "1px solid #aacbed",
    borderRadius: 6,
    cursor: "pointer",
    color: "#17345c",
    fontWeight: 600,
    fontSize: 14,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-voto-blanco"
        style={{
          background: "#fff",
          width: "100%",
          maxWidth: 600,
          borderRadius: 10,
          boxShadow: "0 12px 35px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            background: "#175da9",
            color: "#fff",
            padding: "20px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            id="titulo-voto-blanco"
            style={{
              margin: 0,
              fontSize: 18,
              color: "#fff",
            }}
          >
            Configurar voto en blanco
          </h2>

          <button
            type="button"
            onClick={onVolver}
            aria-label="Cerrar"
            style={{
              border: "none",
              background: "transparent",
              color: "#fff",
              fontSize: 26,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={guardar}>
          <div style={{ padding: 24 }}>
            <p
              style={{
                color: "#58718d",
                fontSize: 13,
                marginTop: 0,
                marginBottom: 42,
              }}
            >
              Activa o desactiva la opción de voto en blanco
              en la cédula.
            </p>

            <div
              style={{
                display: "grid",
                gap: 18,
              }}
            >
              <label style={estiloOpcion}>
                <input
                  type="radio"
                  name="votoBlanco"
                  checked={habilitado}
                  onChange={() => {
                    setHabilitado(true);
                    setMensaje("");
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    accentColor: "#175da9",
                    cursor: "pointer",
                  }}
                />
                Habilitar voto en blanco
              </label>

              <label style={estiloOpcion}>
                <input
                  type="radio"
                  name="votoBlanco"
                  checked={!habilitado}
                  onChange={() => {
                    setHabilitado(false);
                    setMensaje("");
                  }}
                  style={{
                    width: 22,
                    height: 22,
                    accentColor: "#175da9",
                    cursor: "pointer",
                  }}
                />
                Deshabilitar voto en blanco
              </label>
            </div>

            <p
              style={{
                color: "#58718d",
                fontSize: 12,
                marginTop: 28,
              }}
            >
              Los cambios se aplican al pulsar Guardar.
            </p>

            {mensaje && (
              <p
                role="status"
                style={{
                  marginTop: 15,
                  padding: 12,
                  background: "#eef5ff",
                  border: "1px solid #b9d4f2",
                  borderRadius: 6,
                  color: "#175da9",
                  fontSize: 13,
                }}
              >
                {mensaje}
              </p>
            )}
          </div>

          {/* Botones */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              padding: "18px 24px 24px",
              marginTop: 15,
            }}
          >
            <button
              type="button"
              onClick={onVolver}
              style={{
                padding: "11px 28px",
                background: "#fff",
                color: "#0759b8",
                border: "1px solid #b6d0ef",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              style={{
                padding: "11px 32px",
                background: "#175da9",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
