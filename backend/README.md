# Backend: autenticación del administrador

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
