import { useCallback, useEffect, useRef, useState } from "react";
import Dialogo from "./Dialogo";
import {
  ejecutarBorradoDatos,
  obtenerResumenBorrado,
  reiniciarDatosPrueba,
  simularBorradoDatos,
} from "../api/borrado-datos.js";
import "../styles/borrar-datos.css";

const FRASE_CONFIRMACION = "BORRAR DATOS DE PRUEBA";
const FRASE_REINICIO = "REINICIAR COMPLETAMENTE DATOS DE PRUEBA";
const OPERACIONES = [
  ["solo_votos", "Solo votos (y restablecer marcas ya_voto)"],
  ["candidatos_listas", "Votos, candidatos y listas"],
  ["estudiantes", "Estudiantes"],
];
const ETIQUETAS = { estudiantes: "Estudiantes", listas: "Listas", candidatos: "Candidatos", votos: "Votos" };

function MensajeError({ error }) {
  if (!error) return null;
  return <p className="borrar-datos-mensaje borrar-datos-error" role="alert">{error}</p>;
}

function Cantidades({ datos, titulo = "Cantidades que se revisarían" }) {
  if (!datos) return null;
  return (
    <section className="borrar-datos-cantidades" aria-label={titulo}>
      <h3>{titulo}</h3>
      <dl>
        {Object.entries(ETIQUETAS).map(([campo, etiqueta]) => (
          <div key={campo}><dt>{etiqueta}</dt><dd>{datos[campo] ?? 0}</dd></div>
        ))}
      </dl>
    </section>
  );
}

