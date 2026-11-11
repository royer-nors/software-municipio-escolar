import { useEffect, useState } from "react";
import MarcoPantalla from "./components/MarcoPantalla";
import Bienvenida from "./pages/Bienvenida";
import LoginAdmin from "./pages/LoginAdmin";
import AgregarVotante from "./components/AgregarVotante";
import AgregarCandidatos from "./components/AgregarCandidatos";
import AutenticarVotante from "./pages/AutenticarVotante";
import VotanteIdentificado from "./pages/VotanteIdentificado";
import ListasCandidatos from "./pages/ListasCandidatos";
import Resultados from "./pages/Resultados";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";
const azul = "#0759b8";
const tarjeta = { background: "#edf5fd", border: "1px solid #c0d6ef", borderRadius: 7, padding: 20 };
const boton = { background: azul, color: "#fff", border: "none", borderRadius: 9, padding: "12px 23px", cursor: "pointer", fontSize: 15 };

const opcionesConfiguracion = [
  ["centro", "🏫", "Configurar centro educativo", "Datos de la I.E. y del proceso electoral."],
  ["padron", "👥", "Gestionar estudiantes", "Registrar estudiantes habilitados para votar."],
  ["candidatos", "👤", "Agregar candidatos", "Registrar listas y candidatos."],
  ["blanco", "☑️", "Configurar voto en blanco", "Parámetros de voto en blanco."],
  ["seguridad", "🔒", "Seguridad", "Control de accesos del sistema."],
  ["borrar", "🗑️", "Borrar datos", "Operación no habilitada por seguridad."]
];

