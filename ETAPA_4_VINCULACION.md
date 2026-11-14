# Etapa 4: vinculación segura de puestos

## Funcionamiento

Administrar computadoras muestra el estado de vinculación y permite generar una autorización o revocar. La autorización es un valor aleatorio de 256 bits (`crypto.randomBytes(32)`), válido durante **10 minutos**, mostrado una sola vez. Generar otra invalida la anterior. Un equipo vinculado, aunque su credencial haya vencido, requiere revocación explícita antes de una nueva autorización.

El puesto abre `/puesto` o `/?puesto=1` (también hay un enlace en Inicio) y presenta únicamente el código. No recibe ni utiliza el JWT administrativo. El canje entrega una credencial aleatoria independiente de 256 bits mediante **cookie HttpOnly**, de duración **12 horas**, host-only, `SameSite=Strict`, ruta `/api/puesto`, `Secure` por defecto. No se entrega el secreto persistente en JSON ni se guarda en localStorage/sessionStorage. Los códigos temporales solo permanecen en memoria mientras se muestran o introducen; no se usan URLs ni logs para transferirlos.

La pantalla del puesto solo muestra su estado y la computadora/grado resueltos en PostgreSQL. No carga el panel administrativo ni lee su sesión. Cambiar la URL, una variable del navegador, un identificador o un grado no concede permisos. El proceso electoral existente permanece intacto: **la credencial del puesto todavía no autoriza votos ni filtra estudiantes por grado**.

## Consistencia y revocación

La migración nueva `011_vinculacion_equipos.sql` crea `autorizaciones_puesto` y `vinculaciones_puesto`, con claves foráneas a computadoras, una relación compuesta que asegura correspondencia entre autorización y computadora y verificadores SHA-256, nunca secretos en texto plano. Un índice único parcial permite una sola autorización pendiente por computadora; otro impide más de una vinculación sin revocar. Se conserva el historial, sin borrados automáticos.

Generación, canje y revocación bloquean la misma fila de computadora en transacciones. El canje vuelve a verificar estado, vencimiento y consumo después de obtener el bloqueo; inserta la vinculación y consume la autorización atómicamente. Las pruebas también usan conexiones PostgreSQL independientes para comprobar las carreras. La consulta de puesto revisa PostgreSQL en cada solicitud, sin caché de autorización.

Revocar invalida credenciales y autorizaciones pendientes. Deshabilitar una computadora hace lo mismo mediante un trigger nuevo; rehabilitarla no reactiva secretos anteriores. Una solicitud que comprueba la credencial después de la revocación se rechaza inmediatamente; no es posible retirar una respuesta ya enviada. La interfaz actualiza el estado cada 15 segundos, al recuperar foco y mediante Consultar estado. No se altera ningún endpoint de votos.

Estados administrativos: `sin_vincular`, `pendiente`, `vinculada`, `vencida`, `revocada`, `deshabilitada`. El puesto sin cookie no puede identificar su historial: después de que el navegador elimine una cookie vencida mostrará Sin vincular, mientras el administrador conserva el historial de vencimiento/revocación. No hay detección de presencia física o conexión permanente.

## Endpoints

| Método y ruta | Permiso / comportamiento |
|---|---|
| `POST /api/computadoras/:id/autorizaciones` | JWT administrativo vigente; cuerpo `{}`; devuelve código temporal y `vence_en` una sola vez |
| `GET /api/computadoras/:id/vinculacion` | JWT administrativo; devuelve ID y estado, sin secretos |
| `POST /api/computadoras/:id/revocar` | JWT administrativo; cuerpo `{}`; revoca vinculaciones y autorizaciones pendientes |
| `POST /api/puesto/vincular` | `{ "codigo": "64 caracteres hexadecimales" }`; Origin autorizado, JSON, cabecera `X-Puesto-CSRF: 1`; establece cookie |
| `GET /api/puesto/estado` | Cookie de puesto; 200 con equipo/grado/vence_en si es válida; 401 con estado si no lo es |

La lista administrativa existente agrega `vinculacion` por equipo. Los errores de canje no distinguen códigos incorrectos, vencidos, usados o revocados. Campos extra se rechazan. Respuestas `Cache-Control: no-store`, errores internos genéricos y sin registro de códigos, cookies o cuerpos. No registrar esas cabeceras/cuerpos en el proxy de despliegue.

El límite público es **10 intentos por IP cada 15 minutos**, incluidos intentos exitosos. El contador reside en memoria de un único proceso Express. No se aplica como límite de cantidad de equipos: tras la ventana pueden continuar los canjes. Para despliegue con varios procesos hará falta un almacén compartido; NAT o proxy mal configurado puede agrupar clientes. No desactivar el límite para una prueba.

## Cookies, CORS, CSRF y HTTPS

Las operaciones administrativas conservan Bearer JWT, sin autenticación por cookie de puesto. El canje exige Origin HTTP/HTTPS exacto incluido en `CORS_ORIGINS`, contenido JSON y una cabecera personalizada que obliga a preflight en solicitudes de otro origen. El servidor comprueba estos requisitos también en el POST real. Se rechazan Origin ausente o `null`, aunque se haya habilitado `CORS_ALLOW_NULL_ORIGIN` para otros módulos. La consulta de estado no modifica datos.

