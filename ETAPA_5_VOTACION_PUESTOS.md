# Etapa 5: votar desde puestos vinculados

## Alcance

Rama `feature/etapa5-votacion-puestos`, creada desde `develop` limpio y actualizado en `78daae3862f5db29d4218552c0d6f4d1e2759db3`. No se modifica `develop`, ni se crean commits o publicaciones.

`/puesto` (también `/?puesto=1`) integra ahora identificación por DNI, papeleta existente con listas/candidatos/imágenes, voto en blanco según configuración, confirmación previa y mensaje final que no revela la elección. La opción Votar de Inicio dirige a esta pantalla. No hay resultados ni controles administrativos en ella.

Solo un puesto vinculado, activo, no revocado y vigente puede identificar estudiantes, consultar configuración/papeleta o votar. Se reutilizan la identificación existente, JWT de estudiante de 15 minutos, servicios de listas/configuración y la función SQL `registrar_voto`. La sesión estudiantil lleva el ID de la vinculación firmado; no puede trasladarse a otro puesto o a una nueva vinculación del mismo equipo.

No se crea migración 012: las tablas y funciones existentes permiten aplicar estas reglas. Las migraciones 001–011 permanecen intactas. No se añade relación entre identidad del estudiante, computadora y fila del voto.

## Autorización, grados y transacciones

Cada operación sensible abre una transacción y valida el hash de la cookie en PostgreSQL. Bloquea primero la computadora y después su vinculación con `FOR SHARE`, en el mismo orden utilizado por la revocación. Así se impiden cambios de grado, deshabilitación o revocación durante una operación ya autorizada. Si la revocación se confirma primero, la siguiente operación se rechaza. Una revocación no retira un voto previamente confirmado.

Identificación, consulta de listas y voto verifican el grado desde PostgreSQL. `estudiantes.grado` sigue siendo texto: se admiten formas explícitas como `3`, `3°`, `3º`, `3.º`, `3 de secundaria`. No se adivinan grados de texto arbitrario o primaria; valores no reconocidos bloquean el acceso sin modificar el padrón. El grado del puesto nunca procede del navegador ni de claims de grado.

Al votar se coordinan los bloqueos de tablas con la gestión existente del padrón, se bloquea la fila del estudiante, se comprueba que siga activo, del grado correcto y sin voto, se bloquea la configuración, se vuelve a verificar el vencimiento de la vinculación y se ejecuta `registrar_voto` en la misma transacción. La función existente vuelve a verificar apertura/horario/voto en blanco y realiza la marca condicional `ya_voto=FALSE` y la inserción atómicamente. Un fallo revierte ambos cambios. Varios puestos pueden votar en paralelo; no hay límite fijo de equipos ni exclusividad por grado.

El control de duplicados no añade una columna identificadora a `votos`: utiliza el bloqueo y actualización condicional del padrón. Esto conserva el modelo de voto secreto. Ver [bloqueos PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).

## Endpoints

Todos los nuevos endpoints usan cookie `sme_puesto` vigente, `Cache-Control: no-store` y el transporte HTTPS de la etapa 4. Las escrituras exigen Origin autorizado, JSON y `X-Puesto-CSRF: 1`; el frontend usa `credentials: include`.

| Método y ruta | Entrada / requisito |
|---|---|
| `POST /api/puesto/identificar` | Solo `{ dni }`; puesto válido, estudiante habilitado, grado correcto y votación abierta; devuelve JWT estudiantil ligado a esa vinculación |
| `GET /api/puesto/configuracion` | Puesto válido; configuración vigente para mostrar apertura y blanco |
| `GET /api/puesto/listas` | Puesto válido y Bearer estudiantil ligado a él; vuelve a validar al estudiante y grado |
| `POST /api/puesto/votos` | Puesto válido y Bearer estudiantil; exclusivamente `{ listaId: entero }` o `{ listaId: null }` |

Las rutas públicas anteriores `/api/auth/estudiante`, `/api/listas` y `/api/votos` ahora devuelven **401 `RUTA_REEMPLAZADA`**, incluso si reciben cookies y JWT válidos. No se mantiene una opción de compatibilidad que permita votar sin puesto. Los clientes antiguos deben usar la nueva pantalla.

El endpoint público existente de configuración se conserva porque lo utilizan otros módulos; conocer esa configuración no permite emitir votos. Los archivos de imágenes mantienen su servicio existente. Resultados y administración siguen exigiendo el JWT administrativo; la cookie de puesto y los tokens estudiantiles no conceden ese permiso.

Cookies: se conservan HttpOnly, host-only, Secure por defecto, SameSite=Strict y ruta `/api/puesto`. `PUESTO_COOKIE_SECURE=false` sigue limitado a pruebas HTTP en loopback. No se abre el acceso a Origin nulo ni se desactiva CSRF. No se guardan credenciales de puesto o JWT estudiantiles en localStorage/sessionStorage.

## Finalización y respuestas inciertas

