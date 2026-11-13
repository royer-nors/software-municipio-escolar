# Etapa 3: administración de computadoras

## Funcionalidades y alcance

En el panel administrativo, **Administrar computadoras** permite registrar un identificador único (por ejemplo, `PC-01`), nombre y grado de secundaria (1.º a 5.º). Admite varios equipos para un mismo grado. Los identificadores se recortan y normalizan a mayúsculas; `pc-01` y `PC-01` representan el mismo registro.

Se puede editar el nombre y grado, deshabilitar y volver a habilitar. El identificador y la fecha de registro se conservan. La lista muestra estado administrativo y fecha en America/Lima; no representa conexión, presencia ni última actividad del equipo. La paginación usa 50 registros por página (API: máximo 100 por solicitud), sin limitar el total de computadoras.

**Registrar o habilitar no vincula ningún navegador ni autoriza a votar.** No se genera ni guarda una credencial de equipo, no se usan IP, identificadores o variables del navegador como prueba de autorización. Los endpoints existentes de estudiantes y votos mantienen su comportamiento. Deshabilitar un registro en esta etapa no revoca sesiones de estudiantes ni bloquea una computadora física.

No se implementan pantalla exclusiva de votación, supervisores, restricción electoral por grado ni vinculación de dispositivos. No se cambia LAN, Seguridad, Resultados, Configurar voto en blanco ni la emisión de votos. Borrar datos conserva su código funcional: solamente se reemplaza una expectativa fija de nueve migraciones en su prueba por la comprobación de que sus migraciones de auditoría estén aplicadas.

## Esquema y migración

Se revisaron las nueve migraciones existentes. No hay catálogo de grados ni tabla de dispositivos, y `estudiantes.grado` es texto libre. Se añade únicamente `database/migrations/010_computadoras.sql` con la tabla `computadoras`:

| Columna | Reglas |
|---|---|
| `id` | SERIAL, clave primaria interna |
| `identificador` | VARCHAR(30), único, no nulo, letras ASCII mayúsculas, números, `_` o `-`; comienza con letra o número |
| `nombre` | VARCHAR(100), no nulo, no vacío ni con espacios externos |
| `grado` | SMALLINT, no nulo, CHECK de 1 a 5 |
| `activo` | BOOLEAN no nulo, TRUE por defecto |
| `fecha_registro` | TIMESTAMPTZ no nulo, fecha del servidor por defecto |

No hay claves foráneas a estudiantes o votos: no existe relación que deba crearse en esta etapa. El grado se valida como dominio cerrado, sin inventar una relación con un catálogo inexistente. Las migraciones 001–009 permanecen intactas; el ejecutor conserva transacción, checksum e idempotencia. No se añaden semillas ni cambios a datos existentes. El módulo no tiene endpoint de borrado.

## API administrativa

Todas las rutas usan el middleware administrativo existente, que verifica JWT, rol, emisor, audiencia, caducidad y estado/versión de la cuenta. Requieren `Authorization: Bearer <sesión administrativa>` y devuelven `Cache-Control: no-store`. El panel utiliza la sesión existente; no se incluyen tokens administrativos en compilaciones, URLs ni registros de computadoras, ni se transfieren a puestos de votación.

| Método y ruta | Entrada | Respuesta |
|---|---|---|
| `GET /api/computadoras?limit=50&offset=0` | `limit`: 1–100; `offset`: entero no negativo | 200 `{ computadoras: [...], hayMas: boolean }` |
| `POST /api/computadoras` | `{ identificador: "PC-01", nombre: "Equipo aula", grado: 3 }` | 201 `{ computadora: {...} }` |
| `PATCH /api/computadoras/:id` | Subconjunto no vacío de `{ nombre, grado, activo }` | 200 `{ computadora: {...} }` |

El grado debe ser un número entero, no una cadena; activo debe ser booleano. POST no acepta estado ni campos internos. PATCH no acepta cambiar identificador, ID, fecha, tokens ni atributos de autorización. Los valores SQL están parametrizados y las columnas editables proceden de una lista interna.

