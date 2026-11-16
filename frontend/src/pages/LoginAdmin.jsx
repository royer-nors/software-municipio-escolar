
import { useState } from "react";
import "./LoginAdmin.css";

// Mantener autenticación real con el backend.
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
    <div className="login-admin-fondo">
      <div className="login-admin-decoracion" aria-hidden="true" />

      <form onSubmit={ingresar} className="login-admin-tarjeta">
        <div className="login-admin-encabezado">
          <div className="login-admin-logo">
            <img
              src={`${import.meta.env.BASE_URL}logoo.png`}
              alt="Escudo de la institución educativa"
            />
          </div>

          <h1>Municipio Escolar</h1>
          <p>Sistema de Votación Escolar</p>
        </div>

        <div className="login-admin-separador" />

        <h2 className="login-admin-titulo">
          Inicio de sesión
        </h2>

        <p className="login-admin-descripcion">
          Acceso al panel de administración electoral
        </p>

        {MODO_PRUEBA && (
          <div className="login-admin-aviso">
            Modo demostración
          </div>
        )}

        <div className="login-admin-campo">
          <label htmlFor="usuario">
            Usuario
          </label>
          <input
            id="usuario"
            type="text"
            placeholder="Ingrese su usuario"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            required
          />
        </div>

        <div className="login-admin-campo">
          <label htmlFor="password">
            Contraseña
          </label>

          <input
            id="password"
            type={mostrarPassword ? "text" : "password"}
            placeholder="Ingrese su contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          <label className="login-admin-mostrar">
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
          <p role="alert" className="login-admin-error">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="login-admin-boton"
        >
          {cargando ? "INGRESANDO..." : "INGRESAR"}
        </button>

        <p className="login-admin-pie">
          Plataforma de Administración Electoral
        </p>
      </form>
    </div>
  );
}