export default function BorrarDatos({ token }) {
  const [resumen, setResumen] = useState(null);
  const [operacion, setOperacion] = useState(OPERACIONES[0][0]);
  const [simulacion, setSimulacion] = useState(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);
  const [dialogo, setDialogo] = useState(null);
  const formularioRef = useRef(null);
  const produccionFrontend = import.meta.env.PROD;

  const cargarResumen = useCallback(async (signal, limpiarError = true) => {
    try {
      const datos = await obtenerResumenBorrado(token, signal);
      setResumen(datos);
      if (limpiarError) setError("");
    } catch (err) {
      if (!signal?.aborted) setError(err.message || "No se pudo cargar el resumen.");
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void cargarResumen(controller.signal);
    });
    return () => controller.abort();
  }, [cargarResumen]);

  function cambiarOperacion(valor) {
    setOperacion(valor);
    setSimulacion(null);
    setAviso("");
    setError("");
  }

  async function simular(valor = operacion) {
    setTrabajando(true);
    setError("");
    setAviso("");
    setSimulacion(null);
    try {
      const resultado = await simularBorradoDatos(token, valor);
      setSimulacion(resultado);
      if (resultado.bloqueada) setAviso("La operación está bloqueada por las condiciones indicadas. No se borró ningún dato.");
    } catch (err) {
      setError(err.message || "No se pudo completar la simulación.");
    } finally {
      setTrabajando(false);
    }
  }

  function abrirConfirmacion(tipo) {
    setError("");
    setDialogo(tipo);
  }

  function cerrarConfirmacion() {
    formularioRef.current?.reset();
    setDialogo(null);
  }

  async function confirmarEjecucion(event) {
    event.preventDefault();
    if (!formularioRef.current) return;
    const formulario = new FormData(formularioRef.current);
    const tipo = dialogo;
    const credenciales = {
      operacion: tipo === "reinicio" ? "reinicio_pruebas" : operacion,
      simulacionId: simulacion?.simulacionId,
      confirmacion: formulario.get("confirmacion"),
      password: formulario.get("password"),
      ...(tipo === "reinicio" ? { autorizacionAdicional: formulario.get("autorizacionAdicional") } : {}),
    };
    formularioRef.current.reset();
    setTrabajando(true);
    setError("");
    setAviso("");
    // El intento consume la simulación aunque el servidor rechace la operación.
    setSimulacion(null);
    try {
      const resultado = tipo === "reinicio"
        ? await reiniciarDatosPrueba(token, credenciales)
        : await ejecutarBorradoDatos(token, credenciales);
      setAviso(tipo === "reinicio" ? "Reinicio excepcional completado." : "Eliminación completada.");
      setResumen(actual => actual ? {
        ...actual,
        estudiantes: Math.max(0, actual.estudiantes - (resultado.cantidades?.estudiantes || 0)),
        listas: Math.max(0, actual.listas - (resultado.cantidades?.listas || 0)),
        candidatos: Math.max(0, actual.candidatos - (resultado.cantidades?.candidatos || 0)),
        votos: Math.max(0, actual.votos - (resultado.cantidades?.votos || 0)),
      } : actual);
    } catch (err) {
      const motivoEntorno = err.status === 403;
      if (motivoEntorno) setAviso(`El backend bloqueó la operación por producción o configuración: ${err.message}`);
      else setError(err.message || "No se pudo completar la operación.");
    } finally {
      formularioRef.current?.reset();
      setDialogo(null);
      setTrabajando(false);
      await cargarResumen(undefined, false);
    }
  }

  const motivosBloqueo = [
    resumen?.votacionAbierta && "La elección está abierta.",
    resumen?.votosRegistrados && "Hay votos registrados.",
    resumen?.estudiantesYaVotaron && "Hay estudiantes marcados como votantes.",
  ].filter(Boolean);
  const simValida = simulacion && simulacion.operacion === operacion && !simulacion.bloqueada;
  const bloqueadaEnProduccion = produccionFrontend;
  const confirmarDisabled = trabajando || !simValida || bloqueadaEnProduccion;

  return (
    <main className="borrar-datos">
      <header className="borrar-datos-encabezado">
        <div>
          <p className="borrar-datos-etiqueta">Panel administrativo</p>
          <h2>Borrar datos</h2>
          <p>Herramienta de limpieza electoral para bases de prueba. Cada ejecución se verifica y queda auditada.</p>
        </div>
      </header>

      {produccionFrontend ? (
        <div className="borrar-datos-aviso borrar-datos-aviso-error" role="alert">
          Esta interfaz está compilada en modo producción. La eliminación real está deshabilitada.
        </div>
      ) : (
        <div className="borrar-datos-aviso" role="note">
          La ejecución solo puede habilitarse en el backend para la base de pruebas configurada. Si producción o la configuración la bloquean, el servidor mostrará el motivo y registrará el intento.
        </div>
      )}

      <section className="borrar-datos-panel">
        <div className="borrar-datos-titulo-fila">
          <h3>Datos actuales</h3>
          <button type="button" className="borrar-datos-boton secundario" onClick={() => cargarResumen()} disabled={cargando || trabajando}>
            {cargando ? "Cargando…" : "Actualizar"}
          </button>
        </div>
        <MensajeError error={error && !resumen ? error : ""} />
        <Cantidades datos={resumen} titulo="Registros actuales" />
        {resumen && !resumen.configuracionDisponible && <div className="borrar-datos-aviso borrar-datos-aviso-error" role="alert">No se encontró la configuración de votación; las operaciones quedarán bloqueadas.</div>}
        {motivosBloqueo.length > 0 && (
          <div className="borrar-datos-aviso borrar-datos-aviso-error" role="alert">
            Las operaciones normales están bloqueadas: {motivosBloqueo.join(" ")}
          </div>
        )}
      </section>

      <section className="borrar-datos-panel">
        <h3>Simulación y limpieza normal</h3>
        <label className="borrar-datos-campo" htmlFor="borrar-operacion">¿Qué datos de prueba quieres limpiar?</label>
        <select id="borrar-operacion" value={operacion} onChange={event => cambiarOperacion(event.target.value)} disabled={trabajando}>
          {OPERACIONES.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}</option>)}
        </select>
        <button type="button" className="borrar-datos-boton" onClick={() => simular()} disabled={trabajando || cargando || !resumen}>
          {trabajando ? "Procesando…" : "Simular operación"}
        </button>
        {simulacion?.operacion === operacion && (
          <div className="borrar-datos-resultado" aria-live="polite">
            <h4>Resultado de la simulación</h4>
            <p>{simulacion.bloqueada ? "Bloqueada: no se eliminaría nada." : "Simulación lista. No se ha eliminado ningún registro."}</p>
            <Cantidades datos={simulacion.proyeccion} titulo="Cantidades proyectadas" />
            {simulacion.bloqueos?.length > 0 && <ul>{simulacion.bloqueos.map(motivo => <li key={motivo}>{motivo}</li>)}</ul>}
          </div>
        )}
        <button type="button" className="borrar-datos-boton peligro" onClick={() => abrirConfirmacion("normal")} disabled={confirmarDisabled}>
          Confirmar eliminación real
        </button>
        {!simValida && <p className="borrar-datos-ayuda">Primero realiza una simulación sin bloqueos para esta operación.</p>}
      </section>

      <section className="borrar-datos-panel borrar-datos-excepcional">
        <p className="borrar-datos-etiqueta">Procedimiento separado</p>
        <h3>Reinicio excepcional de pruebas</h3>
        <div className="borrar-datos-aviso borrar-datos-aviso-error">
          Elimina estudiantes, listas, candidatos y votos. Puede reiniciar una elección abierta o con votos y requiere una habilitación adicional del backend. Úsalo solo con autorización expresa en una base de pruebas.
        </div>
        <button type="button" className="borrar-datos-boton peligro" onClick={() => simular("reinicio_pruebas")} disabled={trabajando || cargando || !resumen}>
          Simular reinicio excepcional
        </button>
        {simulacion?.operacion === "reinicio_pruebas" && (
          <div className="borrar-datos-resultado" aria-live="polite">
            <h4>Resultado de la simulación excepcional</h4>
            <p>{simulacion.bloqueada ? "Bloqueada: revisa el motivo informado." : "Simulación lista. No se ha eliminado ningún registro."}</p>
            <Cantidades datos={simulacion.proyeccion} titulo="Cantidades proyectadas" />
            {simulacion.bloqueos?.length > 0 && <ul>{simulacion.bloqueos.map(motivo => <li key={motivo}>{motivo}</li>)}</ul>}
          </div>
        )}
        <button type="button" className="borrar-datos-boton peligro-oscuro" onClick={() => abrirConfirmacion("reinicio")} disabled={trabajando || !simulacion || simulacion.operacion !== "reinicio_pruebas" || simulacion.bloqueada || bloqueadaEnProduccion}>
          Autorizar reinicio excepcional
        </button>
      </section>

      <MensajeError error={error && resumen ? error : ""} />
      {aviso && <p className="borrar-datos-mensaje" role="status">{aviso}</p>}

      {dialogo && (
        <Dialogo titulo={dialogo === "reinicio" ? "Confirmar reinicio excepcional" : "Confirmar eliminación real"} onCerrar={trabajando ? undefined : cerrarConfirmacion}>
          <form ref={formularioRef} className="borrar-datos-formulario" onSubmit={confirmarEjecucion}>
            <p className="dialogo-pregunta">{dialogo === "reinicio" ? "Esta acción elimina todos los datos electorales de prueba." : "Esta acción eliminará los registros indicados por la simulación."}</p>
            <p className="dialogo-aviso">Escribe exactamente: <strong>{dialogo === "reinicio" ? FRASE_REINICIO : FRASE_CONFIRMACION}</strong></p>
            <label className="borrar-datos-campo" htmlFor="borrar-confirmacion">Frase de confirmación</label>
            <input id="borrar-confirmacion" name="confirmacion" autoComplete="off" required />
            <label className="borrar-datos-campo" htmlFor="borrar-password">Contraseña administrativa</label>
            <input id="borrar-password" name="password" type="password" autoComplete="current-password" required />
            {dialogo === "reinicio" && <>
              <label className="borrar-datos-campo" htmlFor="borrar-autorizacion">Autorización adicional</label>
              <input id="borrar-autorizacion" name="autorizacionAdicional" type="password" autoComplete="off" required />
            </>}
            {error && <p className="dialogo-error" role="alert">{error}</p>}
            <div className="dialogo-botones">
              <button type="button" className="btn-claro" onClick={cerrarConfirmacion} disabled={trabajando}>Cancelar</button>
              <button type="submit" className="btn-verde" disabled={trabajando || (dialogo === "normal" && !simValida)}>
                {trabajando ? "Procesando…" : "Confirmar y ejecutar"}
              </button>
            </div>
          </form>
        </Dialogo>
      )}
    </main>
  );
}
