
import { useState } from "react";

// Modo de prueba: funciona sin backend.
// Cambiar a false cuando se conecte la autenticación real.
const MODO_PRUEBA = false;

export default function LoginAdmin({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mostrarPassword, setMostrarPassword] = useState(false);

  async function ingresar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);

    try {
      // Acceso de demostración, solo en desarrollo.
      if (MODO_PRUEBA) {
        if (usuario === "admin" && password === "123456") {
          onLogin({
            administrador: {
              usuario: "admin",
              rol: "ADMIN"
            },
            modoPrueba: true
          });
        } else {
          setError("Usuario o contraseña incorrectos");
        }
        return;
      }

      // Autenticación real mediante el backend.
      const api =
        import.meta.env.VITE_API_URL ||
        "http://localhost:3000/api";

      const respuesta = await fetch(`${api}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ usuario, password })
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje ||
          "Usuario o contraseña incorrectos"
        );
      }

      onLogin(datos);
    } catch (err) {
      setError(err.message || "Error al iniciar sesión");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={estilos.fondo}>
      <form onSubmit={ingresar} style={estilos.tarjeta}>
        <div style={estilos.encabezado}>
          <span style={{ fontSize: 45 }}>🏫</span>
          <h1 style={estilos.titulo}>Municipio Escolar</h1>
          <p style={estilos.subtitulo}>
            Sistema de Votación Escolar
          </p>
        </div>

        <h2 style={estilos.seccion}>Inicio de sesión</h2>
        <p style={estilos.descripcion}>
          Acceso administrativo
        </p>

        {MODO_PRUEBA && (
          <div style={estilos.aviso}>
            Modo demostración
          </div>
        )}

        <div style={estilos.campo}>
          <label htmlFor="usuario" style={estilos.label}>
            Usuario
          </label>
          <input
            id="usuario"
            style={estilos.input}
            placeholder="Ingrese su usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div style={estilos.campo}>
          <label htmlFor="password" style={estilos.label}>
            Contraseña
          </label>

          <input
            id="password"
            style={estilos.input}
            type={mostrarPassword ? "text" : "password"}
            placeholder="Ingrese su contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <label style={estilos.mostrar}>
            <input
              type="checkbox"
              checked={mostrarPassword}
              onChange={(e) =>
                setMostrarPassword(e.target.checked)
              }
            />
            Mostrar contraseña
          </label>
        </div>

        {error && (
          <p role="alert" style={estilos.error}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          style={estilos.boton}
        >
          {cargando ? "INGRESANDO..." : "INGRESAR"}
        </button>

        <p style={estilos.pie}>
          Plataforma de Administración Electoral
        </p>
      </form>
    </div>
  );
}

const estilos = {
  fondo: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #003b80, #087ad1)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "20px",
    boxSizing: "border-box",
    fontFamily: "Arial, sans-serif"
  },

  tarjeta: {
    background: "#ffffff",
    padding: "32px",
    borderRadius: "16px",
    width: "390px",
    maxWidth: "100%",
    boxSizing: "border-box",
    boxShadow: "0 12px 35px rgba(0,0,0,0.18)"
  },

  encabezado: {
    textAlign: "center",
    marginBottom: "22px"
  },

  titulo: {
    fontSize: "27px",
    lineHeight: "1.2",
    margin: "8px 0",
    color: "#003b80"
  },

  subtitulo: {
    fontSize: "13px",
    color: "#666",
    margin: 0
  },

  seccion: {
    fontSize: "22px",
    textAlign: "center",
    margin: "12px 0 5px",
    color: "#222"
  },

  descripcion: {
    textAlign: "center",
    color: "#777",
    fontSize: "14px",
    marginBottom: "20px"
  },

  aviso: {
    textAlign: "center",
    background: "#fff4d6",
    color: "#805800",
    padding: "9px",
    borderRadius: "8px",
    marginBottom: "15px",
    fontSize: "13px"
  },

  campo: {
    marginBottom: "16px"
  },

  label: {
    display: "block",
    fontSize: "14px",
    fontWeight: "bold",
    marginBottom: "7px",
    color: "#333"
  },

  input: {
    width: "100%",
    padding: "13px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    boxSizing: "border-box",
    fontSize: "14px"
  },

  mostrar: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginTop: "8px",
    fontSize: "12px",
    color: "#555"
  },

  error: {
    color: "#b42318",
    background: "#fee4e2",
    padding: "10px",
    borderRadius: "8px",
    fontSize: "13px"
  },

  boton: {
    width: "100%",
    padding: "14px",
    background: "#086ac3",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    fontSize: "14px"
  },

  pie: {
    marginTop: "22px",
    textAlign: "center",
    fontSize: "12px",
    color: "#888"
  }
};
