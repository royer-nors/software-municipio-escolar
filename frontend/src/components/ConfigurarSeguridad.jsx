
import { useEffect, useState } from "react";

const estiloCampo = {
  width: "100%",
  padding: "10px",
  border: "1px solid #a9c8ec",
  borderRadius: 5,
  fontSize: 14,
  boxSizing: "border-box",
  background: "#fff",
  color: "#17345c",
};

const estiloEtiqueta = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#375779",
  marginBottom: 7,
};

export default function ConfigurarSeguridad({ onVolver, token }) {
  const [formulario, setFormulario] = useState({
    actual: "",
    nueva: "",
    confirmar: "",
  });

  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    function manejarTecla(evento) {
      if (evento.key === "Escape") onVolver();
    }

    window.addEventListener("keydown", manejarTecla);
    return () => window.removeEventListener("keydown", manejarTecla);
  }, [onVolver]);

  function cambiar(evento) {
    const { name, value } = evento.target;
    setFormulario((anterior) => ({
      ...anterior,
      [name]: value,
    }));
    setMensaje("");
  }

  async function guardar(evento) {
    evento.preventDefault();

    if (!formulario.actual || !formulario.nueva || !formulario.confirmar) {
      setMensaje("Completa todos los campos.");
      return;
    }

    if (formulario.nueva.length < 8) {
      setMensaje("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (formulario.nueva !== formulario.confirmar) {
      setMensaje("Las contraseñas nuevas no coinciden.");
      return;
    }

    if (formulario.actual === formulario.nueva) {
      setMensaje("La nueva contraseña debe ser diferente a la actual.");
      return;
    }

    // El cambio real debe hacerse en el backend.
    // Nunca guardamos contraseñas en localStorage ni en el navegador.
    setMensaje(
      "Formulario validado. Falta conectar el cambio de contraseña con el backend."
    );
  }

  const estiloBoton = {
    padding: "11px 28px",
    borderRadius: 6,
    cursor: "pointer",
    fontWeight: 600,
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.42)",
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
        aria-labelledby="titulo-seguridad"
        style={{
          width: "100%",
          maxWidth: 600,
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 12px 35px rgba(0,0,0,0.25)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#175da9",
            color: "white",
            padding: "18px 24px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            id="titulo-seguridad"
            style={{ margin: 0, fontSize: 18, color: "white" }}
          >
            {guardado ? "Cambios guardados" : "Seguridad"}
          </h2>

          <button
            type="button"
            onClick={onVolver}
            aria-label="Cerrar ventana"
            style={{
              border: "none",
              background: "transparent",
              color: "white",
              fontSize: 25,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {guardado ? (
          <div style={{ padding: 24 }}>
            <p style={{ color: "#58718d", fontSize: 13 }}>
              La operación se completó correctamente.
            </p>

            <p
              style={{
                textAlign: "center",
                margin: "80px 0 120px",
                fontWeight: 600,
                color: "#17345c",
              }}
            >
              La actualización de la contraseña se completó correctamente.
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={onVolver}
                style={{
                  ...estiloBoton,
                  background: "#175da9",
                  color: "white",
                  border: "none",
                }}
              >
                Volver a configuración
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={guardar}>
            <div style={{ padding: 24 }}>
              <p
                style={{
                  fontSize: 13,
                  color: "#58718d",
                  marginTop: 0,
                  marginBottom: 28,
                }}
              >
                Actualiza la contraseña de acceso del administrador.
              </p>

              {[
                ["actual", "Contraseña actual"],
                ["nueva", "Nueva contraseña"],
                ["confirmar", "Confirmar nueva contraseña"],
              ].map(([nombre, etiqueta]) => (
                <div key={nombre} style={{ marginBottom: 20 }}>
                  <label htmlFor={`seguridad-${nombre}`} style={estiloEtiqueta}>
                    {etiqueta}
                  </label>

                  <input
                    id={`seguridad-${nombre}`}
                    name={nombre}
                    type="password"
                    autoComplete={
                      nombre === "actual"
                        ? "current-password"
                        : "new-password"
                    }
                    value={formulario[nombre]}
                    onChange={cambiar}
                    style={estiloCampo}
                    required
                  />
                </div>
              ))}

              {mensaje && (
                <p
                  role="status"
                  style={{
                    padding: 12,
                    background: "#fff1f1",
                    color: "#a32727",
                    borderRadius: 6,
                    fontSize: 13,
                  }}
                >
                  {mensaje}
                </p>
              )}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
                padding: "18px 24px 24px",
              }}
            >
              <button
                type="button"
                onClick={onVolver}
                style={{
                  ...estiloBoton,
                  background: "white",
                  color: "#0759b8",
                  border: "1px solid #b6d0ef",
                }}
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={guardando}
                style={{
                  ...estiloBoton,
                  background: "#175da9",
                  color: "white",
                  border: "none",
                }}
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