Tras una respuesta confirmada, se desmonta la papeleta y se elimina de memoria el token, DNI, identidad y selección. Solo aparece el mensaje genérico de voto registrado. Finalizar prepara un formulario vacío para el siguiente estudiante. No se añaden pasos electorales al historial del navegador. Al salir de la página o volver mediante BFCache se retira la sesión estudiantil y se reinicia la identificación. Esto complementa `no-store`, sin depender únicamente de la caché ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)).

Si la respuesta de un voto es incierta, no se reenvía automáticamente. Se bloquea la confirmación anterior y se pide consultar la habilitación identificándose de nuevo; PostgreSQL impide duplicar un voto ya registrado. El JWT es de corta duración; después de un voto, `ya_voto` impide volver a usarlo aunque todavía no haya expirado.

## Prueba manual segura desde una laptop

Para no añadir votos a la elección existente, se incluye un laboratorio nuevo en memoria. Desde la raíz:

```powershell
cd backend
node scripts/demo-votacion-puestos.js
```

El script compila automáticamente un frontend temporal con `/api` relativo y arranca **solo en `127.0.0.1:4185`**, usando PostgreSQL embebido PGlite. No carga `.env`, no conecta al PostgreSQL instalado y no utiliza su elección. No modifica `frontend/dist`. Los datos del laboratorio desaparecen al detener su proceso; no se reinicia la elección existente.

Usar perfiles nuevos dedicados a la demo: **las cookies no se aíslan por puerto**. No usar un perfil que ya tenga un puesto real vinculado al host `127.0.0.1`.

1. Perfil administrador: abrir `http://127.0.0.1:4185`, entrar con la cuenta ficticia **`admin-demo` / `SoloPruebas2026!`**. No son credenciales reales.
2. Puestos A y B: abrir `http://127.0.0.1:4185/puesto` en dos perfiles privados independientes, por ejemplo Chrome y Edge. No iniciar sesión administrativa allí.
3. En Administrar computadoras generar códigos para PC-01 y PC-02, ambas de grado 3 en esta demo, y canjear cada código en su perfil.
4. Identificar `01234567` (Ana Demo) en A y `12345678` (Bruno Demo) en B. Intentar `33333333` (grado 2) en cualquiera: debe rechazarse por grado. `44444444` es otro estudiante de grado 3 para probar abandonar una papeleta sin emitir.
5. Elegir una lista en A y blanco en B. Revisar los diálogos de confirmación; antes de confirmarlos no hay voto. Confirmar y comprobar que el mensaje final no muestra opción ni identidad.
6. Finalizar y comprobar que no quedan DNI ni selección. Volver con Atrás no debe restaurar una papeleta anterior; un DNI que ya votó debe rechazarse.
7. Revocar PC-02 desde el administrador y consultar su estado: se bloquea sin afectar PC-01 ni los votos emitidos. Se puede probar cierre o blanco en la configuración **de este laboratorio**.

No es necesario cambiar ni deshabilitar PC-01/PC-02 de la base instalada para este procedimiento. Ctrl+C detiene únicamente el laboratorio.

## Pruebas automatizadas y aislamiento

```powershell
# Backend, bases efímeras en memoria:
cd backend
$env:ETAPA5_PG_REAL = 'false'
$env:VINCULACION_PG_REAL = 'false'
npm.cmd test

# Concurrencia con PostgreSQL instalado, únicamente en esquema aislado:
$env:ETAPA5_PG_REAL = 'true'
node --test test/votacion-puesto.test.js
Remove-Item Env:ETAPA5_PG_REAL

# En frontend:
npm.cmd test
npm.cmd run build
npm.cmd run lint
node scripts/revisar-votacion-puestos.mjs
```

El entorno real fija `db_municipio_escolar_pruebas`, verifica `current_database()` antes de escribir, crea un esquema `prueba_votacion_puesto_<uuid>` y configura `search_path` sin `public`. Aplica las migraciones y crea exclusivamente datos ficticios allí. Al terminar retira solo ese esquema. No emite votos en `public` ni utiliza otra base. PGlite serializa conexiones; la prueba PostgreSQL utiliza conexiones independientes para comprobar concurrencia real.

Los tests heredados de identificación, listas, voto, padrón, usuarios, imágenes y programación conservan sus verificaciones usando un harness de routers/servicios aislados. Ese harness está únicamente en `test-support`, no es el servidor desplegado ni una bandera de compatibilidad. Las pruebas nuevas importan el `createApp` real y comprueban expresamente el bloqueo de las rutas antiguas con cookie y token válidos.

El script del navegador utiliza la misma demo efímera y tres contextos Chrome aislados. Comprueba cookies reales, grado, confirmación, votos por lista y blanco, limpieza, botón Atrás tanto al finalizar como al abandonar una papeleta, duplicados y revocación. No intercepta las respuestas de la API. Puede requerir autorización para iniciar Chrome fuera del aislamiento de ejecución, sin desactivar el sandbox del navegador.

