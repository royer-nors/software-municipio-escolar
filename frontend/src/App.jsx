
import { useEffect, useState } from "react";

import "./admin-profesional.css";

import MarcoPantalla from "./components/MarcoPantalla";
import MarcoAdministrativo from "./components/MarcoAdministrativo";
import PanelAdministrativo from "./components/PanelAdministrativo";
import NavegacionAdministrativa from "./components/NavegacionAdministrativa";

import Bienvenida from "./pages/Bienvenida";
import LoginAdmin from "./pages/LoginAdmin";
import Resultados from "./pages/Resultados";
import AccesoResultados from "./pages/AccesoResultados";

import AgregarVotante from "./components/AgregarVotante";
import AgregarCandidatos from "./components/AgregarCandidatos";

import AutenticarVotante from "./pages/AutenticarVotante";
import VotanteIdentificado from "./pages/VotanteIdentificado";
import ListasCandidatos from "./pages/ListasCandidatos";

import ConfigurarCentroEducativo from "./components/ConfigurarCentroEducativo";
import ControlVotacion from "./components/ControlVotacion";
import ConfigurarVotoBlanco from "./components/ConfigurarVotoBlanco";
import ConfigurarSeguridad from "./components/ConfigurarSeguridad";

import BorrarDatos from "./components/BorrarDatos";
import GestionComputadoras from "./components/GestionComputadoras";
import GestionConsultores from "./components/GestionConsultores";
import ConfiguracionInicial from "./pages/ConfiguracionInicial";
import VincularPuesto from "./pages/VincularPuesto";

const API =
  import.meta.env.VITE_API_URL ||
  "http://localhost:3000/api";

const azul = "#0759b8";

const nombresModulos = {
  "control-votacion": "Control de votación",
  computadoras: "Computadoras de votación",
  consultores: "Consultores de resultados",
  padron: "Padrón electoral",
  candidatos: "Listas y candidatos",
  borrar: "Datos de prueba",
};

const boton = {
  background: azul,
  color: "#fff",
  border: "none",
  borderRadius: 9,
  padding: "12px 23px",
  cursor: "pointer",
  fontSize: 15,
};

// Componente principal de la aplicación
export default function App() {
  const esPuesto =
    window.location.pathname === "/puesto" ||
    new URLSearchParams(window.location.search).get("puesto") === "1";

  if (esPuesto) {
    return <VincularPuesto />;
  }

  return <ComprobarAdministradorInicial />;
}

function ComprobarAdministradorInicial() {
  const [requiere, setRequiere] = useState(null);
  useEffect(() => {
    fetch(`${API}/instalacion/estado`)
      .then(respuesta => respuesta.ok ? respuesta.json() : null)
      .then(datos => setRequiere(datos?.requiereAdministrador === true))
      .catch(() => setRequiere(false));
  }, []);
  if (requiere === null) return <p role="status" style={{ padding: 30 }}>Verificando configuración inicial…</p>;
  return requiere ? <ConfiguracionInicial /> : <AplicacionAdministrativa />;

}

