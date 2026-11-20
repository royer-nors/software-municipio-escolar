import { useEffect, useState } from "react";
import { consultarEstadoInstalacion } from "../api/inicializacion";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

export default function ConfiguracionInicial() {
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [estado, setEstado] = useState("verificando");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    consultarEstadoInstalacion(controller.signal)
      .then(datos => {
        if (controller.signal.aborted) return;
        if (datos.requiereAdministrador) setEstado("lista");
        else window.location.replace("/?administrador=1");
      })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setEstado("error"); } });
    return () => controller.abort();
  }, [revision]);

  async function crear(e) {
    e.preventDefault();
    setError("");
    if (password !== confirmacion) { setError("Las contraseñas no coinciden."); return; }
    setGuardando(true);
    try {
      const respuesta = await fetch(`${API}/instalacion/administrador-inicial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario, password }),
      });
      const datos = await respuesta.json();
      if (respuesta.status === 409) { window.location.replace("/?administrador=1"); return; }
      if (!respuesta.ok) throw new Error(datos.mensaje || "No se pudo crear el administrador.");
      window.location.assign("/?administrador=1");
    } catch (e) { setError(e.message); }
    finally { setGuardando(false); }
  }

  const fondo = { minHeight: "100vh", display: "grid", placeItems: "center", padding: 20, background: "linear-gradient(135deg, #003b80, #087ad1)", fontFamily: "Arial, sans-serif", boxSizing: "border-box" };
  const tarjeta = { width: 420, maxWidth: "100%", boxSizing: "border-box", background: "white", borderRadius: 16, padding: 32, boxShadow: "0 12px 35px rgba(0,0,0,.18)" };
  const campo = { display: "grid", gap: 7, marginBottom: 16, color: "#333", fontWeight: 600, fontSize: 14 };
  const entrada = { width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 8, border: "1px solid #ccc", fontSize: 15 };

  return <main style={fondo}><section style={tarjeta} aria-busy={estado === "verificando" || guardando}>
    <h1 style={{ color: "#003b80", marginTop: 0 }}>Configuración inicial</h1>
    {estado === "verificando" && <p role="status">Verificando si se necesita crear el administrador…</p>}
    {estado === "error" && <>
      <p role="alert" style={{ color: "#b42318" }}>{error}</p>
      <button type="button" onClick={() => { setError(""); setEstado("verificando"); setRevision(v => v + 1); }}>Reintentar</button>
    </>}
    {estado === "lista" && <>
      <p>Crea la cuenta que administrará el sistema electoral.</p>
      <form onSubmit={crear}>
        <label style={campo} htmlFor="admin-inicial-usuario">Usuario
          <input id="admin-inicial-usuario" style={entrada} value={usuario} onChange={e => setUsuario(e.target.value)} autoComplete="username" required maxLength={50} />
        </label>
        <label style={campo} htmlFor="admin-inicial-password">Contraseña
          <input id="admin-inicial-password" style={entrada} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
        </label>
        <label style={campo} htmlFor="admin-inicial-confirmacion">Confirmar contraseña
          <input id="admin-inicial-confirmacion" style={entrada} type="password" value={confirmacion} onChange={e => setConfirmacion(e.target.value)} autoComplete="new-password" required minLength={8} />
        </label>
        {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
        <button type="submit" disabled={guardando} style={{ width: "100%", padding: 13, border: 0, borderRadius: 8, background: "#086ac3", color: "white", fontWeight: 700, cursor: "pointer" }}>
          {guardando ? "CREANDO…" : "CREAR ADMINISTRADOR"}
        </button>
      </form>
    </>}
  </section></main>;
}
