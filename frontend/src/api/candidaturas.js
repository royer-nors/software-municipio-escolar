const API = import.meta.env?.VITE_API_URL || "http://localhost:3000/api";
export const MAX_IMAGEN_BYTES = 2 * 1024 * 1024;
export function validarImagen(archivo) {
  if (!archivo) return;
  if (!/\.(jpe?g|png|webp)$/i.test(archivo.name) || !["image/jpeg", "image/png", "image/webp"].includes(archivo.type)) throw new Error("Selecciona una imagen JPG, JPEG, PNG o WebP.");
  if (archivo.size <= 0 || archivo.size > MAX_IMAGEN_BYTES) throw new Error("Cada imagen debe tener contenido y pesar como máximo 2 MiB.");
}
export async function registrarCandidatura(datos, logo, foto, token) {
  if (!token) throw new Error("Inicia sesión como administrador.");
  validarImagen(logo); validarImagen(foto);
  const form = new FormData();
  for (const campo of ["numeroLista", "nombreLista", "candidatoAlcalde", "propuesta1", "propuesta2"]) form.append(campo, datos[campo] || "");
  if (logo) form.append("logo", logo);
  if (foto) form.append("foto", foto);
  let respuesta;
  try {
    respuesta = await fetch(`${API}/candidaturas`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(60000),
    });
  } catch { throw new Error("No se pudo confirmar el registro. Verifica las listas antes de volver a enviar."); }
  const body = await respuesta.json().catch(() => { throw new Error("Respuesta no verificable. Consulta las listas antes de reintentar."); });
  if (!respuesta.ok) throw new Error(body.mensaje || "No se pudo guardar la lista.");
  if (respuesta.status !== 201 || !body.lista?.id || !body.lista.candidatos?.length) throw new Error("No se recibió una confirmación válida del registro.");
  return body.lista;
}
