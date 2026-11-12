# Listas, fotografías y reporte electoral

## Archivos de este cambio

Nuevos:

- `database/migrations/005_numero_lista.sql`
- `backend/repositories/candidaturas.repository.js`
- `backend/routes/candidaturas.routes.js`
- `backend/services/candidaturas.service.js`
- `backend/services/imagenes-listas.js`
- `backend/scripts/probar-candidaturas.js`
- `backend/test/candidaturas.test.js`
- `backend/CANDIDATURAS.md`
- `frontend/src/api/candidaturas.js`
- `frontend/src/components/ImagenElectoral.jsx`
- `frontend/src/styles/candidaturas.css`
- `frontend/src/utils/imagenes.js`
- `frontend/test/candidaturas.test.js`

Modificados:

- `.gitignore`
- `backend/app.js`
- `backend/package.json` y `backend/package-lock.json` (Sharp)
- `backend/repositories/listas.repository.js`
- `backend/repositories/resultados.repository.js`
- `backend/services/listas.service.js`
- `backend/services/resultados.service.js`
- `backend/test/database.test.js`
- `frontend/src/App.jsx`
- `frontend/src/components/AgregarCandidatos.jsx`
- `frontend/src/components/TarjetaLista.jsx`
- `frontend/src/pages/Resultados.jsx`
- `frontend/src/styles/elecciones.css`
- `frontend/scripts/revisar-electoral.mjs`

El formulario y los archivos de importación del padrón ya tenían cambios locales al iniciar esta tarea. Se conservaron, junto con `backend/scripts/crear-admin.js` y el `package-lock.json` de la raíz; estos últimos no se incorporaron al módulo.

## Cambios y persistencia

`POST /api/candidaturas` requiere JWT administrativo y `multipart/form-data`:

| Campo | Contenido |
| --- | --- |
| numeroLista | Entero positivo único |
| nombreLista | Nombre de la lista, máximo 100 caracteres |
| candidatoAlcalde | Nombre completo, máximo 100 caracteres |
| propuesta1, propuesta2 | Opcionales, máximo 1000 caracteres cada una |
| logo | Imagen opcional de la lista |
| foto | Imagen opcional del candidato |

Las imágenes admiten JPG/JPEG, PNG y WebP, hasta 2 MiB cada una. El servidor comprueba extensión, MIME, firma y decodificación, limita píxeles y rechaza animaciones. Guarda versiones WebP con nombres UUID y sin conservar el nombre original. Las referencias se guardan en `listas.logo_url` y `candidatos.foto_url`, columnas existentes de la migración 002.

La migración nueva `005_numero_lista.sql` agrega `listas.numero` con restricción de entero positivo e índice único. Conserva números nulos en listas anteriores: su ID sigue disponible. No modifica migraciones antiguas.

La lista y su candidato se insertan juntos en una transacción. Solo se permite registrar candidaturas antes de abrir la votación y antes del primer voto. Los archivos nuevos se limpian si falla el registro; una respuesta de COMMIT incierta conserva los archivos para no romper referencias posiblemente confirmadas. Ante errores de conexión, consulta las listas antes de repetir el envío.

Las imágenes se sirven por `GET /api/archivos/:nombre`, restringido a UUID WebP. Son recursos electorales públicos. Se almacenan por defecto en `backend/storage/listas`, excluido de Git. Se puede definir `MEDIA_ROOT` como directorio absoluto persistente. Debe conservarse la misma ubicación al reiniciar y respaldarse junto con PostgreSQL; copiar solamente la base no copia las imágenes. En contenedores se necesita un volumen persistente.

## Ejecutar contra pruebas

La configuración local `.env` puede apuntar a producción. Para esta revisión se comprobó `/api/database` en el puerto 3001 y se aplicó la migración 005 **únicamente en db_municipio_escolar_pruebas**. No ejecutes comandos genéricos de migración sin comprobar el destino.

En una terminal PowerShell, desde `backend`, inicia un servidor de pruebas con variables explícitas (dotenv conserva variables ya definidas):

```powershell
$env:DB_NAME = 'db_municipio_escolar_pruebas'
$env:PORT = '3001'
npm.cmd run dev
```

Si ya existe un servidor en 3001, usa ese servidor después de comprobar `http://localhost:3001/api/database`. No inicies dos procesos en el mismo puerto. Las credenciales y JWT_SECRET siguen siendo los configurados localmente; no se cambian mediante este módulo.

En otra terminal, desde `frontend`:

```powershell
$env:VITE_API_URL = 'http://localhost:3001/api'
npm.cmd run dev
```

Para instalaciones de pruebas aún sin 005, configura primero `DB_NAME` explícitamente como arriba y comprueba que sea la base de pruebas antes de ejecutar `npm.cmd run db:migrate`. En esta revisión ya está aplicada; no hace falta repetirla.

## Comprobación manual

1. Inicia sesión como administrador de la base de pruebas. Con la votación cerrada y sin votos, entra en Registrar Lista de Candidatos.
2. Usa un número libre, nombre y candidato; selecciona dos imágenes diferentes. Comprueba las vistas previas y los botones para cambiar o quitar.
3. Guarda y espera la confirmación del servidor. Recarga: los archivos deben continuar disponibles mediante sus URL. Reinicia el backend conservando MEDIA_ROOT y comprueba de nuevo.
4. Entra mediante DNI de un estudiante activo que aún no haya votado y consulta la papeleta: debe mostrar número, logo, foto, nombre y propuestas. Consultar no emite votos.
5. Desde la sesión administrativa abre Ver resultados. Sin votos, los conteos deben permanecer en cero. Imprime o guarda como PDF en A4 horizontal, con fondos habilitados para conservar los colores. El reporte espera a que carguen las imágenes y bloquea la impresión si alguna falla.
6. Prueba un archivo inválido o mayor de 2 MiB: debe rechazarse. No registres votos ni alteres una elección existente para hacer estas comprobaciones.

## Validación automatizada

`npm.cmd test` en backend utiliza PostgreSQL embebido aislado (PGlite) y carpetas temporales. En frontend, `npm.cmd test`, `npm.cmd run lint` y `npm.cmd run build` no escriben en PostgreSQL.

`node scripts/revisar-electoral.mjs` desde frontend usa Chrome y respuestas interceptadas, genera capturas y un PDF temporal, sin conectarse al backend real. Los datos ilustrativos del informe de esta prueba existen únicamente en el script de verificación.

La prueba real opcional `node scripts/probar-candidaturas.js --confirmar-base-pruebas`, desde backend, verifica el nombre de base tanto en PostgreSQL como en la API 3001 antes de escribir. Aplica migraciones pendientes de esa base, crea una cuenta temporal que elimina al terminar y deja una lista, un candidato y sus dos imágenes de prueba. **No ejecutarla de nuevo salvo que se desee crear otra lista.** Ya se ejecutó una vez en esta revisión; dejó la lista ID 1, número 1, sin registrar votos.

## Alcance pendiente

El campo previo Plan de Trabajo (PDF/Word) no tenía almacenamiento real. Se conserva identificado como pendiente; seleccionar un documento bloquea el envío y pide quitarlo, para evitar confirmar falsamente su guardado. Este cambio implementa las dos imágenes, no documentos ni edición/eliminación de candidaturas.
