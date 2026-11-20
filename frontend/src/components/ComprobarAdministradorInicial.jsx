import { useEffect, useState } from "react";
import { consultarEstadoInstalacion } from "../api/inicializacion";
import ConfiguracionInicial from "../pages/ConfiguracionInicial";

export default function ComprobarAdministradorInicial({ children }) {
  const [estado, setEstado] = useState({ tipo: "verificando" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    consultarEstadoInstalacion(controller.signal)
      .then(datos => { if (!controller.signal.aborted) setEstado({ tipo: "confirmado", requiere: datos.requiereAdministrador }); })
      .catch(error => { if (!controller.signal.aborted) setEstado({ tipo: "error", mensaje: error.message }); });
    return () => controller.abort();
  }, [revision]);

  if (estado.tipo === "verificando") return <p role="status" style={{ padding: 30 }}>Verificando configuración inicial…</p>;
  if (estado.tipo === "error") return <main style={{ padding: 30 }}>
    <h1>No se pudo verificar la configuración inicial</h1>
    <p role="alert">{estado.mensaje}</p>
    <button type="button" onClick={() => { setEstado({ tipo: "verificando" }); setRevision(v => v + 1); }}>Reintentar</button>
  </main>;
  return estado.requiere ? <ConfiguracionInicial /> : children;
}
