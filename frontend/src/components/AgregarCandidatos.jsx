import { useEffect, useRef, useState } from "react";
import { registrarCandidatura, validarImagen } from "../api/candidaturas";
import ImagenElectoral from "./ImagenElectoral";
import "../styles/candidaturas.css";

function CampoImagen({ titulo, onArchivo, disabled }) {
  const input = useRef(null);
  const urlActual = useRef("");
  const [vista, setVista] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => { if (urlActual.current) URL.revokeObjectURL(urlActual.current); }, []);
  function limpiar() {
    if (urlActual.current) URL.revokeObjectURL(urlActual.current);
    urlActual.current = ""; setVista(""); setNombre(""); onArchivo(null);
    if (input.current) input.current.value = "";
  }
  function cambiar(e) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setError("");
    try {
      validarImagen(archivo);
      limpiar();
      urlActual.current = URL.createObjectURL(archivo);
      setVista(urlActual.current); setNombre(archivo.name); onArchivo(archivo);
    } catch (err) { limpiar(); setError(err.message); }
  }
  return <section className="candidatura-imagen-campo">
    <h3>{titulo}</h3>
    <p>JPG, JPEG, PNG o WebP · Máximo 2 MiB</p>
    <input ref={input} type="file" accept=".jpg,.jpeg,.png,.webp" hidden onChange={cambiar} disabled={disabled} />
    <button type="button" className="btn-claro" disabled={disabled} onClick={() => input.current.click()}>{vista ? "Cambiar imagen" : "Seleccionar imagen"}</button>
    {vista && <><img className="candidatura-vista-previa" src={vista} alt={`Vista previa: ${titulo}`} /><span>{nombre}</span>
      <button type="button" className="btn-claro" disabled={disabled} onClick={limpiar}>Quitar imagen</button></>}
    {error && <p role="alert" className="candidatura-error">{error}</p>}
  </section>;
}

const inicial = { numeroLista: "", nombreLista: "", candidatoAlcalde: "", propuesta1: "", propuesta2: "" };
export default function AgregarCandidatos({ onVolver, token }) {
  const [lista, setLista] = useState(inicial);
  const [logo, setLogo] = useState(null);
  const [foto, setFoto] = useState(null);
  const [planTrabajo, setPlanTrabajo] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [guardada, setGuardada] = useState(null);
  const [revision, setRevision] = useState(0);
  const ocupado = useRef(false);
  const planInput = useRef(null);
  function cambiar(e) { setLista(l => ({ ...l, [e.target.name]: e.target.value })); }
  async function guardar(e) {
    e.preventDefault();
    if (ocupado.current) return;
    if (planTrabajo) { setError("La carga de planes PDF/Word aún no está disponible. Quita el documento para guardar la lista y sus imágenes."); return; }
    ocupado.current = true; setGuardando(true); setError(""); setGuardada(null);
    try {
      const datos = await registrarCandidatura(lista, logo, foto, token || sessionStorage.getItem("admin_token"));
      setGuardada(datos); setLista(inicial); setLogo(null); setFoto(null); setRevision(r => r + 1);
    } catch (err) { setError(err.message); }
    finally { ocupado.current = false; setGuardando(false); }
  }
  return <div className="candidatura-formulario">
    <div className="candidatura-cabecera"><h2>Registrar Lista de Candidatos</h2><button type="button" className="btn-claro" onClick={onVolver} disabled={guardando}>Volver</button></div>
    <p>Registra la lista y su candidato a alcalde o alcaldesa antes de abrir la votación.</p>
    <form onSubmit={guardar}><fieldset disabled={guardando}>
      <label>Número de Lista<input type="number" name="numeroLista" value={lista.numeroLista} onChange={cambiar} min="1" max="2147483647" step="1" required /></label>
      <label>Nombre de la Lista<input name="nombreLista" value={lista.nombreLista} onChange={cambiar} maxLength={100} required /></label>
      <label>Candidato a Alcalde/sa<input name="candidatoAlcalde" value={lista.candidatoAlcalde} onChange={cambiar} maxLength={100} required /></label>
      <div className="candidatura-imagenes">
        <CampoImagen key={`logo-${revision}`} titulo="Logo de la lista electoral" onArchivo={setLogo} disabled={guardando} />
        <CampoImagen key={`foto-${revision}`} titulo="Fotografía del candidato a alcalde o alcaldesa" onArchivo={setFoto} disabled={guardando} />
      </div>
      <label>Propuesta 1<input name="propuesta1" value={lista.propuesta1} onChange={cambiar} maxLength={1000} /></label>
      <label>Propuesta 2<input name="propuesta2" value={lista.propuesta2} onChange={cambiar} maxLength={1000} /></label>
      <label>Plan de Trabajo (opcional; carga de documentos pendiente)<input ref={planInput} type="file" accept=".pdf,.doc,.docx" onChange={e => setPlanTrabajo(e.target.files?.[0] || null)} /></label>
      {planTrabajo && <button type="button" className="btn-claro" onClick={() => { setPlanTrabajo(null); planInput.current.value = ""; }}>Quitar documento</button>}
      <button type="submit" className="electoral-btn-azul" disabled={guardando}>{guardando ? "Guardando lista…" : "Guardar Lista de Candidatos"}</button>
    </fieldset></form>
    {error && <p role="alert" className="candidatura-error">{error}</p>}
    {guardada && <div role="status" className="candidatura-exito"><strong>Lista {guardada.numero}: {guardada.nombre} registrada correctamente.</strong>
      <p>Candidato: {guardada.candidatos[0].nombre}</p>
      <div className="candidatura-imagenes">
        {guardada.logo_url && <ImagenElectoral src={guardada.logo_url} alt={`Logo de ${guardada.nombre}`} />}
        {guardada.candidatos[0].foto_url && <ImagenElectoral src={guardada.candidatos[0].foto_url} alt={guardada.candidatos[0].nombre} />}
      </div>
    </div>}
  </div>;
}
