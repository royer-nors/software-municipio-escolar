# Backend: acceso del administrador y del estudiante

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
| POST | `/api/auth/estudiante` | Identificar y habilitar al estudiante usando únicamente su DNI. |

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
