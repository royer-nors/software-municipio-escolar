import { useState } from "react";
import Bienvenida from "./pages/Bienvenida";
import AutenticarVotante from "./pages/AutenticarVotante";
import VotanteIdentificado from "./pages/VotanteIdentificado";
import ListasCandidatos from "./pages/ListasCandidatos";

// PRUEBA TEMPORAL: encadena las pantallas del estudiante para verlas juntas.
// Se reemplazará por la navegación real del proyecto (rama login-menu).
export default function PruebaEstudiante() {
  const [paso, setPaso] = useState("bienvenida"); // bienvenida | dni | identificado | listas
  const [sesion, setSesion] = useState(null);

  function salir() {
    setSesion(null);
    setPaso("bienvenida");
  }

  if (paso === "bienvenida") {
    return (
      <Bienvenida
        onVotar={() => setPaso("dni")}
        onAyuda={() => alert("Pide ayuda al encargado del proceso.")}
        onSalir={salir}
      />
    );
  }

  if (paso === "dni") {
    return (
      <AutenticarVotante
        onAutenticado={(datos) => {
          setSesion(datos);
          setPaso("identificado");
        }}
        onSalir={salir}
      />
    );
  }

  if (paso === "identificado") {
    return (
      <VotanteIdentificado
        estudiante={sesion.estudiante}
        onVotar={() => setPaso("listas")}
        onSalir={salir}
      />
    );
  }

  return (
    <ListasCandidatos
      token={sesion.token}
      estudiante={sesion.estudiante}
      onFinalizar={salir}
      onSalir={salir}
    />
  );
}