## Conectar laptops y PC reales

El código queda preparado para frontend y API en **una única dirección HTTPS**, con `VITE_API_URL=/api` al compilar, proxy hacia Express en loopback, `PUESTO_COOKIE_SECURE=true`, `PUESTO_PROXY_LOOPBACK=true` y `CORS_ORIGINS` con el origen HTTPS exacto. Las instrucciones HTTPS de la etapa 4 y el diagnóstico LAN siguen siendo aplicables; esta etapa no instala proxy/certificados, cambia `.env` ni abre puertos.

Para ensayar con Laptop B → PC-01, Laptop C → PC-02 y PC de escritorio → PC-03, preparar primero una elección/base de ensayo aislada y los tres registros autorizados (varios pueden compartir grado). Registrar PC-03 sería una acción administrativa de ese ensayo, no una modificación automática de las dos computadoras existentes. Cada cliente solo necesita navegador y certificado confiable; PostgreSQL, Node.js y el backend permanecen en el servidor central.

Los códigos no pueden trasladar la vinculación actual entre perfiles: si se mueve un puesto, revocarlo y generar una autorización nueva expresamente. No copiar cookies ni JWT. Usar siempre la misma dirección HTTPS en servidor y clientes. No ejecutar el laboratorio HTTP de loopback como atajo para LAN.

Pendientes de la prueba física: autorización y configuración de red privada/firewall, ausencia de aislamiento Wi-Fi entre clientes, certificado confiable en cada equipo, IP o DNS estable y medición de carga real. No se certifica capacidad para un número concreto de equipos. Electron empaquetado con `file://` sigue sin admitir el canje; usar navegador HTTPS para esta prueba. La identificación continúa basada en el DNI, como en el sistema existente; no se añade un segundo factor ni supervisores. Un perfil comprometido puede permitir robo de sesión: la cookie identifica el perfil, no hardware físico.

## Verificación final

| Comprobación | Resultado |
|---|---|
| Backend completo | 153/153 aprobadas |
| Frontend | 58/58 aprobadas |
| PostgreSQL real, esquema aislado | 15/15 aprobadas |
| Build y lint | Aprobados |
| Administrador + dos puestos Chrome aislados | Aprobado, incluida navegación Atrás tras finalizar y al abandonar una papeleta |
| Datos previos en public | Conteos y huellas de contenido idénticos antes/después |
| Esquemas temporales de etapa 5 restantes | 0 |
| Git | develop permanece en 78daae3; sin commit, push o merge |

Se conservaron exactamente **10 estudiantes, 3 listas, 3 candidatos, 5 votos y 2 computadoras** de `db_municipio_escolar_pruebas`. No se reinició esa elección. Las comprobaciones de conservación fueron consultas de lectura; los votos automatizados se emitieron únicamente en instancias efímeras o esquemas temporales nuevos. No se modificaron las migraciones, los módulos Resultados/Borrar datos/Configurar voto en blanco ni reglas de firewall.

## Archivos de esta etapa

Nuevos (12):

- `ETAPA_5_VOTACION_PUESTOS.md`
- `backend/repositories/votacion-puesto.repository.js`
- `backend/routes/votacion-puesto.routes.js`
- `backend/services/grado-secundaria.js`
- `backend/scripts/demo-votacion-puestos.js`
- `backend/test-support/entorno-votacion-puesto.js`
- `backend/test-support/legacy-router-harness.js`
- `backend/test/votacion-puesto.test.js`
- `frontend/src/components/VotacionPuesto.jsx`
- `frontend/test/votacion-puesto.test.js`
- `frontend/scripts/revisar-votacion-puestos.mjs`
- `frontend/scripts/soporte-navegador-puestos.mjs`

Modificados (19):

- Backend funcional: `backend/app.js`, `backend/middleware/autenticacion.js` (conserva el ID de vinculación firmado del estudiante), `backend/repositories/estudiante.repository.js` (incluye grado al consultar), `backend/routes/vinculacion.routes.js` (comparte comprobaciones de transporte/CSRF), `backend/services/estudiante-auth.service.js` (JWT ligado al puesto y cierre).
- Tests heredados: `backend/test/estudiante-auth.test.js`, `backend/test/listas.test.js`, `backend/test/votos.test.js`, `backend/test/limite-acceso.test.js`, `backend/test/programacion-electoral.test.js`, `backend/test/programacion-reloj-controlado.test.js`, `backend/test/padron.test.js`, `backend/test/usuarios.test.js`, `backend/test/candidaturas.test.js`. En cada uno cambia únicamente la importación para probar los routers anteriores en aislamiento; no se eliminan sus aserciones.
- Frontend: `frontend/src/App.jsx`, `frontend/src/api/estudiantes.js`, `frontend/src/pages/AutenticarVotante.jsx`, `frontend/src/pages/ListasCandidatos.jsx`, `frontend/src/pages/VincularPuesto.jsx`.
