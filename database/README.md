# Base de datos PostgreSQL

Este primer avance prepara el proceso electoral actual: estudiantes identificados solo por DNI, listas completas, candidatos, administradores y votos sin una relación persistida con el estudiante.

## Preparar una instalación

1. Crear una base PostgreSQL vacía, por ejemplo `municipio_escolar`, con un usuario autorizado para instalar el esquema.
2. Desde `backend`, ejecutar `npm ci`, copiar `.env.example` a `.env` y completar `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.
3. Ejecutar `npm run db:migrate`. Este comando es explícito; iniciar el servidor no aplica cambios automáticamente.

Si ya existen datos, realizar un respaldo antes de actualizar. Las migraciones no borran tablas ni registros. Se ejecutan en una transacción, con bloqueo de instalación y un registro de versiones y SHA-256. Repetir el comando no vuelve a aplicarlas; un archivo ya aplicado no debe editarse: los siguientes cambios se agregan como nuevas migraciones.

El antiguo `schema.sql`, que comenzaba borrando las tablas, se reemplazó por `migrations/001_estructura_inicial.sql` y `002_listas_y_dni.sql`. No ejecutar esos archivos individualmente: el comando controla orden, registro y reversión ante errores.

## Modelo inicial

| Tabla | Función |
| --- | --- |
| `estudiantes` | DNI en `codigo`, nombre, grado, sección y estado `ya_voto`. El DNI es único y tiene exactamente 8 dígitos. No almacena contraseñas del estudiante. |
| `listas` | Nombre único, URL del logo y propuestas de cada lista completa. |
| `candidatos` | Nombre, lista por `lista_id`, cargo y URL de fotografía. |
| `votos` | Lista seleccionada por `lista_id` y fecha. `lista_id = NULL` representa voto en blanco. No contiene el identificador ni el DNI del estudiante. |
| `administradores` | Usuario único y hash de contraseña para el acceso administrativo existente. |
| `esquema_migraciones` | Versiones aplicadas y sus checksums. |

Las URLs son referencias a archivos; la base no incorpora fotos ni logos de ejemplo. El padrón se cargará masivamente desde Excel; esta migración no implementa un alta individual de votantes ni crea usuarios o estudiantes ficticios.

## Conservar los datos del esquema anterior

Las listas existentes se obtienen de `candidatos.lista`, sin cambiar sus nombres. Se asigna `lista_id` a cada candidato y se adapta cada voto histórico por candidato a la lista correspondiente. Los votos históricos en blanco se conservan. La columna textual `candidatos.lista` y `votos.candidato_id` quedan como compatibilidad histórica; las consultas nuevas usan la tabla `listas` y `votos.lista_id`.

Los nuevos candidatos se insertan con `lista_id`; su antigua columna textual no es obligatoria. Un trigger conserva la compatibilidad de los votos insertados por candidato y rechaza un candidato que no pertenezca a la lista indicada. Las claves foráneas impiden borrar listas referenciadas.

Si el padrón existente contiene DNI que no tienen 8 dígitos, estados `ya_voto` nulos o candidatos sin lista, la migración falla y revierte sus cambios. Los datos deben revisarse antes de reintentar; no se descartan ni se corrigen automáticamente.

## Registro atómico de un voto

```sql
SELECT registrar_voto($1, $2);
```

El backend enviará como parámetros el identificador del estudiante autenticado y el identificador de la lista elegida. El segundo parámetro puede ser `NULL` para un voto en blanco. La función marca al estudiante y crea el voto en una misma sentencia. Si ya votó o no existe, rechaza la operación; si la lista no existe, el fallo también revierte la marca. La actualización condicional protege frente a reintentos concurrentes del mismo estudiante.

La tabla de votos no registra quién eligió cada lista. Esta separación no sustituye los controles de acceso, configuración y auditoría de la aplicación. El endpoint HTTP de registro, la importación de Excel y las reglas de horarios y habilitación de voto en blanco son pasos posteriores. También quedan pendientes el modelo de múltiples elecciones y su historial; este primer esquema cubre un proceso electoral.

## Pruebas

Desde `backend`, ejecutar `npm test`. Las pruebas de migración ejecutan SQL y consultas de los repositorios sobre PostgreSQL embebido en memoria (PGlite), sin usar `DB_*` ni conectarse a una base real. Comprueban preservación de datos, restricciones, votos completos y en blanco, rechazo de doble voto, reversión y compatibilidad con el backend. La concurrencia entre varias conexiones de red y la instalación del servidor definitivo deben validarse también en PostgreSQL desplegado.
