import { useState } from "react";
import { loginEstudiante } from "./api/estudiantes";
import VotanteIdentificado from "./pages/VotanteIdentificado";
import ListasCandidatos from "./pages/ListasCandidatos";

// PRUEBA TEMPORAL: sustituye al login real mientras se integra la rama login-menu.
export default function PruebaEstudiante() {
  const [dni, setDni] = useState("");
  const [error, setError] = useState("");
  const [sesion, setSesion] = useState(null);
  const [pantalla, setPantalla] = useState("identificado");

  async function entrar(e) {
    e.preventDefault();
    setError("");
    try {
      const datos = await loginEstudiante(dni);
      setSesion({ token: datos.token, estudiante: datos.estudiante });
      setPantalla("identificado");
    } catch (err) {
      setError(err.message);
    }
  }

  function salir() {
    setSesion(null);
    setDni("");
  }

  if (!sesion) {
    return (
      <form onSubmit={entrar} style={{ padding: 24 }}>
        <label>
          DNI de prueba:{" "}
          <input value={dni} onChange={(e) => setDni(e.target.value)} maxLength={8} />
        </label>{" "}
        <button type="submit">Entrar</button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>
    );
  }

  if (pantalla === "identificado") {
    return (
      <VotanteIdentificado
        estudiante={sesion.estudiante}
        onVotar={() => setPantalla("listas")}
        onSalir={salir}
      />
    );
  }

  return (
    <ListasCandidatos
      token={sesion.token}
      estudiante={sesion.estudiante}
      onVotar={(sel) => alert(`Selección: ${JSON.stringify(sel)}\n(El endpoint para registrar el voto aún no existe.)`)}
      onSalir={salir}
    />
  );
}
