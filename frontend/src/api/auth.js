const API = import.meta.env?.VITE_API_URL || '/api';

export async function iniciarSesionAdministrador(usuario, password) {
  let respuesta;
  try {
    respuesta = await fetch(`${API.replace(/\/$/, '')}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, password }),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Comprueba que el backend esté iniciado.');
  }
  let datos;
  try { datos = await respuesta.json(); }
  catch {
    throw new Error(`El servidor devolvió una respuesta vacía o inválida (HTTP ${respuesta.status}). Comprueba la conexión de /api con el backend.`);
  }
  if (!respuesta.ok) throw new Error(datos?.mensaje || `No se pudo iniciar sesión (HTTP ${respuesta.status}).`);
  if (typeof datos?.token !== 'string' || !datos.token || !datos.administrador?.usuario) {
    throw new Error('El servidor no devolvió una sesión administrativa válida.');
  }
  return datos;
}
