
import { useState } from "react";
import MarcoPantalla from "./components/MarcoPantalla";
import LoginAdmin from "./pages/LoginAdmin";
import AgregarVotante from "./components/AgregarVotante";
import AgregarCandidatos from "./components/AgregarCandidatos";

const opciones = [
  ["centro", "🏫", "Configurar centro educativo",
    "Datos de la I.E., año electoral y parámetros generales."],
  ["padron", "👥", "Cargar padrón desde Excel",
    "Importar el padrón completo de estudiantes habilitados."],
  ["candidatos", "👤", "Agregar candidatos",
    "Registra los candidatos de cada lista."],
  ["blanco", "☑️", "Configurar voto en blanco",
    "Activa o desactiva la opción de voto en blanco."],
  ["seguridad", "🔒", "Seguridad",
    "Cambia contraseñas y controla accesos al sistema."],
  ["borrar", "🗑️", "Borrar datos",
    "Elimina toda la información del proceso electoral."]
];

const azul = "#0759b8";

const tarjeta = {
  background: "#edf5fd",
  border: "1px solid #c0d6ef",
  borderRadius: 7,
  padding: 20
};

const boton = {
  background: azul,
  color: "#fff",
  border: "none",
  borderRadius: 9,
  padding: "12px 23px",
  cursor: "pointer",
  fontSize: 15
};

export default function App() {
  const [vista, setVista] = useState("inicio");
  const [destino, setDestino] = useState(null);
  const [sesion, setSesion] = useState(null);
  const [mensaje, setMensaje] = useState("");

  function ir(v) {
    setMensaje("");
    setVista(v);
  }

  function salir() {
    sessionStorage.removeItem("admin_token");
    setSesion(null);
    setDestino(null);
    ir("inicio");
  }

  function entrarA(modulo) {
    if (sesion?.token) {
      ir(modulo);
    } else {
      setDestino(modulo);
      ir("acceso");
    }
  }

  function loginCorrecto(datos) {
    if (!datos?.token || !datos?.administrador) {
      throw new Error("El backend no devolvió una sesión válida.");
    }
    sessionStorage.setItem("admin_token", datos.token);
    setSesion(datos);
    ir(destino || "inicio");
  }

  function seleccionarOpcion(id) {
    if (id === "borrar") return;
    if (id === "candidatos") return ir("candidatos");
    if (id === "padron") return ir("padron");

    setMensaje("Esta opción está pendiente de integración.");
  }

  // LoginAdmin conserva la conexión real al backend.
  // Solo aparece después de elegir un módulo protegido.
  if (vista === "acceso") {
    return (
      <div>
        <button
          onClick={() => ir("inicio")}
          style={{ ...boton, margin: 15 }}
        >
          ← Volver al inicio
        </button>
        <LoginAdmin onLogin={loginCorrecto} />
      </div>
    );
  }

  return (
    <div style={{ background: "#dce6f2", minHeight: "100vh" }}>
      <MarcoPantalla
        mostrarMarca={vista !== "inicio"}
        onSalir={salir}
      >
        <div style={{
          maxWidth: 1050,
          margin: "auto",
          padding: "18px 12px 30px"
        }}>

          {vista === "inicio" && (
            <section style={{ textAlign: "center" }}>
              <div style={{
                padding: "55px 12px 45px",
                background: "#e8f0fa",
                borderRadius: 8
              }}>
                <h1 style={{
                  fontSize: "clamp(36px, 6vw, 55px)",
                  color: "#5175b5",
                  marginBottom: 10
                }}>
                  ¡Bienvenido!
                </h1>
                <p style={{ fontSize: 20, color: "#334155" }}>
                  «Gestiona el proceso electoral escolar»
                </p>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(240px, 1fr))",
                gap: 25,
                marginTop: 18
              }}>
                <button
                  style={{
                    ...tarjeta,
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 15
                  }}
                  onClick={() => entrarA("resultados")}
                >
                  <span style={{ fontSize: 42 }}>📊</span>
                  <span>
                    <strong>Ver resultados</strong>
                    <small style={{ display: "block", marginTop: 5 }}>
                      Conoce los resultados oficiales
                    </small>
                  </span>
                  <span style={{ marginLeft: "auto" }}>❯</span>
                </button>

                <button
                  style={{
                    ...tarjeta,
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 15
                  }}
                  onClick={() => entrarA("configuracion")}
                >
                  <span style={{ fontSize: 42 }}>⚙️</span>
                  <span>
                    <strong>Configurar</strong>
                    <small style={{ display: "block", marginTop: 5 }}>
                      Parámetros del sistema
                    </small>
                  </span>
                  <span style={{ marginLeft: "auto" }}>❯</span>
                </button>
              </div>
            </section>
          )}

          {vista === "configuracion" && (
            <section style={tarjeta}>
              <h2 style={{ color: azul, marginTop: 0 }}>
                ⚙️ Configurar Sistema de Votación
              </h2>
              <p>Selecciona la opción que deseas configurar.</p>

              {opciones.map(([id, icono, nombre, descripcion]) => (
                <button
                  key={id}
                  disabled={id === "borrar"}
                  onClick={() => seleccionarOpcion(id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "white",
                    border: "1px solid #c5d7eb",
                    borderRadius: 7,
                    padding: 12,
                    marginBottom: 7,
                    textAlign: "left",
                    cursor: id === "borrar" ? "not-allowed" : "pointer",
                    opacity: id === "borrar" ? 0.45 : 1
                  }}
                >
                  <span style={{ fontSize: 25 }}>{icono}</span>
                  <span style={{ flex: 1 }}>
                    <strong style={{ color: azul }}>{nombre}</strong>
                    <small style={{
                      display: "block",
                      color: "#64748b",
                      marginTop: 3
                    }}>
                      {descripcion}
                    </small>
                  </span>
                  {id !== "borrar" && <span>❯</span>}
                </button>
              ))}

              {mensaje && (
                <p role="status" style={{
                  padding: 12,
                  background: "#fff3cd",
                  borderRadius: 7
                }}>
                  {mensaje}
                </p>
              )}
            </section>
          )}

          {vista === "padron" && (
            <AgregarVotante
              onVolver={() => ir("configuracion")}
            />
          )}

          {vista === "candidatos" && (
            <AgregarCandidatos
              onVolver={() => ir("configuracion")}
            />
          )}

          {vista === "resultados" && (
            <section style={tarjeta}>
              <h2 style={{ color: azul }}>
                📊 RESULTADOS DE LA ELECCIÓN
              </h2>
              <p>
                Aquí se mostrarán los votos y porcentajes
                reales de cada lista electoral.
              </p>
              <p>
                Pendiente de conectar con el módulo de
                resultados del backend.
              </p>
            </section>
          )}

          {vista !== "inicio" && (
            <button
              style={{ ...boton, marginTop: 20 }}
              onClick={() => ir("inicio")}
            >
              ← Volver al inicio
            </button>
          )}

        </div>
      </MarcoPantalla>
    </div>
  );
}
