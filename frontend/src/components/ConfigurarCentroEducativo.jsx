
import { useEffect, useRef, useState } from "react";
import { obtenerConfiguracion } from "../api/estudiantes";
import { guardarConfiguracionElectoral } from "../api/control-votacion";

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

const datosIniciales = {
  institucion: "I.E. Micaela Bastidas Puyucahua",
  ubicacion: "Tamburco - Abancay - Apurímac",
  anio: "2026",
  fecha: "",
  horaInicio: "08:00",
  horaFin: "15:00",
  automatica: false,
};

export default function ConfigurarCentroEducativo({ onVolver, token }) {
  const [formulario, setFormulario] = useState(datosIniciales);
  const [mensaje, setMensaje] = useState("");
  const [tipoMensaje, setTipoMensaje] = useState("error");
  const [configuracion, setConfiguracion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [estadoReal, setEstadoReal] = useState("");
  const ocupado = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    obtenerConfiguracion(controller.signal).then(datos => {
      if (controller.signal.aborted) return;
      setConfiguracion(datos);
      setEstadoReal(datos.estado);
      setFormulario({ institucion: datos.institucion ?? datosIniciales.institucion,
        ubicacion: datos.ubicacion ?? datosIniciales.ubicacion, anio: String(datos.anio ?? datosIniciales.anio),
        fecha: datos.fecha ?? "", horaInicio: datos.horaInicio ?? "08:00", horaFin: datos.horaFin ?? "15:00",
        automatica: datos.automatica === true });
    }).catch(e => { if (!controller.signal.aborted) setMensaje(e.message); })
      .finally(() => { if (!controller.signal.aborted) setCargando(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function consultarEstado() {
      if (ocupado.current) return;
      try {
        const actual = await obtenerConfiguracion(controller.signal);
        if (controller.signal.aborted || ocupado.current) return;
        setEstadoReal(actual.estado);
        // Conserva la revisión del formulario para detectar ediciones de otro administrador.
        setConfiguracion(previa => previa && previa.revision === actual.revision
          ? { ...previa, estado: actual.estado, votacionAbierta: actual.votacionAbierta } : previa);
      } catch { if (!controller.signal.aborted) setEstadoReal("No disponible; consulta de nuevo antes de guardar"); }
    }
    const intervalo = setInterval(consultarEstado, 20000);
    window.addEventListener("focus", consultarEstado);
    return () => { controller.abort(); clearInterval(intervalo); window.removeEventListener("focus", consultarEstado); };
  }, []);

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

  function cambiar(evento) {
    const { name, value } = evento.target;

    setFormulario((anterior) => ({
      ...anterior,
      [name]: value,
    }));

    setMensaje("");
  }

  function mostrarError(texto) {
    setTipoMensaje("error");
    setMensaje(texto);
  }

  async function guardar(evento) {
    evento.preventDefault();
    if (ocupado.current || !configuracion) return;

    if (
      !formulario.institucion.trim() ||
      !formulario.ubicacion.trim() ||
      !formulario.anio ||
      !formulario.fecha ||
      !formulario.horaInicio ||
      !formulario.horaFin
    ) {
      mostrarError("Completa todos los campos.");
      return;
    }

    const anio = Number(formulario.anio);
    const anioFecha = Number(formulario.fecha.slice(0, 4));

    if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) {
      mostrarError("Ingresa un año electoral válido.");
      return;
    }

    if (anio !== anioFecha) {
      mostrarError(
        "El año electoral debe coincidir con el año de la fecha de votación."
      );
      return;
    }

    if (formulario.horaFin <= formulario.horaInicio) {
      mostrarError(
        "La hora de finalización debe ser posterior a la hora de inicio."
      );
      return;
    }

    if (!window.confirm("¿Guardar la configuración electoral? El horario automático se interpreta en America/Lima. Los votos existentes se conservan.")) return;
    let motivo = "Configuración electoral desde el panel administrativo";
    if (configuracion.votacionAbierta) {
      motivo = window.prompt("La elección está abierta. Escribe el motivo del cambio; se registrará en la auditoría.")?.trim();
      if (!motivo) { mostrarError("Es obligatorio indicar el motivo para modificar una elección abierta."); return; }
    }
    ocupado.current = true; setGuardando(true); setMensaje("");
    try {
      const actual = await guardarConfiguracionElectoral({ ...formulario, anio, revision: configuracion.revision,
        confirmarCambioActivo: configuracion.votacionAbierta === true, motivo }, token);
      setConfiguracion(actual); setEstadoReal(actual.estado); setTipoMensaje("exito"); setMensaje("Configuración electoral guardada correctamente en PostgreSQL.");
    } catch (e) { mostrarError(e.message); }
    finally { ocupado.current = false; setGuardando(false); }
  }

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
        aria-labelledby="titulo-centro"
        style={{
          width: "100%",
          maxWidth: 600,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 12px 35px rgba(0,0,0,0.25)",
        }}
      >
        {/* ENCABEZADO */}
        <div
          style={{
            background: "#175da9",
            color: "white",
            padding: "18px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderRadius: "10px 10px 0 0",
          }}
        >
          <h2
            id="titulo-centro"
            style={{
              margin: 0,
              fontSize: 18,
              color: "white",
            }}
          >
            Configurar centro educativo
          </h2>

          <button
            type="button"
            onClick={onVolver}
            disabled={guardando}
            aria-label="Cerrar ventana"
            style={{
              background: "transparent",
              border: "none",
              color: "white",
              fontSize: 25,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        {/* FORMULARIO */}
        <form onSubmit={guardar}>
          <fieldset disabled={cargando || guardando || !configuracion} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div style={{ padding: 24 }}>
            <p
              style={{
                fontSize: 13,
                color: "#58718d",
                marginTop: 0,
                marginBottom: 28,
              }}
            >
              Guarda los datos institucionales y el horario electoral en America/Lima.
              El servidor central aplica el horario aunque esta ventana esté cerrada.
            </p>
            {configuracion && <p role="status">Estado real: <strong>{estadoReal || configuracion.estado}</strong> · Modo {configuracion.automatica ? "automático" : "manual"}</p>}
            <label style={{ display: "block", marginBottom: 20 }}>
              <input type="checkbox" checked={formulario.automatica} onChange={e => setFormulario(f => ({ ...f, automatica: e.target.checked }))} /> Apertura y cierre automáticos
            </label>
            <p>Una orden manual de emergencia desactiva el horario automático hasta que vuelvas a activar esta opción y guardes.</p>

            {/* INSTITUCIÓN EDUCATIVA */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="centro-institucion"
                style={estiloEtiqueta}
              >
                Institución educativa
              </label>

              <input
                id="centro-institucion"
                name="institucion"
                type="text"
                value={formulario.institucion}
                onChange={cambiar}
                style={estiloCampo}
                required
                maxLength={150}
              />
            </div>

            {/* UBICACIÓN */}
            <div style={{ marginBottom: 20 }}>
              <label
                htmlFor="centro-ubicacion"
                style={estiloEtiqueta}
              >
                Ubicación
              </label>

              <input
                id="centro-ubicacion"
                name="ubicacion"
                type="text"
                value={formulario.ubicacion}
                onChange={cambiar}
                style={estiloCampo}
                required
                maxLength={150}
              />
            </div>

            {/* AÑO Y FECHA */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(200px, 1fr))",
                gap: 24,
                marginBottom: 25,
              }}
            >
              <div>
                <label
                  htmlFor="centro-anio"
                  style={estiloEtiqueta}
                >
                  Año electoral
                </label>

                <input
                  id="centro-anio"
                  name="anio"
                  type="number"
                  min="2000"
                  max="2100"
                  value={formulario.anio}
                  onChange={cambiar}
                  style={estiloCampo}
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="centro-fecha"
                  style={estiloEtiqueta}
                >
                  Fecha de votación
                </label>

                <input
                  id="centro-fecha"
                  name="fecha"
                  type="date"
                  value={formulario.fecha}
                  onChange={cambiar}
                  style={estiloCampo}
                  required
                />
              </div>
            </div>

            {/* HORARIO DE VOTACIÓN */}
            <div
              style={{
                borderTop: "1px solid #e0e9f4",
                paddingTop: 20,
                marginBottom: 24,
              }}
            >
              <h3
                style={{
                  fontSize: 16,
                  color: "#175da9",
                  marginTop: 0,
                  marginBottom: 8,
                }}
              >
                🕒 Horario de votación
              </h3>

              <p
                style={{
                  fontSize: 12,
                  color: "#58718d",
                  marginBottom: 18,
                }}
              >
                Establece a qué hora comenzará y finalizará
                la votación escolar.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 24,
                }}
              >
                {/* HORA DE INICIO */}
                <div>
                  <label
                    htmlFor="centro-hora-inicio"
                    style={estiloEtiqueta}
                  >
                    Hora de inicio
                  </label>

                  <input
                    id="centro-hora-inicio"
                    name="horaInicio"
                    type="time"
                    value={formulario.horaInicio}
                    onChange={cambiar}
                    style={estiloCampo}
                    required
                  />
                </div>

                {/* HORA DE FINALIZACIÓN */}
                <div>
                  <label
                    htmlFor="centro-hora-fin"
                    style={estiloEtiqueta}
                  >
                    Hora de finalización
                  </label>

                  <input
                    id="centro-hora-fin"
                    name="horaFin"
                    type="time"
                    value={formulario.horaFin}
                    onChange={cambiar}
                    style={estiloCampo}
                    required
                  />
                </div>
              </div>
            </div>

            {/* MENSAJE DE VALIDACIÓN */}
            {mensaje && (
              <p
                role="status"
                style={{
                  padding: 12,
                  background:
                    tipoMensaje === "exito"
                      ? "#eef9f0"
                      : "#fff1f1",
                  border:
                    tipoMensaje === "exito"
                      ? "1px solid #9ed5aa"
                      : "1px solid #e8a7a7",
                  borderRadius: 6,
                  color:
                    tipoMensaje === "exito"
                      ? "#236b34"
                      : "#a32727",
                  fontSize: 13,
                }}
              >
                {mensaje}
              </p>
            )}
          </div>

          {/* BOTONES INFERIORES */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 12,
              padding: "18px 24px 24px",
              flexWrap: "wrap",
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
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              {guardando ? "Guardando configuración…" : "Guardar configuración electoral"}
            </button>
          </div>
          </fieldset>
        </form>
        {cargando && <p role="status" style={{ padding: 20 }}>Consultando configuración guardada…</p>}
      </div>
    </div>
  );
}
