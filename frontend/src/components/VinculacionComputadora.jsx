import { useRef, useState } from "react";
import Dialogo from "./Dialogo";
import { gestionarVinculacion, etiquetasVinculacion } from "../api/vinculacion";

export default function VinculacionComputadora({ equipo, token, bloqueado, onCambio }) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const [autorizacion, setAutorizacion] = useState(null);
  const enviando = useRef(false);
  async function operar(accion) {
    if (enviando.current || bloqueado) return;
    if (accion === "revocar" && !window.confirm(`¿Revocar la vinculación y cualquier autorización pendiente de ${equipo.identificador}? El puesto perderá acceso inmediatamente.`)) return;
    enviando.current = true; setOcupado(true); setError(""); setAutorizacion(null);
    try {
      const datos = await gestionarVinculacion(equipo.id, accion, token);
      if (accion === "autorizaciones") setAutorizacion(datos);
      onCambio();
    } catch (e) { setError(e.message); }
    finally { enviando.current = false; setOcupado(false); }
  }
  return <div>
    <p>{etiquetasVinculacion[equipo.vinculacion] || "Consultar estado"}</p>
    <div className="control-votacion-acciones">
      <button type="button" disabled={bloqueado || ocupado || !equipo.activo || equipo.vinculacion === "vinculada"} onClick={() => operar("autorizaciones")} aria-label={`Autorizar ${equipo.identificador}`}>Generar autorización</button>
      <button type="button" disabled={bloqueado || ocupado} onClick={() => operar("revocar")} aria-label={`Revocar ${equipo.identificador}`}>Revocar</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {autorizacion && <Dialogo titulo={`Autorización temporal · ${equipo.identificador}`} onCerrar={() => setAutorizacion(null)}>
      <p>Introduce este código una sola vez en la pantalla Vincular puesto del navegador autorizado. Una nueva autorización invalida la anterior.</p>
      <label htmlFor={`codigo-${equipo.id}`}>Código temporal (solo se muestra ahora)</label>
      <textarea id={`codigo-${equipo.id}`} readOnly value={autorizacion.codigo} rows={3} spellCheck={false} />
      <p>Vence: {new Date(autorizacion.vence_en).toLocaleString("es-PE", { timeZone: "America/Lima" })}</p>
      <button type="button" onClick={() => setAutorizacion(null)}>Cerrar y ocultar código</button>
    </Dialogo>}
  </div>;
}
