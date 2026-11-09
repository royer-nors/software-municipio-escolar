
import { useEffect, useState } from "react";
import AgregarVotante from "./components/AgregarVotante";
import AgregarCandidatos from "./components/AgregarCandidatos";
import MarcoPantalla from "./components/MarcoPantalla";
import LoginAdmin from "./pages/LoginAdmin";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

const opciones = [
  { id: "configuracion", nombre: "Configuración", icono: "⚙️" },
  { id: "estudiantes", nombre: "Gestión de estudiantes", icono: "👥" },
  { id: "listas", nombre: "Listas y candidatos", icono: "📋" },
  { id: "votacion", nombre: "Votación", icono: "🗳️" },
  { id: "resultados", nombre: "Resultados electorales", icono: "📊" },
];

export default function App() {
  const [sesion, setSesion] = useState(null);
  const [verificando, setVerificando] = useState(true);
  const [vistaActual, setVistaActual] = useState("menu");
  const [aviso, setAviso] = useState("");

  function cerrarSesion() {
    sessionStorage.removeItem("admin_token");
    setSesion(null);
    setVistaActual("menu");
    setAviso("");
  }

  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");

    if (!token) {
      setVerificando(false);
      return;
    }

    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error("Sesión no válida");
        return respuesta.json();
      })
      .then((datos) => {
        setSesion({
          token,
          administrador: datos.administrador
        });
      })
      .catch(() => {
        sessionStorage.removeItem("admin_token");
      })
      .finally(() => setVerificando(false));
  }, []);

  function iniciarSesion(datos) {
    if (!datos?.token || !datos?.administrador) {
      throw new Error("El servidor no devolvió una sesión válida");
    }

    sessionStorage.setItem("admin_token", datos.token);
    setSesion(datos);
    setVistaActual("menu");
  }

  async function solicitudProtegida(ruta, opcionesFetch = {}) {
    const respuesta = await fetch(`${API}${ruta}`, {
      ...opcionesFetch,
      headers: {
        ...opcionesFetch.headers,
        Authorization: `Bearer ${sesion.token}`
      }
    });

    if (respuesta.status === 401) {
      cerrarSesion();
      throw new Error("La sesión expiró. Inicia sesión nuevamente.");
    }

    return respuesta;
  }

  function navegar(id) {
    setAviso("");
    setVistaActual(id);
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
    return <p style={{ padding: 30 }}>Verificando sesión...</p>;
  }

  if (!sesion) {
    return <LoginAdmin onLogin={iniciarSesion} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#e5ebf4" }}>
      <MarcoPantalla>
        <div style={{
          padding: "20px 5%",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap"
        }}>
          <div>
            <strong>Panel administrativo</strong>
            <p>Usuario: {sesion.administrador.usuario}</p>
          </div>

          <button
            onClick={cerrarSesion}
            style={{ ...boton, background: "#dc3545", color: "white" }}
          >
            Cerrar sesión
          </button>
        </div>

        <main style={{ padding: "15px 5% 40px" }}>
          {vistaActual !== "menu" && (
            <button
              onClick={() => navegar("menu")}
              style={{ ...boton, marginBottom: 20 }}
            >
              ← Volver al menú
            </button>
          )}

          {vistaActual === "menu" && (
            <section style={{
              background: "white",
              borderRadius: 15,
              padding: 25
            }}>
              <h2>🏫 Menú principal</h2>
              <p>Selecciona el módulo que deseas utilizar.</p>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                gap: 15,
                marginTop: 25
              }}>
                {opciones.map((opcion) => (
                  <button
                    key={opcion.id}
                    style={boton}
                    onClick={() => navegar(opcion.id)}
                  >
                    <span style={{ marginRight: 10 }}>
                      {opcion.icono}
                    </span>
                    {opcion.nombre}
                  </button>
                ))}
              </div>
            </section>
          )}

          {vistaActual === "configuracion" && (
            <section style={{ background: "white", padding: 25, borderRadius: 15 }}>
              <h2>⚙️ Configuración</h2>
              <p>Opciones administrativas del sistema electoral.</p>
              <p>Centro educativo, apertura electoral y seguridad: pendientes de integración.</p>
            </section>
          )}

          {vistaActual === "estudiantes" && (
            <AgregarVotante onVolver={() => navegar("menu")} />
          )}

          {vistaActual === "listas" && (
            <AgregarCandidatos onVolver={() => navegar("menu")} />
          )}

          {vistaActual === "votacion" && (
            <section style={{ background: "white", padding: 25, borderRadius: 15 }}>
              <h2>🗳️ Votación estudiantil</h2>
              <p>El estudiante debe identificarse mediante su propio flujo de acceso.</p>
              <p>Pendiente de integrar la pantalla de identificación y votación.</p>
            </section>
          )}

          {vistaActual === "resultados" && (
            <section style={{ background: "white", padding: 25, borderRadius: 15 }}>
              <h2>📊 Resultados electorales</h2>
              <p>Pendiente de integrar el conteo y los porcentajes desde el backend.</p>
            </section>
          )}

          {aviso && <p role="alert">{aviso}</p>}
        </main>
      </MarcoPantalla>
    </div>
  );
}
