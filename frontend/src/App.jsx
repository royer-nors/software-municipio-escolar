
import { useEffect, useState } from "react";

import AgregarVotante from "./components/AgregarVotante";
import AgregarCandidatos from "./components/AgregarCandidatos";
import MarcoPantalla from "./components/MarcoPantalla";
import LoginAdmin from "./pages/LoginAdmin";

import AutenticarVotante from "./pages/AutenticarVotante";
import VotanteIdentificado from "./pages/VotanteIdentificado";
import ListasCandidatos from "./pages/ListasCandidatos";
import Resultados from "./pages/Resultados";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const opciones = [
  { id: "configuracion", nombre: "Configuración", icono: "⚙️" },
  { id: "estudiantes", nombre: "Gestión de estudiantes", icono: "👥" },
  { id: "listas", nombre: "Listas y candidatos", icono: "📋" },
  { id: "votacion", nombre: "Votación", icono: "🗳️" },
  { id: "resultados", nombre: "Resultados electorales", icono: "📊" },
];

export default function App() {
  const [sesionAdmin, setSesionAdmin] = useState(null);
  const [verificando, setVerificando] = useState(true);
  const [vistaActual, setVistaActual] = useState("menu");

  const [pasoVotacion, setPasoVotacion] = useState("autenticar");
  const [sesionEstudiante, setSesionEstudiante] = useState(null);

  function cerrarSesionAdmin() {
    sessionStorage.removeItem("admin_token");
    finalizarVotacion();
    setSesionAdmin(null);
    setVistaActual("menu");
  }

  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");

    if (!token) {
      setVerificando(false);
      return;
    }

    fetch(`${API}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(async (respuesta) => {
        if (!respuesta.ok) {
          throw new Error("Sesión no válida");
        }

        return respuesta.json();
      })
      .then((datos) => {
        setSesionAdmin({
          token,
          administrador: datos.administrador
        });
      })
      .catch(() => {
        sessionStorage.removeItem("admin_token");
      })
      .finally(() => {
        setVerificando(false);
      });
  }, []);

  function iniciarSesionAdmin(datos) {
    if (!datos?.token || !datos?.administrador) {
      throw new Error("El servidor no devolvió una sesión válida");
    }

    sessionStorage.setItem("admin_token", datos.token);
    setSesionAdmin(datos);
    setVistaActual("menu");
  }

  function navegar(id) {
    if (id !== "votacion") {
      finalizarVotacion();
    }

    if (id === "votacion") {
      finalizarVotacion();
    }

    setVistaActual(id);
  }

  function estudianteAutenticado(datos) {
    setSesionEstudiante(datos);
    setPasoVotacion("identificado");
  }

  function finalizarVotacion() {
    localStorage.removeItem("tokenEstudiante");
    sessionStorage.removeItem("tokenEstudiante");
    setSesionEstudiante(null);
    setPasoVotacion("autenticar");
  }

  const boton = {
    border: "1px solid #dbe3ef",
    borderRadius: 10,
    padding: "15px",
    background: "white",
    color: "#123568",
    cursor: "pointer",
    textAlign: "left",
    fontSize: 15,
    fontWeight: 600
  };

  if (verificando) {
    return (
      <p style={{ padding: 30 }}>
        Verificando sesión...
      </p>
    );
  }

  if (!sesionAdmin) {
    return (
      <LoginAdmin onLogin={iniciarSesionAdmin} />
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#e5ebf4"
      }}
    >
      <MarcoPantalla>

        {/* ENCABEZADO ADMINISTRATIVO */}

        <div
          style={{
            padding: "20px 5%",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <div>
            <strong>Panel administrativo</strong>
            <p>
              Usuario: {sesionAdmin.administrador.usuario}
            </p>
          </div>

          <button
            onClick={cerrarSesionAdmin}
            style={{
              ...boton,
              background: "#dc3545",
              color: "white"
            }}
          >
            Cerrar sesión
          </button>
        </div>

        <main
          style={{
            padding: "15px 5% 40px"
          }}
        >

          {/* BOTÓN VOLVER */}

          {vistaActual !== "menu" && (
            <button
              onClick={() => navegar("menu")}
              style={{
                ...boton,
                marginBottom: 20
              }}
            >
              ← Volver al menú
            </button>
          )}

          {/* MENÚ PRINCIPAL */}

          {vistaActual === "menu" && (
            <section
              style={{
                background: "white",
                borderRadius: 15,
                padding: 25
              }}
            >
              <h2>🏫 Menú principal</h2>

              <p>
                Selecciona el módulo que deseas utilizar.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(230px, 1fr))",
                  gap: 15,
                  marginTop: 25
                }}
              >
                {opciones.map((opcion) => (
                  <button
                    key={opcion.id}
                    style={boton}
                    onClick={() => navegar(opcion.id)}
                  >
                    <span
                      style={{
                        marginRight: 10
                      }}
                    >
                      {opcion.icono}
                    </span>

                    {opcion.nombre}
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* CONFIGURACIÓN */}

          {vistaActual === "configuracion" && (
            <section
              style={{
                background: "white",
                padding: 25,
                borderRadius: 15
              }}
            >
              <h2>⚙️ Configuración</h2>

              <p>
                Opciones administrativas del sistema electoral.
              </p>

              <p>
                Centro educativo, apertura electoral y seguridad:
                pendientes de integración.
              </p>
            </section>
          )}

          {/* GESTIÓN DE ESTUDIANTES */}

          {vistaActual === "estudiantes" && (
            <AgregarVotante
              onVolver={() => navegar("menu")}
            />
          )}

          {/* LISTAS Y CANDIDATOS */}

          {vistaActual === "listas" && (
            <AgregarCandidatos
              onVolver={() => navegar("menu")}
            />
          )}

          {/* MÓDULO DE VOTACIÓN */}

          {vistaActual === "votacion" && (
            <div
              style={{
                background: "#eef2f6",
                padding: 15
              }}
            >

              {/* IDENTIFICAR ESTUDIANTE */}

              {pasoVotacion === "autenticar" && (
                <AutenticarVotante
                  onAutenticado={estudianteAutenticado}
                  onSalir={finalizarVotacion}
                />
              )}

              {/* ESTUDIANTE IDENTIFICADO */}

              {pasoVotacion === "identificado" &&
                sesionEstudiante && (
                  <VotanteIdentificado
                    estudiante={sesionEstudiante.estudiante}
                    onVotar={() =>
                      setPasoVotacion("papeleta")
                    }
                    onSalir={finalizarVotacion}
                  />
                )}

              {/* PAPELETA ELECTORAL */}

              {pasoVotacion === "papeleta" &&
                sesionEstudiante && (
                  <ListasCandidatos
                    token={sesionEstudiante.token}
                    estudiante={sesionEstudiante.estudiante}
                    onFinalizar={finalizarVotacion}
                    onSalir={finalizarVotacion}
                  />
                )}
            </div>
          )}

          {/* RESULTADOS ELECTORALES */}

          {vistaActual === "resultados" && (
            <Resultados
              onSalir={() => navegar("menu")}
            />
          )}

        </main>
      </MarcoPantalla>
    </div>
  );
}
