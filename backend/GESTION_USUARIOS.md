# Gestión de usuarios

El código requiere `003_gestion_usuarios.sql`. La migración queda pendiente de
revisión y aplicación explícita por el responsable de PostgreSQL. No se aplica
al iniciar el servidor. Las migraciones 001 y 002 se conservan sin cambios.
Antes de utilizar esta versión contra una base existente, respaldarla y aplicar
003 mediante el procedimiento de migraciones acordado; hasta entonces las
consultas de usuarios requieren columnas que todavía no existen.

## Acceso y sesiones

Todas las operaciones de gestión requieren `Authorization: Bearer <token>` de
un administrador activo. El middleware consulta su cuenta en cada petición y
compara `version_token` con el JWT. Cambiar contraseña o desactivar incrementa
esa versión. Los tokens administrativos antiguos sin versión también se
rechazan; iniciar sesión nuevamente al actualizar el backend.

Las contraseñas nuevas tienen al menos 8 caracteres y como máximo 72 bytes
UTF-8. Se guardan como hashes bcrypt de coste 12, nunca como texto plano.
Las respuestas administrativas solo contienen `id`, `usuario` y `activo`.
Todos los administradores activos pueden gestionar usuarios; no existe un rol
de superadministrador ni un endpoint público para crear la primera cuenta.

## Endpoints

| Método | Ruta | Cuerpo JSON / consulta |
| --- | --- | --- |
| POST | `/api/administradores` | `{"usuario":"operador","password":"ClavePrueba2026!"}` |
| GET | `/api/administradores` | `?buscar=operador&limit=50&offset=0` |
| PATCH | `/api/administradores/:id` | `{"usuario":"nuevo_usuario"}` |
| PATCH | `/api/administradores/:id/desactivar` | Sin cuerpo o `{}` |
| PATCH | `/api/auth/password` | `{"passwordActual":"ClavePrueba2026!","passwordNueva":"OtraClave2026!"}` |
| POST | `/api/estudiantes` | `{"dni":"01234567","nombre":"Ana Torres","grado":"5","seccion":"A"}` |
| GET | `/api/estudiantes` | `?buscar=Torres&limit=50&offset=0` |
| PATCH | `/api/estudiantes/:id` | Uno o varios de `dni`, `nombre`, `grado`, `seccion` |
| PATCH | `/api/estudiantes/:id/desactivar` | Sin cuerpo o `{}` |

Las altas devuelven 201 con `administrador` o `estudiante`; las otras operaciones,
200. Los listados contienen `administradores` o `estudiantes`, incluyen activos e
inactivos, se ordenan por ID y aceptan entre 1 y 100 elementos por página. La
búsqueda ignora mayúsculas; en estudiantes examina DNI, nombre, grado y sección.
Los estudiantes devuelven `id`, `dni`, `nombre`, `grado`, `seccion`, `activo` y
`ya_voto` (este último es exclusivamente de lectura).

Campos desconocidos o internos se rechazan con 400. No se aceptan `activo`,
`ya_voto`, `password_hash`, `version_token` ni `id` en los cuerpos de edición.
El DNI de gestión debe ser una cadena exacta de ocho dígitos, sin espacios.
Nombre, grado y sección son obligatorios y no vacíos al registrar individualmente
un estudiante; la importación Excel conserva sus campos opcionales anteriores.

Errores: 400 datos inválidos, 401 acceso rechazado, 404 usuario inexistente,
409 duplicados o conflicto con reglas del proceso, 429 límite de intentos y
503 servicio no disponible. La contraseña actual incorrecta devuelve 401.

## Integridad electoral y concurrencia

Alta, edición y desactivación individual de estudiantes se bloquean cuando hay
algún voto o alguna marca `ya_voto`. La comprobación y la escritura se ejecutan
en una transacción, bloqueando `estudiantes` y después `votos`, igual que la
importación Excel. Así un primer voto concurrente no permite alterar el padrón.
La importación sigue reemplazándolo completamente antes del inicio y los nuevos
registros quedan activos por defecto; no reutiliza identificadores eliminados.

Un estudiante inactivo no puede identificarse, consultar listas ni votar con un
token anterior. La función SQL comprueba `activo` y `ya_voto` dentro de la misma
operación que registra el voto. No se añade identidad a la tabla de votos.

Las desactivaciones administrativas toman un bloqueo de tabla antes de contar
cuentas activas. Ese bloqueo serializa las comprobaciones e impide desactivar
simultáneamente a todos los administradores. No hay eliminación física ni
reactivación expuesta por API.

Resultados considera habilitados a los estudiantes activos o que ya votaron,
preservando los votos emitidos si hubiera desactivaciones externas posteriores.

## Verificación

Desde `backend`, `npm.cmd test` ejecuta pruebas HTTP con pools simulados y
PostgreSQL embebido PGlite en memoria. No carga `.env`, no usa el pool de
`config/db.js` ni accede a una base PostgreSQL real. Las pruebas SQL instalan el
esquema solo en sus instancias efímeras. PGlite utiliza una conexión: las pruebas
de peticiones simultáneas no sustituyen validar bloqueos entre varias conexiones
en un servidor PostgreSQL de pruebas independiente.

Después de revisar y aplicar 003 en una base de pruebas:

1. Iniciar el servidor con `npm.cmd run dev` y hacer login administrativo.
2. En Postman enviar JSON a los endpoints con el token Bearer del login.
3. Crear un segundo administrador, listar, renombrar y desactivarlo. Su token
   anterior y sus credenciales deben ser rechazados. El último activo devuelve 409.
4. Crear un estudiante, buscarlo, editarlo y obtener su token por DNI. Desactivarlo
   antes de votar: identificación y listas responden 401 y voto responde 409.
5. Intentar enviar `ya_voto` en alta/edición: debe responder 400.
6. Cambiar la contraseña propia: el token anterior responde 401; volver a iniciar
   sesión con la nueva contraseña. La contraseña anterior debe ser rechazada.
7. Con otro estudiante activo registrar un voto. Las siguientes modificaciones
   del padrón y la importación Excel deben responder 409. Los resultados siguen
   disponibles para el administrador.
