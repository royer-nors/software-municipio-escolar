
import { useEffect, useRef, useState } from "react";
import { obtenerConfiguracion } from "../api/estudiantes";
import { guardarConfiguracionElectoral } from "../api/control-votacion";

export default function ConfigurarVotoBlanco({ onVolver, token }) {
  const [habilitado, setHabilitado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [configuracion, setConfiguracion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [revision, setRevision] = useState(0);
  const [esError, setEsError] = useState(false);
  const ocupado = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    obtenerConfiguracion(controller.signal).then(datos => {
      if (!controller.signal.aborted) { setConfiguracion(datos); setHabilitado(datos.votoBlancoHabilitado); }
    }).catch(e => { if (!controller.signal.aborted) { setConfiguracion(null); setEsError(true); setMensaje(e.message); } })
      .finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    function manejarTecla(evento) {
      if (evento.key === "Escape" && !ocupado.current) {
        onVolver();
      }
    }

    window.addEventListener("keydown", manejarTecla);

    return () => {
      window.removeEventListener("keydown", manejarTecla);
    };
  }, [onVolver]);

  async function guardar(evento) {
    evento.preventDefault();
    if (ocupado.current || cargando || !configuracion || configuracion.votacionAbierta) return;
    ocupado.current = true; setGuardando(true); setMensaje(""); setEsError(false);
    try {
      const actual = await guardarConfiguracionElectoral({ votoBlancoHabilitado: habilitado, revision: configuracion.revision }, token);
      setConfiguracion(actual); setHabilitado(actual.votoBlancoHabilitado);
      setMensaje(`Configuración guardada: voto en blanco ${actual.votoBlancoHabilitado ? "habilitado" : "deshabilitado"}.`);
    } catch (e) { setEsError(true); setMensaje(e.message); }
    finally { ocupado.current = false; setGuardando(false); }
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
            disabled={guardando}
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
        <div style={{ padding: "12px 24px 0" }}>
          <button type="button" disabled={cargando || guardando} onClick={() => { setCargando(true); setMensaje(""); setRevision(r => r + 1); }}>Consultar configuración</button>
          {cargando && <p role="status">Consultando configuración guardada…</p>}
          {configuracion?.votacionAbierta && <p role="status">La votación está abierta. El voto en blanco solo se puede modificar fuera de la votación abierta.</p>}
        </div>
        <form onSubmit={guardar}>
          <fieldset disabled={cargando || guardando || !configuracion || !token} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
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
                  disabled={configuracion?.votacionAbierta}
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
                  disabled={configuracion?.votacionAbierta}
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
                role={esError ? "alert" : "status"}
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
              disabled={configuracion?.votacionAbierta}
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
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}