// Administración y navegación del sistema
function AplicacionAdministrativa() {
  const [avisoSesion, setAvisoSesion] = useState("");
  const [vista, setVista] = useState(() => new URLSearchParams(window.location.search).get("administrador") === "1" ? "acceso" : "inicio");

  const [destino, setDestino] = useState(null);

  const [sesionAdmin, setSesionAdmin] = useState(null);

  const [verificando, setVerificando] = useState(
    () => Boolean(sessionStorage.getItem("admin_token"))
  );

  const [mensaje, setMensaje] = useState("");

  const [pasoVotacion, setPasoVotacion] =
    useState("autenticar");

  const [sesionEstudiante, setSesionEstudiante] =
    useState(null);

  const [mostrarCentro, setMostrarCentro] =
    useState(false);

  const [mostrarVotoBlanco, setMostrarVotoBlanco] =
    useState(false);

  const [mostrarSeguridad, setMostrarSeguridad] =
    useState(false);

  // Verificar sesión administrativa
  useEffect(() => {
    const token = sessionStorage.getItem("admin_token");

    if (!token) {
      return;
    }

    fetch(`${API}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
          administrador: datos.administrador,
        });
        if (new URLSearchParams(window.location.search).get("administrador") === "1") setVista("configuracion");
      })
      .catch(() => {
        sessionStorage.removeItem("admin_token");
        setSesionAdmin(null);
      })
      .finally(() => {
        setVerificando(false);
      });
  }, []);

  // Finalizar votación estudiantil
  function finalizarVotacion() {
    localStorage.removeItem("tokenEstudiante");
    sessionStorage.removeItem("tokenEstudiante");

    setSesionEstudiante(null);
    setPasoVotacion("autenticar");
  }

  // Cambiar de pantalla
  function ir(nuevaVista) {
    if (
      vista === "votacion" &&
      nuevaVista !== "votacion"
    ) {
      finalizarVotacion();
    }

    setMostrarCentro(false);
    setMostrarVotoBlanco(false);
    setMostrarSeguridad(false);
    setMensaje("");
    setVista(nuevaVista);

    if (
      nuevaVista === "configuracion" ||
      nuevaVista === "resultados" ||
      Object.hasOwn(nombresModulos, nuevaVista)
    ) {
      window.scrollTo(0, 0);
    }
  }

  // Cerrar sesión administrativa
  function cerrarSesionAdmin() {
    sessionStorage.removeItem("admin_token");

    setSesionAdmin(null);
    setDestino(null);

    setMostrarCentro(false);
    setMostrarVotoBlanco(false);
    setMostrarSeguridad(false);

    finalizarVotacion();
    ir("inicio");
  }

  // Ingresar a un módulo del sistema
  function entrarA(modulo) {
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

  // Inicio de sesión correcto
  function loginCorrecto(datos) {
    if (!datos?.token || !datos?.administrador) {
      throw new Error(
        "El backend no devolvió una sesión válida."
      );
    }

    sessionStorage.setItem(
      "admin_token",
      datos.token
    );

    setSesionAdmin(datos);

    const siguienteVista =
      destino || "configuracion";

    setDestino(null);
    ir(siguienteVista);
  }

  // Seleccionar opciones administrativas
  function seleccionarOpcion(id) {
    if (id === "centro") {
      setMostrarCentro(true);
      setMensaje("");
      return;
    }

    if (
      id === "control-votacion" ||
      id === "computadoras" ||
      id === "consultores" ||
      id === "padron" ||
      id === "candidatos"
    ) {
      ir(id);
      return;
    }

    if (id === "blanco") {
      setMostrarVotoBlanco(true);
      setMensaje("");
      return;
    }

    if (id === "seguridad") {
      ir("configuracion");
      setMostrarSeguridad(true);
      setMensaje("");
      return;
    }

    if (id === "borrar") {
      ir("borrar");
      return;
    }

    setMensaje(
      "Esta opción está pendiente de integración."
    );
  }

  // Volver a la pantalla anterior
  function volver() {
    if (
      vista === "control-votacion" ||
      vista === "computadoras" ||
      vista === "consultores" ||
      vista === "padron" ||
      vista === "candidatos" ||
      vista === "borrar"
    ) {
      ir("configuracion");
    } else {
      ir("inicio");
    }
  }

  // Verificar sesión administrativa
  if (verificando) {
    return (
      <p style={{ padding: 30 }}>
        Verificando sesión...
      </p>
    );
  }

  // Consulta pública de resultados
  if (vista === "consulta-resultados") {
    return (
      <AccesoResultados
        onSalir={() => ir("inicio")}
      />
    );
  }

  // Pantalla principal
  if (vista === "inicio") {
    return (
      <MarcoPantalla
        mostrarMarca={false}
        etiquetaCabecera="MUNICIPIO ESCOLAR · VOTACIÓN DIGITAL"
        onSalir={() => ir("inicio")}
      >
        <Bienvenida
          onResultados={() =>
            ir("consulta-resultados")
          }
          onVotar={() =>
            window.location.assign("?puesto=1")
          }
          onAdministrador={() =>
            entrarA("configuracion")
          }
        />

        <p>
          <a href="?puesto=1">
            Vincular una computadora de votación
          </a>
        </p>
      </MarcoPantalla>
    );
  }

  // Inicio de sesión administrativo
  if (vista === "acceso") {
    return (
      <div>
        <button
          type="button"
          style={{
            ...boton,
            margin: 15,
          }}
          onClick={() => {
            setDestino(null);
            ir("inicio");
          }}
        >
          ← Volver al inicio
        </button>

        {avisoSesion && (
          <p
            role="status"
            style={{
              padding: 16,
              color: azul,
            }}
          >
            {avisoSesion}
          </p>
        )}

        <LoginAdmin
          onLogin={(datos) => {
            setAvisoSesion("");
            loginCorrecto(datos);
          }}
        />
      </div>
    );
  }

  // VOTACIÓN ESTUDIANTIL
  if (vista === "votacion") {
    if (
      pasoVotacion === "identificado" &&
      sesionEstudiante
    ) {
      return (
        <VotanteIdentificado
          estudiante={sesionEstudiante.estudiante}
          onVotar={() =>
            setPasoVotacion("papeleta")
          }
          onSalir={() => ir("inicio")}
        />
      );
    }

    if (
      pasoVotacion === "papeleta" &&
      sesionEstudiante
    ) {
      return (
        <ListasCandidatos
          token={sesionEstudiante.token}
          estudiante={sesionEstudiante.estudiante}
          onFinalizar={finalizarVotacion}
          onSalir={finalizarVotacion}
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

  // RESULTADOS ELECTORALES
  if (
    vista === "resultados" &&
    sesionAdmin
  ) {
    return (
      <Resultados
        token={sesionAdmin.token}
        usuario={sesionAdmin.administrador?.usuario}
        onVolver={() => ir("configuracion")}
        onSeguridad={() =>
          seleccionarOpcion("seguridad")
        }
        onConsultores={() =>
          seleccionarOpcion("consultores")
        }
        onSalir={cerrarSesionAdmin}
      />
    );
  }

  // PANEL ADMINISTRATIVO
  return (
    <MarcoAdministrativo
      usuario={sesionAdmin?.administrador?.usuario}
      onSeguridad={() =>
        seleccionarOpcion("seguridad")
      }
      onConsultores={() =>
        seleccionarOpcion("consultores")
      }
      onCerrarSesion={cerrarSesionAdmin}
    >
      <div
        key={vista}
        className="admin-contenedor admin-transicion"
      >
        {/* NAVEGACIÓN ADMINISTRATIVA */}
        {sesionAdmin &&
          vista !== "inicio" &&
          vista !== "configuracion" && (
            <NavegacionAdministrativa
              onVolver={volver}
            />
          )}

        {/* MENÚ DE CONFIGURACIÓN */}
        {vista === "configuracion" &&
          sesionAdmin && (
            <PanelAdministrativo
              token={sesionAdmin.token}
              onSeleccionar={seleccionarOpcion}
              onResultados={() =>
                entrarA("resultados")
              }
              modalAbierto={
                mostrarCentro ||
                mostrarVotoBlanco ||
                mostrarSeguridad
              }
              mensaje={mensaje}
            />
          )}

        {/* CONFIGURAR CENTRO EDUCATIVO */}
        {vista === "configuracion" &&
          sesionAdmin &&
          mostrarCentro && (
            <ConfigurarCentroEducativo
              token={sesionAdmin.token}
              onVolver={() =>
                setMostrarCentro(false)
              }
            />
          )}

        {/* CONTROL DE VOTACIÓN */}
        {vista === "control-votacion" &&
          sesionAdmin && (
            <ControlVotacion
              token={sesionAdmin.token}
            />
          )}

        {/* GESTIÓN DE COMPUTADORAS */}
        {vista === "computadoras" &&
          sesionAdmin && (
            <GestionComputadoras
              token={sesionAdmin.token}
            />
          )}

        {/* CONSULTORES DE RESULTADOS */}
        {vista === "consultores" &&
          sesionAdmin && (
            <GestionConsultores
              token={sesionAdmin.token}
            />
          )}

        {/* BORRAR DATOS DE PRUEBA */}
        {vista === "borrar" &&
          sesionAdmin && (
            <BorrarDatos
              token={sesionAdmin.token}
            />
          )}

        {/* CONFIGURAR VOTO EN BLANCO */}
        {vista === "configuracion" &&
          sesionAdmin &&
          mostrarVotoBlanco && (
            <ConfigurarVotoBlanco
              token={sesionAdmin.token}
              onVolver={() =>
                setMostrarVotoBlanco(false)
              }
            />
          )}

        {/* CONFIGURAR SEGURIDAD */}
        {vista === "configuracion" &&
          sesionAdmin &&
          mostrarSeguridad && (
            <ConfigurarSeguridad
              token={sesionAdmin.token}
              onPasswordCambiada={() => {
                cerrarSesionAdmin();

                setAvisoSesion(
                  "Contraseña actualizada. Inicia sesión nuevamente con tu nueva contraseña."
                );

                setDestino("configuracion");
                setVista("acceso");
              }}
              onVolver={() =>
                setMostrarSeguridad(false)
              }
            />
          )}

        {/* GESTIÓN DE ESTUDIANTES */}
        {vista === "padron" &&
          sesionAdmin && (
            <AgregarVotante
              token={sesionAdmin.token}
            />
          )}

        {/* GESTIÓN DE CANDIDATOS */}
        {vista === "candidatos" &&
          sesionAdmin && (
            <AgregarCandidatos
              token={sesionAdmin.token}
            />
          )}
      </div>
    </MarcoAdministrativo>
  );
}
