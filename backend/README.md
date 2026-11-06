# Backend: acceso, listas electorales y resultados

API Express con PostgreSQL, contraseñas verificadas con bcrypt y tokens JWT de una hora.

## Preparación

Desde la carpeta `backend`, usando Node.js 22 o superior:

```powershell
npm ci
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copia el valor generado en `JWT_SECRET` dentro de `.env` y completa las variables `DB_*` con los datos acordados con la responsable de la base de datos. `.env` está excluido de Git.

```powershell
npm run dev
```

Antes de iniciar una instalación nueva, ejecuta `npm run db:migrate` con las variables `DB_*` configuradas. Consulta [la guía de base de datos](../database/README.md). El servidor no crea ni actualiza tablas automáticamente.

El servidor escucha en `http://localhost:3000`. La autenticación necesita la tabla `administradores` con `id`, `usuario` y `password_hash`, conforme al esquema publicado actualmente en `main`. El hash debe ser bcrypt; no se crean usuarios ni tablas desde este módulo. La integración con PostgreSQL se hará con la responsable de la base de datos.

## Endpoints

| Método | Ruta | Función |
| --- | --- | --- |
| GET | `/api/estado` | Comprobar el servidor. |
| GET | `/api/database` | Comprobar la conexión existente a PostgreSQL. |
| POST | `/api/auth/login` | Autenticar al administrador. |
| GET | `/api/auth/me` | Consultar la identidad del token. |
| GET | `/api/resultados` | Consultar el resumen y los resultados por lista; requiere token del administrador. |
| POST | `/api/auth/estudiante` | Identificar y habilitar al estudiante usando únicamente su DNI. |
| GET | `/api/listas` | Consultar las listas completas; requiere un token de estudiante habilitado. |
| POST | `/api/votos` | Registrar la lista completa elegida o el voto en blanco; requiere token del estudiante. |

El cuerpo del login es JSON:

```json
{"usuario": "usuario_del_administrador", "password": "su_contraseña"}
```

Un login correcto responde `200` con `token`, `tipo: "Bearer"`, `expiraEn: 3600` y los datos públicos del administrador. Envía `Authorization: Bearer <token>` al consultar `/api/auth/me`.

Los datos incompletos responden `400`; las credenciales incorrectas y los tokens inválidos o vencidos, `401`; la indisponibilidad de autenticación, `503`. El límite de contraseña es 72 bytes UTF-8, para evitar que bcrypt la trunque. La contraseña se compara sin recortar espacios.

## Verificación

```powershell
npm test
```

Las pruebas recorren HTTP con bcrypt y JWT reales y un reemplazo controlado de PostgreSQL. Verifican acceso correcto, validación de datos, rechazo de credenciales, consultas parametrizadas, tokens vencidos o alterados y fallos de conexión. No necesitan una base de datos ni ejecutan cambios SQL.

## Resultados para la pantalla y la vista de impresión

`GET /api/resultados` recibe el mismo encabezado `Authorization: Bearer <token>` de la autenticación. Devuelve `generadoEn` en formato ISO, `resumen` y `listas`. La consulta es de solo lectura y cuenta todas las tablas en una misma instantánea de PostgreSQL.

Ejemplo de `resumen`, usando los valores de referencia de Figma:

```json
{
  "estudiantesHabilitados": 1200,
  "votosEmitidos": 1000,
  "votosValidos": 1000,
  "votosEnBlanco": 0,
  "votosNulos": 0,
  "noVotaron": 200,
  "participacion": 83.3
}
```

Los valores se calculan desde la base de datos; el ejemplo no se guarda como resultado real. Cada elemento de `listas` contiene `nombre`, `votos`, `porcentaje` y `posicion`. Se cuentan los votos de cada `lista_id`, incluyendo listas sin votos. La posición se ordena por votos descendentes; los empates comparten posición y se presentan por nombre. No se cambia el nombre de las listas.

Los porcentajes por lista usan los **votos válidos**, mientras que la participación usa los **votos emitidos / estudiantes habilitados**. Se redondean a un decimal y son cero cuando el denominador es cero. Sin votos válidos, la posición de las listas es `null`. Por el redondeo, los porcentajes de algunas distribuciones pueden sumar 99,9 o 100,1.