Solo `/api/puesto/*` habilita CORS con credenciales, reflejando el origen autorizado, nunca `*`. Usar `credentials: include` en el frontend. `SameSite=Strict` exige despliegue **same-site**: preferir frontend y `/api` bajo el mismo origen HTTPS mediante proxy. En desarrollo usar siempre el mismo nombre de host en ambos servicios (ambos `localhost` o ambos `127.0.0.1`); no mezclarlos. Las protecciones se basan en [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) y [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Variables nuevas del backend:

```dotenv
PUESTO_COOKIE_SECURE=true
PUESTO_PROXY_LOOPBACK=false
```

Con Secure activo, Express rechaza el canje por HTTP. Para un proxy HTTPS local, configurar `HOST=127.0.0.1`, `PUESTO_COOKIE_SECURE=true`, `PUESTO_PROXY_LOOPBACK=true`; el arranque impide combinar esa confianza con una interfaz LAN o cookies inseguras. Express confía exclusivamente en proxies de loopback. El proxy debe terminar TLS con certificado confiable y sobrescribir correctamente `X-Forwarded-Proto` y la cadena de IP del cliente. No habilitar esa variable sin tener el proxy. Sin ella, un `X-Forwarded-Proto: https` falsificado no convierte HTTP en HTTPS.

No se instala ni configura un proxy, certificado o firewall en esta etapa. **Credenciales reales en LAN requieren HTTPS**. Para HTTP local existe una excepción explícita: `PUESTO_COOKIE_SECURE=false`, prohibida en `NODE_ENV=production`. El canje sin Secure comprueba IP de conexión, Host y Origin de loopback; no se admite como atajo para LAN. Nunca usar datos o credenciales reales en esa prueba.

Electron en desarrollo puede abrir la pantalla con el enlace de Inicio. Electron empaquetado con `file://` no puede canjear: su Origin nulo se rechaza. Usar la aplicación web HTTPS para puestos reales hasta definir un protocolo seguro o carga HTTPS en Electron. No se deshabilita `webSecurity`, sandbox ni aislamiento para permitir cookies.

## Prueba manual en una laptop

Usar exclusivamente `db_municipio_escolar_pruebas`. La migración 011 no se ha aplicado al esquema público de la base instalada durante el desarrollo. En PowerShell, desde `backend`:

```powershell
$env:DB_NAME = 'db_municipio_escolar_pruebas'
$env:DB_HOST = 'localhost'
$env:DB_PORT = '5432'
$env:HOST = '127.0.0.1'
$env:PORT = '3001'
$env:CORS_ORIGINS = 'http://localhost:5173'
$env:PUESTO_COOKIE_SECURE = 'false'
$env:PUESTO_PROXY_LOOPBACK = 'false'
# NODE_ENV debe ser development o test, nunca production en esta prueba HTTP.
@'
require('dotenv').config({quiet:true});
const pool = require('./config/db');
(async () => {
  const {rows} = await pool.query('SELECT current_database() AS base');
  if (rows[0].base !== 'db_municipio_escolar_pruebas') throw new Error('Destino incorrecto');
  console.log('Destino verificado: ' + rows[0].base);
})().catch(() => { console.error('No se verificó el destino de pruebas'); process.exitCode=1; }).finally(() => pool.end());
'@ | node
if ($LASTEXITCODE -ne 0) { throw 'Detener: no ejecutar migraciones' }
npm.cmd run db:migrate
npm.cmd start
```

Mantener DB_USER, DB_PASSWORD y JWT_SECRET en el entorno privado del backend; no copiarlos al frontend. No ejecutar el comando de migración sin fijar y verificar primero el destino de pruebas. Consultar `/api/database` debe devolver exactamente `db_municipio_escolar_pruebas`. No reiniciar ni borrar datos existentes.

Desde otra terminal en `frontend`:

```powershell
$env:VITE_API_URL = 'http://localhost:3001/api'
npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

1. Perfil administrador: abrir `http://localhost:5173`, iniciar sesión con el administrador de pruebas, entrar en Administrar computadoras. Registrar o usar dos equipos de prueba habilitados, incluso del mismo grado.
2. Puesto A y puesto B: abrir `http://localhost:5173/puesto` en **dos perfiles de navegador separados**, por ejemplo perfil privado de Chrome y perfil privado de Edge. No iniciar sesión como administrador en esos perfiles. Dos pestañas o ventanas privadas del mismo perfil pueden compartir cookies y representarían el mismo puesto.
3. Generar autorización para PC-01, copiarla al formulario de A y cerrar el modal administrativo. A debe mostrar Vinculada y el grado guardado. La credencial no es visible en `document.cookie` ni en localStorage. No copiarla desde herramientas de desarrollo.
4. Intentar el mismo código en B: debe rechazarse. El administrador no puede generar otro código para PC-01 mientras siga vinculada.
5. Revocar PC-01. Consultar estado en A: debe mostrar Revocada. Generar un código nuevo para PC-01 y canjearlo en B. El antiguo navegador continúa rechazado.
6. Generar autorización para PC-02 y canjearla en A. A y B representan dos equipos distintos del mismo grado. Deshabilitar PC-02 y consultar A: pierde la credencial; rehabilitar no la reactiva. B conserva PC-01.
7. Para comprobar vencimiento manual de código esperar 10 minutos; las pruebas automatizadas verifican vencimiento sin esperar y no requieren modificar manualmente fechas en una base compartida. No se necesita emitir votos ni borrar registros.

## Pruebas automatizadas

```powershell
# Backend: instancias PGlite efímeras, sin .env ni base instalada.
cd backend
npm.cmd test

# PostgreSQL instalado: SIEMPRE db_municipio_escolar_pruebas.
$env:VINCULACION_PG_REAL = 'true'
node --test test/vinculacion.test.js
Remove-Item Env:VINCULACION_PG_REAL

# En frontend:
npm.cmd test
npm.cmd run build
npm.cmd run lint
node scripts/revisar-vinculacion.mjs
```

La prueba PostgreSQL fija el nombre de base en el código y verifica `current_database()` antes de cualquier escritura. Crea un esquema de nombre aleatorio exclusivo, configura `search_path` sin `public`, aplica las migraciones allí y elimina únicamente ese esquema de prueba al finalizar. Las tablas y datos previos de `public` no se tocan. La prueba PGlite serializa las transacciones por tener una conexión; la ejecución PostgreSQL comprueba los bloqueos con conexiones independientes.

El script del navegador compila un frontend temporal con `/api` relativo y arranca Express con una base PGlite en memoria y cuentas ficticias. Usa tres contextos Chrome separados: administrador y dos puestos; comprueba cookies HttpOnly reales, reutilización, revocación, nueva vinculación, persistencia y aislamiento administrativo. No intercepta ni simula las respuestas de la API. No utiliza PostgreSQL instalado ni datos reales. Si el aislamiento del entorno impide iniciar Chrome, necesita autorización para ejecutar el script fuera de ese aislamiento; no usar `--no-sandbox`.

## Límites y siguientes etapas

La cookie identifica un perfil de navegador, no hardware físico. Un perfil o equipo comprometido puede permitir copiar cookies; HttpOnly no sustituye la protección del equipo ni impide todas las consecuencias de XSS. El código temporal es una autorización al portador: transferirlo solo al perfil correcto mediante un canal confiable; quien lo canjee primero obtiene el puesto. No hay huella de hardware, prueba criptográfica de posesión, aprobación posterior adicional ni renovación automática. Si se pierde la respuesta del canje o se borra el perfil, el administrador debe consultar y revocar antes de volver a vincular.

La autorización de cada operación se comprueba en PostgreSQL, pero la interfaz no recibe una notificación instantánea por socket: consulta periódicamente. Quedan pendientes despliegue HTTPS/certificados, operación con Electron empaquetado, almacén compartido de límites si hay varios procesos, pruebas físicas LAN/carga y política de conservación del historial. No se implementaron supervisores, papeleta de puesto, filtro electoral por grado ni cambios al voto: corresponden a etapas posteriores.

## Verificación ejecutada y archivos

- Backend: **138/138** pruebas aprobadas (123 anteriores y 15 nuevas).
- Frontend: **53/53** aprobadas (47 anteriores y 6 nuevas).
- PostgreSQL instalado: **15/15** pruebas de vinculación aprobadas en esquema aislado de `db_municipio_escolar_pruebas`, incluidos canjes, generación y revocación concurrentes. Esquema temporal retirado al terminar.
- Navegador: escenario de administrador y dos puestos aislados aprobado, cookies HttpOnly reales y servidor Express real con PGlite efímero. Se requirió autorización para iniciar Chrome fuera del aislamiento del entorno; no se deshabilitaron sus controles de seguridad.
- Build y lint del frontend aprobados; `git diff --check` sin errores.
- No se aplicó 011 en `public`, no se modificaron migraciones 001–010, datos existentes, módulos electorales ni firewall. Sin commit, push o merge.

Nuevos: este documento; `database/migrations/011_vinculacion_equipos.sql`; `backend/config/puesto.js`, `backend/repositories/vinculacion.repository.js`, `backend/services/vinculacion.service.js`, `backend/routes/vinculacion.routes.js`, `backend/test/vinculacion.test.js`; `frontend/src/api/vinculacion.js`, `frontend/src/components/VinculacionComputadora.jsx`, `frontend/src/pages/VincularPuesto.jsx`, `frontend/test/vinculacion.test.js`, `frontend/scripts/revisar-vinculacion.mjs`.

Modificados: `backend/.env.example`, `backend/server.js`, `backend/app.js`, `backend/repositories/computadoras.repository.js` (estado de vinculación en lista), `backend/test/database.test.js` (tablas nuevas), `backend/test/computadoras.test.js` (limpieza exclusivamente de su instancia efímera, respetando claves foráneas); `frontend/src/App.jsx`, `frontend/src/components/GestionComputadoras.jsx`, `frontend/src/styles/computadoras.css`.
