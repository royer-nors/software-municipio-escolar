# Backend: autenticación y resultados electorales

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