Errores: 400 datos/paginación inválidos; 401 sesión ausente, inválida o sin rol administrativo; 404 registro inexistente; 409 identificador duplicado, también ante altas simultáneas; 503 servicio no disponible, sin detalles SQL. El frontend no reintenta escrituras automáticamente cuando la respuesta es incierta: pide consultar la lista antes de volver a guardar.

## Prueba local desde una laptop

### Opción automatizada, sin configurar PostgreSQL

Con las dependencias existentes de backend y frontend instaladas:

```powershell
cd frontend
npm.cmd run build
node scripts/revisar-computadoras.mjs
```

Requiere Chrome en la ubicación habitual de Windows; para otra ubicación usar `CHROME_PATH`. Usa preview en loopback:4183, un Express real en puerto efímero y una base PostgreSQL embebida PGlite exclusivamente en memoria. No carga `.env`, no conecta a la base instalada y crea un administrador ficticio temporal. Intercepta las solicitudes de API del navegador y las dirige únicamente al backend efímero; ninguna llega a un backend real aunque el build tenga otra URL.

Abre dos contextos Chrome aislados para simular dos sesiones. Comprueba altas visibles en ambas sesiones, duplicados, nombre/grado, estados, persistencia tras recargar, doble envío y cierre de sesión independiente. Es una simulación local, no certifica dos equipos físicos ni prueba credenciales de dispositivo.

### Opción manual con PostgreSQL de pruebas

Usar únicamente una base existente y preparada llamada **`db_municipio_escolar_pruebas`**, con su administrador de pruebas. No utilizar credenciales reales ni apuntar a producción. Desde una terminal PowerShell en `backend`:

```powershell
$env:DB_NAME = 'db_municipio_escolar_pruebas'
$env:DB_HOST = '127.0.0.1'
$env:HOST = '127.0.0.1'
$env:PORT = '3001'
$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5173'
# Mantener DB_USER, DB_PASSWORD y JWT_SECRET solo en el entorno privado del backend.
npm.cmd run db:migrate
npm.cmd start
```

El ejecutor aplica solamente migraciones pendientes. No inicia ni crea PostgreSQL o la base; si no hay un administrador de pruebas, coordinar su preparación siguiendo las instrucciones existentes, sin copiar cuentas reales. Verificar en `http://localhost:3001/api/database` que el nombre devuelto sea exactamente `db_municipio_escolar_pruebas` antes de registrar equipos.

En otra terminal, desde `frontend`:

```powershell
$env:VITE_API_URL = 'http://localhost:3001/api'
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

1. Abrir `http://localhost:5173` en un perfil normal de Chrome (sesión A) y en Edge, otro perfil o una ventana privada (sesión B). Dos ventanas privadas del mismo perfil pueden compartir almacenamiento; preferir perfiles separados. No usar el navegador de una elección real.
2. Iniciar sesión como administrador de pruebas en A, ir a Configurar sistema → Administrar computadoras. Registrar `PC-01`, nombre `Equipo aula 3 A`, grado 3; registrar `PC-02` con grado 3 y `PC-03` con grado 5. Varias asignaciones al mismo grado deben aceptarse.
3. En B comprobar que no se abrió automáticamente la sesión de A; autenticarse con el administrador de pruebas. Abrir el mismo módulo y consultar la lista. Son registros compartidos desde PostgreSQL, no un inventario privado de cada navegador.
4. Intentar registrar `pc-01`: debe informar duplicado. Editar PC-02, cambiar nombre y grado. Deshabilitar y habilitar; usar Actualizar lista en A para ver cada cambio de B.
5. Recargar B, volver al módulo y verificar persistencia de los registros y fecha original. Cerrar sesión en A; B mantiene su sesión independiente.
6. En las herramientas del navegador comprobar que las llamadas administrativas requieren Bearer y no se crean credenciales de equipo ni se envían credenciales de base de datos. No pegar tokens administrativos en sesiones que representen puestos estudiantiles. Una sesión sin administrador no puede listar, registrar ni editar equipos.

