import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { iniciarSesionAdministrador } from '../src/api/auth.js';
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
test('login usa POST /api/auth/login y conserva la sesión JWT', async () => {
  const sesion = { token: 'jwt-ficticio', administrador: { usuario: 'admin' } };
  globalThis.fetch = async (url, opciones) => {
    assert.equal(url, '/api/auth/login'); assert.equal(opciones.method, 'POST');
    assert.deepEqual(JSON.parse(opciones.body), { usuario: 'admin', password: 'ficticia' });
    return new Response(JSON.stringify(sesion), { status: 200 });
  };
  assert.deepEqual(await iniciarSesionAdministrador('admin', 'ficticia'), sesion);
});
test('respuestas vacías y HTML del proxy producen un diagnóstico claro', async () => {
  for (const [body, status] of [['', 404], ['<html>error</html>', 502], ['', 200]]) {
    globalThis.fetch = async () => new Response(body, { status });
    await assert.rejects(iniciarSesionAdministrador('admin', 'ficticia'), /respuesta vacía o inválida.*HTTP/);
  }
});
test('respeta errores de credenciales, limitación y servicio no disponible', async () => {
  for (const status of [401, 429, 503]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ mensaje: 'Rechazo del servidor' }), { status });
    await assert.rejects(iniciarSesionAdministrador('admin', 'ficticia'), /Rechazo del servidor/);
  }
});
test('no acepta un JSON sin sesión ni oculta una falla de conexión', async () => {
  globalThis.fetch = async () => new Response('{}');
  await assert.rejects(iniciarSesionAdministrador('admin', 'ficticia'), /sesión administrativa válida/);
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED'); };
  await assert.rejects(iniciarSesionAdministrador('admin', 'ficticia'), /backend esté iniciado/);
});
