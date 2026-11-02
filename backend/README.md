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

Los valores se calculan desde la base de datos; el ejemplo no se guarda como resultado real. Cada elemento de `listas` contiene `nombre`, `votos`, `porcentaje` y `posicion`. Se suman los votos de los candidatos que comparten `candidatos.lista`, incluyendo listas sin votos. La posición se ordena por votos descendentes; los empates comparten posición y se presentan por nombre. No se cambia el nombre de las listas.

Los porcentajes por lista usan los **votos válidos**, mientras que la participación usa los **votos emitidos / estudiantes habilitados**. Se redondean a un decimal y son cero cuando el denominador es cero. Sin votos válidos, la posición de las listas es `null`. Por el redondeo, los porcentajes de algunas distribuciones pueden sumar 99,9 o 100,1.

Contrato provisional con el esquema actual de `main`: cada fila de `votos` representa un voto; `candidato_id = NULL` se interpreta como voto en blanco. El esquema actual no representa votos nulos, por lo que esa categoría responde cero. Esta interpretación debe coordinarse con la responsable de la base de datos antes de la integración real. No se crean ni modifican tablas, usuarios o votos.

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

La respuesta `200` tiene la forma `{"listas": [{"nombre": "Unidos por el cambio", "candidatos": [{"id": 1, "nombre": "Candidato"}]}]}`. Los candidatos se agrupan por el nombre de su lista, con orden alfabético de listas y por identificador de candidato. Se conservan los nombres registrados; no se crean números ni identificadores ficticios de listas. Sin candidatos, responde `{"listas": []}`.

Se reutiliza el campo `candidatos.lista` del esquema actual. Las fotografías, logos, cargos y demás datos que todavía no aparecen en el esquema quedan pendientes de su contrato con la responsable de base de datos. Esta consulta prepara los datos de la tarjeta completa del diseño sin modificar el frontend. El registro del voto por lista se implementará cuando esté definido cómo almacenarlo; este endpoint no registra votos.