No es necesario votar ni borrar datos para probar este módulo. Las pruebas automáticas de conservación electoral usan exclusivamente instancias efímeras. No ejecuté la migración sobre el PostgreSQL instalado: la aplicación de la nueva migración en la base de pruebas queda como paso del procedimiento manual.

## Diseño de vinculación para una etapa posterior (no implementado)

La autorización del dispositivo debe ser independiente del identificador público y de la sesión administrativa. Propuesta para revisar antes de implementar:

1. Administrador autenticado solicita una invitación de vinculación para un equipo activo; el servidor genera un secreto aleatorio criptográfico de al menos 32 bytes, caducidad corta y uso único. Guarda únicamente su hash, equipo, fecha y creador. No distribuir el JWT administrativo al equipo.
2. El navegador del puesto crea su propio par de claves y presenta la invitación por HTTPS con la clave pública. La vinculación queda pendiente hasta aprobación administrativa. El servidor consume la invitación atómicamente y registra la clave pública y una credencial de dispositivo con permisos exclusivos, nunca administrativos.
3. Autenticar posesión de la clave mediante desafío de un solo uso o protocolo revisado; cada sesión de dispositivo tiene audiencia/alcance, caducidad y revocación. Comprobar en el servidor equipo activo, vinculación vigente y grado asignado. No confiar en un `computadoraId`, grado, IP o bandera enviado por el cliente.
4. Definir rotación, pérdida de perfil, cambio de equipo y revocación; deshabilitar debe bloquear nuevas sesiones/operaciones del dispositivo. Resolver intentos de vinculación repetidos con límites y auditoría. Antes de restringir por grado, acordar la normalización de los grados de estudiantes, que hoy son texto libre.

La generación de secretos debe usar un CSPRNG ([OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)); HTTPS y autorización por endpoint son necesarios ([OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)). Las claves de un perfil de navegador no equivalen a identidad física de hardware: un perfil comprometido requiere revocación. La validación de permisos y grado deberá hacerse en el backend cuando se implemente esa etapa, sin enlazar identidad del estudiante y voto.

Nada de este diseño se activa aquí. Continúan pendientes HTTPS del despliegue, vinculación, pantalla de puesto, supervisores y pruebas físicas de red/carga. La edición concurrente de un mismo campo de inventario conserva la última escritura aceptada; no hay reserva de un equipo para una sesión. Consultar la lista en cada sesión permite ver cambios ajenos.

## Resultados de la verificación

- Backend: `npm.cmd test` → **123 aprobadas, 0 fallidas** (114 anteriores y 9 nuevas).
- Frontend: `npm.cmd test` → **47 aprobadas, 0 fallidas** (41 anteriores y 6 nuevas).
- `npm.cmd run build` y `npm.cmd run lint` del frontend: aprobados.
- `node scripts/revisar-computadoras.mjs`: aprobado con dos sesiones Chrome aisladas, React construido, Express real y PGlite efímero. El entorno de ejecución requirió autorización para iniciar Chrome fuera de su aislamiento; no se deshabilitó la seguridad del navegador ni de la aplicación.
- Validación de 125 equipos paginados, duplicados simultáneos y por mayúsculas/minúsculas, edición, habilitación/deshabilitación, integridad SQL, sesiones sin permisos y conservación de datos electorales.
- `git diff --check`: sin errores. No se modificaron migraciones anteriores, configuración LAN, `.env`, datos de PostgreSQL instalado ni reglas de firewall. Sin commit, push ni merge.

Archivos nuevos: migración `010_computadoras.sql`; error, repositorio, servicio, rutas y prueba de computadoras en backend; API, componente, estilos, prueba y script de navegador en frontend; este documento. Integraciones modificadas: `backend/app.js`, `frontend/src/App.jsx`, la lista de tablas esperadas de `backend/test/database.test.js` y la expectativa de migraciones en `backend/test/borrado-datos.test.js`.
