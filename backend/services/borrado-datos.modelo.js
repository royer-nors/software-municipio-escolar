const OPERACIONES = Object.freeze(["solo_votos", "candidatos_listas", "solo_candidatos", "solo_listas", "estudiantes", "estudiantes_importados", "reinicio_pruebas"]);
const FRASE_CONFIRMACION = "BORRAR DATOS DE PRUEBA";
const FRASE_REINICIO = "REINICIAR COMPLETAMENTE DATOS DE PRUEBA";
class BorradoDatosError extends Error { constructor(status, mensaje) { super(mensaje); this.status = status; } }
function crearProyeccion(op, r) {
  const p = { estudiantes: 0, listas: 0, candidatos: 0, votos: 0, marcasYaVotoRestablecidas: 0 };
  if (["solo_votos", "candidatos_listas", "reinicio_pruebas"].includes(op)) {
    p.votos = r.votos; p.marcasYaVotoRestablecidas = op === "reinicio_pruebas" ? 0 : r.estudiantes_marcados_ya_voto;
  }
  if (["candidatos_listas", "solo_candidatos", "reinicio_pruebas"].includes(op)) p.candidatos = r.candidatos;
  if (["candidatos_listas", "solo_listas", "reinicio_pruebas"].includes(op)) p.listas = r.listas;
  if (["estudiantes", "reinicio_pruebas"].includes(op)) p.estudiantes = r.estudiantes;
  if (op === "estudiantes_importados") p.estudiantes = r.estudiantes_importados;
  return p;
}
function obtenerBloqueos(op, r) {
  const b = [];
  if (!r.configuracion_disponible) b.push("La configuración de votación no está disponible.");
  if (r.votacion_abierta) b.push("Cierra la votación antes de borrar datos.");
  if (!["solo_votos", "candidatos_listas", "reinicio_pruebas"].includes(op) && (r.votos > 0 || r.estudiantes_marcados_ya_voto > 0)) b.push("Elimina primero los votos y sus marcas, o selecciona reinicio completo.");
  if (op === "solo_listas" && r.candidatos > 0) b.push("Existen candidatos asociados. Elige candidatos y listas, o elimina antes los candidatos.");
  return b;
}
module.exports = { OPERACIONES, FRASE_CONFIRMACION, FRASE_REINICIO, BorradoDatosError, crearProyeccion, obtenerBloqueos };
