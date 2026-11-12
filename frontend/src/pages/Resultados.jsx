import { useEffect, useRef, useState } from "react";
import MarcoPantalla from "../components/MarcoPantalla";
import Avatar from "../components/Avatar";
import ImagenElectoral from "../components/ImagenElectoral";
import { esperarImagenes } from "../utils/imagenes";
import { obtenerResultados } from "../api/estudiantes";
import { cantidad, coloresPorNombre, porcentaje, posicion, TONOS } from "../utils/elecciones";
import "../styles/elecciones.css";

function GraficoCircular({ listas, total, colores }) {
  const segmentos = listas.map((lista, index) => {
    const longitud = total === 0 ? 0 : lista.votos / total * 100;
    const inicio = total === 0 ? 0 : listas.slice(0, index).reduce((suma, anterior) => suma + anterior.votos, 0) / total * 100;
    return { ...lista, longitud, inicio };
  });
  return (
    <div className="electoral-anillo" role="img" aria-label={total === 0
      ? "Sin votos válidos registrados."
      : `Distribución de ${cantidad(total)} votos válidos. ${listas.map(l => `${l.nombre}: ${porcentaje(l.porcentaje)}`).join(". ")}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="48" fill="none" stroke="#e3eaf3" strokeWidth="13" />
        {segmentos.filter(l => l.longitud > 0).map(l => <circle key={l.nombre} cx="60" cy="60" r="48" fill="none"
          stroke={TONOS[colores.get(l.nombre)]} strokeWidth="13" pathLength="100"
          strokeDasharray={`${l.longitud} ${100 - l.longitud}`} strokeDashoffset={-l.inicio} transform="rotate(-90 60 60)" />)}
      </svg>
      <div><strong>{cantidad(total)}</strong><span>votos válidos</span></div>
    </div>
  );
}

export default function Resultados({ token, onSalir }) {
  // Conserva sessionStorage.admin_token y admite la sesión entregada por App.
  const tokenAdmin = token || sessionStorage.getItem("admin_token") || "";
  const [revision, setRevision] = useState(0);
  const [estado, setEstado] = useState({ data: null, error: "", cargando: true });
  const [imprimiendo, setImprimiendo] = useState(false);
  const [errorImpresion, setErrorImpresion] = useState("");
  const reporte = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (!tokenAdmin) throw new Error("No se encontró una sesión administrativa. Inicia sesión nuevamente.");
      return obtenerResultados(tokenAdmin, controller.signal);
    }).then(data => {
      if (!controller.signal.aborted) setEstado({ data, error: "", cargando: false });
    }).catch(error => {
      if (!controller.signal.aborted) setEstado({ data: null, error: error.message, cargando: false });
    });
    return () => controller.abort();
  }, [tokenAdmin, revision]);

  function actualizar() {
    setErrorImpresion("");
    setEstado({ data: null, error: "", cargando: true });
    setRevision(v => v + 1);
  }

  const { data, error, cargando } = estado;
  const resumen = data?.resumen;
  const colores = coloresPorNombre(data?.listas || []);
  const fechaReporte = data ? new Date(data.generadoEn).toLocaleString("es-PE", { timeZone: "America/Lima" }) : "";
  const primeros = data?.listas.filter(l => l.posicion === 1) || [];
  async function imprimir() {
    if (imprimiendo) return;
    setImprimiendo(true); setErrorImpresion("");
    try { await esperarImagenes(reporte.current.closest('.marco')); window.print(); }
    catch (e) { setErrorImpresion(e.message); }
    finally { setImprimiendo(false); }
  }

  return (
    <MarcoPantalla electoral onSalir={onSalir}>
      <section ref={reporte} className="electoral-resultados" aria-busy={cargando}>
        <div className="electoral-encabezado-resultados">
          <div className="electoral-titulo-con-icono"><span className="electoral-icono" aria-hidden="true">▣</span>
            <div><h2>RESULTADOS DE LA ELECCIÓN</h2><p>Municipio Escolar · Resultados por lista</p></div></div>
          <div className="electoral-acciones">
            <button type="button" className="btn-claro" disabled={cargando || imprimiendo} onClick={actualizar}>Actualizar</button>
            <button type="button" className="electoral-btn-azul" disabled={!data || cargando || Boolean(error) || imprimiendo} onClick={imprimir}>{imprimiendo ? 'Preparando imágenes…' : 'Imprimir resultados'}</button>
          </div>
        </div>
        {cargando && <div className="estado" role="status"><span className="electoral-cargando" aria-hidden="true" />Consultando resultados del proceso electoral…</div>}
        {error && <div className="electoral-alerta electoral-alerta-error" role="alert"><strong>No se pudieron mostrar los resultados.</strong><p>{error}</p></div>}
        {errorImpresion && <p role="alert" className="electoral-alerta electoral-alerta-error electoral-error-impresion">{errorImpresion}</p>}
        {!cargando && !error && data && <>
          <p className="electoral-fecha-reporte">Reporte generado: {fechaReporte} (hora de Perú)</p>
          <h1 className="electoral-titulo-impreso">RESULTADOS DE ELECCIONES DEL MUNICIPIO ESCOLAR</h1>
          <p className="electoral-total-votos">Total de votos registrados: <strong>{cantidad(resumen.votosEmitidos)}</strong></p>
          {resumen.votosValidos > 0 && primeros.length > 0 && <p className="electoral-ganadora">
            <strong>{primeros.length === 1 ? 'Lista ganadora según el conteo actual: ' : 'Empate en el primer lugar: '}</strong>{primeros.map(l => l.nombre).join(' · ')}
          </p>}
          {data.listas.length === 0 && <p className="electoral-alerta">No hay listas electorales registradas para mostrar.</p>}
          <div className="electoral-ranking">
            {data.listas.map(lista => <article key={lista.nombre} className={`electoral-resultado tarjeta-${colores.get(lista.nombre)}`}>
              <div className="electoral-resultado-cabecera"><span>{lista.numero ? `Lista ${lista.numero}` : lista.id ? `ID ${lista.id}` : 'Lista electoral'}</span><strong>{posicion(lista.posicion)}</strong></div>
              {lista.logoUrl && <ImagenElectoral src={lista.logoUrl} alt={`Logo de ${lista.nombre}`} className="electoral-logo-lista" />}
              <div className="electoral-resultado-cifras"><div className="electoral-avatares-ilustrativos">
                {(() => { const candidato = lista.candidatos?.find(c => /alcald/i.test(c.cargo || '')) || lista.candidatos?.[0];
                  return candidato?.fotoUrl
                    ? <ImagenElectoral src={candidato.fotoUrl} alt={candidato.nombre} className="electoral-foto" />
                    : <Avatar tam={36} tono={TONOS[colores.get(lista.nombre)]} />;
                })()}
              </div><div><strong>{porcentaje(lista.porcentaje)}</strong><span>{cantidad(lista.votos)} votos</span></div></div>
              <h3>{lista.nombre}</h3>
              {lista.candidatos?.filter((c, i) => /alcald/i.test(c.cargo || '') || i === 0).map(c => <p className="electoral-candidato-resultado" key={c.id}>{c.nombre}{c.cargo && <small>{c.cargo}</small>}</p>)}
            </article>)}
          </div>
          <div className="electoral-estadisticas">
            <section className="panel electoral-resumen">
              <h3>Resumen de la votación</h3>
              <div className="electoral-resumen-contenido">
                <GraficoCircular listas={data.listas} total={resumen.votosValidos} colores={colores} />
                <dl>
                  <div><dt>Estudiantes habilitados</dt><dd>{cantidad(resumen.estudiantesHabilitados)}</dd></div>
                  <div><dt>Votos emitidos</dt><dd>{cantidad(resumen.votosEmitidos)}</dd></div>
                  <div><dt>No votaron</dt><dd>{cantidad(resumen.noVotaron)}</dd></div>
                  <div className="electoral-participacion"><dt>Participación</dt><dd>{porcentaje(resumen.participacion)}</dd></div>
                </dl>
              </div>
            </section>
            <section className="panel electoral-barras">
              <div className="electoral-barras-titulo"><h3>Porcentaje de votos por lista</h3><span>Base: {cantidad(resumen.votosValidos)} votos válidos</span></div>
              {resumen.votosValidos === 0 && <p className="electoral-sin-votos">Aún no hay votos válidos. No se asignan posiciones.</p>}
              {data.listas.map(lista => <div className="electoral-barra-fila" key={lista.nombre}>
                <span title={lista.nombre}>{lista.nombre}</span>
                <div className="electoral-barra-fondo" aria-hidden="true"><span style={{ width: `${lista.porcentaje}%`, background: TONOS[colores.get(lista.nombre)] }} /></div>
                <strong>{porcentaje(lista.porcentaje)}</strong>
              </div>)}
              <p className="electoral-nota">Votos en blanco: <strong>{cantidad(resumen.votosEnBlanco)}</strong> · Votos nulos: <strong>{cantidad(resumen.votosNulos)}</strong></p>
            </section>
          </div>
          <details className="panel electoral-detalle">
            <summary>Ver detalle de los resultados</summary>
            <div className="electoral-tabla-scroll"><table>
              <caption>Votos válidos por lista electoral</caption>
              <thead><tr><th scope="col">Posición</th><th scope="col">Lista electoral</th><th scope="col">Votos</th><th scope="col">Porcentaje</th></tr></thead>
              <tbody>{data.listas.map(lista => <tr key={lista.nombre}><td>{posicion(lista.posicion)}</td><th scope="row">{lista.nombre}</th><td>{cantidad(lista.votos)}</td><td>{porcentaje(lista.porcentaje)}</td></tr>)}</tbody>
            </table></div>
          </details>
          <p className="electoral-nota">Los porcentajes por lista corresponden a los votos válidos. La participación corresponde a los votos emitidos sobre estudiantes habilitados. Las posiciones y los empates son los informados por el servidor.</p>
        </>}
      </section>
    </MarcoPantalla>
  );
}