Con las migraciones actuales, cada fila de `votos` representa un voto de lista; `lista_id = NULL` representa voto en blanco. El esquema no representa votos nulos, por lo que esa categoría responde cero. Las consultas HTTP son de solo lectura; la instalación del esquema es un comando separado.

Si hay más votos que estudiantes, votos sin una lista definida o conteos inconsistentes, la API responde `503` y no entrega un reporte engañoso. Los resultados no incluyen códigos, nombres ni identificadores de votantes. El frontend utilizará estos datos para el gráfico, los colores, los retratos y la impresión del diseño de Figma.

## Identificación del estudiante según Figma

El diseño actual utiliza únicamente DNI, sin contraseña ni código de acceso adicional. Envía:

```json
{"dni": "01234567"}
```

Debe ser una cadena de 8 dígitos, para conservar los ceros iniciales. La API devuelve `200` con `estudiante: { id, dni, nombre }`, `habilitadoParaVotar: true` y un token Bearer de 15 minutos. No se marca `ya_voto` al identificar al estudiante: esa actualización corresponde a la transacción que registra el voto.

Un DNI mal formado responde `400`; un DNI fuera del padrón, `401`; un estudiante que ya votó, `409`; un fallo del servicio, `503`. Se valida la pertenencia al padrón del proceso presencial; no se solicita ni se almacena una contraseña del estudiante. El token del estudiante no permite acceder a funciones de administrador.

Adaptación al esquema publicado actualmente: el DNI del padrón se consulta en `estudiantes.codigo`; no se agrega una columna ni se modifica la tabla. Este mapeo se coordinará con la responsable de la base de datos. Los datos que no existen en el esquema, como grado o sección, no se inventan en la respuesta.

## Límite de intentos

Cada IP dispone de 10 intentos fallidos de administrador o 20 de estudiante en una ventana de 15 minutos; los accesos correctos no consumen el cupo. Al excederlo, la API devuelve `429` y `Retry-After`. Los contadores permanecen en memoria del servidor central y se reinician si el proceso se reinicia. No se confían IP enviadas por el cliente mediante encabezados de proxy.

## Listas para la pantalla de votación

`GET /api/listas` utiliza `Authorization: Bearer <token del estudiante>`. Vuelve a comprobar en la base de datos que el estudiante exista y no haya votado, aunque conserve un token emitido anteriormente. Los administradores no pueden utilizar su token en este endpoint. Un estudiante que ya votó recibe `409`.

La respuesta `200` tiene la forma `{"listas": [{"id": 10, "nombre": "Unidos por el cambio", "candidatos": [{"id": 101, "nombre": "Candidato"}]}]}`. El `id` de la lista es su identificador real en PostgreSQL y es diferente del identificador del candidato. Los candidatos se agrupan por lista, con orden alfabético de listas y por identificador de candidato. Sin candidatos, responde `{"listas": []}`.

La consulta usa la relación `candidatos.lista_id` con `listas`. Las migraciones incorporan columnas para URL del logo, fotografía, cargo y propuestas; la carga y exposición de esos archivos sigue pendiente.

## Registrar el voto confirmado

Después de que el usuario confirme la tarjeta elegida, enviar `POST /api/votos` con `Authorization: Bearer <token del estudiante>` y `{"listaId": 10}`. Para voto en blanco se debe enviar explícitamente `{"listaId": null}`; omitir el campo nunca equivale a votar en blanco.

El estudiante se obtiene del token, aunque el cliente intente enviar otro identificador. La función SQL existente marca `ya_voto` y registra la lista completa atómicamente. El endpoint no guarda ni devuelve un vínculo entre el estudiante y la lista elegida.

Respuestas: `201` con `{"mensaje": "Voto registrado correctamente.", "sesionFinalizada": true}`; `400` para selección inválida o lista inexistente; `401` para token inválido o de otro rol; `409` si el estudiante ya votó o dejó de estar habilitado; `503` si no se puede completar la operación. Tras un fallo de red, se debe comprobar la habilitación antes de reintentar. El cliente debe cerrar la sesión al recibir `201`; cualquier reintento de voto y consulta de papeleta vuelve a comprobar el padrón y queda bloqueado después de votar.