export default function App() {
  const [vista, setVista] = useState("inicio");
  const [destino, setDestino] = useState(null);
  const [sesionAdmin, setSesionAdmin] = useState(null);
  const [verificando, setVerificando] = useState(() => Boolean(sessionStorage.getItem("admin_token")));
  const [mensaje, setMensaje] = useState("");
  const [pasoVotacion, setPasoVotacion] = useState("autenticar");
  const [sesionEstudiante, setSesionEstudiante] = useState(null);

  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");
    if (!token) return;
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (respuesta) => {
        if (!respuesta.ok) throw new Error("Sesión no válida");
        return respuesta.json();
      })
      .then((datos) => setSesionAdmin({ token, administrador: datos.administrador }))
      .catch(() => sessionStorage.removeItem("admin_token"))
      .finally(() => setVerificando(false));
  }, []);

  function finalizarVotacion() {
    localStorage.removeItem("tokenEstudiante");
    sessionStorage.removeItem("tokenEstudiante");
    setSesionEstudiante(null);
    setPasoVotacion("autenticar");
  }

  function ir(nuevaVista) {
    if (vista === "votacion" && nuevaVista !== "votacion") finalizarVotacion();
    setMensaje("");
    setVista(nuevaVista);
  }

  function cerrarSesionAdmin() {
    sessionStorage.removeItem("admin_token");
    setSesionAdmin(null);
    setDestino(null);
    finalizarVotacion();
    ir("inicio");
  }

  function entrarA(modulo) {
    // El acceso a la votación es por DNI del estudiante, no por sesión administrativa.
    if (modulo === "votacion") {
      finalizarVotacion();
      ir("votacion");
      return;
    }
    if (sesionAdmin?.token) {
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
    setSesionAdmin(datos);
    const siguienteVista = destino || "configuracion";
    setDestino(null);
    ir(siguienteVista);
  }

  function seleccionarOpcion(id) {
    if (id === "padron" || id === "candidatos") {
      ir(id);
    } else if (id !== "borrar") {
      setMensaje("Esta opción está pendiente de integración.");
    }
  }

  function volver() {
    if (vista === "padron" || vista === "candidatos") ir("configuracion");
    else ir("inicio");
  }

  if (verificando) return <p style={{ padding: 30 }}>Verificando sesión...</p>;

  // Portada independiente: un solo encabezado y sin el contenedor extra de administración.
  if (vista === "inicio") {
    return (
      <MarcoPantalla
        mostrarMarca={false}
        etiquetaCabecera="MUNICIPIO ESCOLAR · VOTACIÓN DIGITAL"
        onSalir={() => ir("inicio")}
      >
        <Bienvenida
          onVotar={() => entrarA("votacion")}
          onAdministrador={() => entrarA("configuracion")}
        />
      </MarcoPantalla>
    );
  }

  if (vista === "acceso") {
    return (
      <div>
        <button style={{ ...boton, margin: 15 }} onClick={() => { setDestino(null); ir("inicio"); }}>
          ← Volver al inicio
        </button>
        <LoginAdmin onLogin={loginCorrecto} />
      </div>
    );
  }

  // Las pantallas del votante incluyen su propio MarcoPantalla.
  // Se renderizan fuera del marco general para evitar cabeceras y pies duplicados.
  if (vista === "votacion") {
    if (pasoVotacion === "identificado" && sesionEstudiante) {
      return (
        <VotanteIdentificado
          estudiante={sesionEstudiante.estudiante}
          onVotar={() => setPasoVotacion("papeleta")}
          onSalir={() => ir("inicio")}
        />
      );
    }

    if (pasoVotacion === "papeleta" && sesionEstudiante) {
      return (
        <ListasCandidatos
          token={sesionEstudiante.token}
          estudiante={sesionEstudiante.estudiante}
          onFinalizar={() => ir("inicio")}
          onSalir={() => ir("inicio")}
        />
      );
    }

    return (
      <AutenticarVotante
        onAutenticado={(datos) => {
          setSesionEstudiante(datos);
          setPasoVotacion("identificado");
        }}
        onSalir={() => ir("inicio")}
      />
    );
  }

  // Resultados también incluye su propio MarcoPantalla.
  if (vista === "resultados" && sesionAdmin) {
    return <Resultados token={sesionAdmin.token} onSalir={() => ir("inicio")} />;
  }

  return (
    <div style={{ background: "#dce6f2", minHeight: "100vh" }}>
      <MarcoPantalla mostrarMarca={vista !== "inicio"} onSalir={sesionAdmin ? cerrarSesionAdmin : () => ir("inicio")}>
        <div style={{ maxWidth: 1050, margin: "auto", padding: "18px 12px 30px" }}>
          {sesionAdmin && vista !== "inicio" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
              <span>Panel administrativo — Usuario: {sesionAdmin.administrador?.usuario}</span>
              <button style={{ ...boton, background: "#dc3545" }} onClick={cerrarSesionAdmin}>Cerrar sesión</button>
            </div>
          )}


          {vista === "configuracion" && sesionAdmin && (
            <section style={tarjeta}>
              <h2 style={{ color: azul, marginTop: 0 }}>⚙️ Configurar Sistema de Votación</h2>
              <p>Selecciona la opción que deseas configurar.</p>
              {opcionesConfiguracion.map(([id, icono, nombre, descripcion]) => (
                <button key={id} disabled={id === "borrar"} onClick={() => seleccionarOpcion(id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, background: "white", border: "1px solid #c5d7eb", borderRadius: 7, padding: 12, marginBottom: 7, textAlign: "left", cursor: id === "borrar" ? "not-allowed" : "pointer", opacity: id === "borrar" ? 0.45 : 1 }}>
                  <span style={{ fontSize: 25 }}>{icono}</span>
                  <span style={{ flex: 1 }}><strong style={{ color: azul }}>{nombre}</strong><small style={{ display: "block", color: "#64748b", marginTop: 3 }}>{descripcion}</small></span>
                  {id !== "borrar" && <span>❯</span>}
                </button>
              ))}
              {mensaje && <p role="status" style={{ padding: 12, background: "#fff3cd", borderRadius: 7 }}>{mensaje}</p>}
            </section>
          )}

          {vista === "padron" && sesionAdmin && <AgregarVotante onVolver={() => ir("configuracion")} />}
          {vista === "candidatos" && sesionAdmin && <AgregarCandidatos onVolver={() => ir("configuracion")} />}
          {vista !== "inicio" && (
            <button style={{ ...boton, marginTop: 20 }} onClick={volver}>← Volver {vista === "padron" || vista === "candidatos" ? "a configuración" : "al inicio"}</button>
          )}
        </div>
      </MarcoPantalla>
    </div>
  );
}
