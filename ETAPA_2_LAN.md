# Etapa 2: servidor central en LAN

## Auditoría y alcance

Express escuchaba exclusivamente en `127.0.0.1`; `PORT` ya era configurable (3000 por defecto, 3001 si se configura). CORS estaba abierto con `cors()`. Ahora `HOST` permite seleccionar la interfaz y CORS utiliza orígenes exactos. El valor predeterminado sigue siendo local.

React ya utiliza `VITE_API_URL` en sus llamadas y resolución de imágenes. No necesita cambios funcionales: se añade una plantilla de entorno. Su valor predeterminado sigue siendo `http://localhost:3000/api`.

Solo el backend usa `pg.Pool` con `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`. Los clientes se comunican por HTTP con Express, nunca con PostgreSQL. El pool comparte conexiones; su tamaño no representa una cantidad máxima de computadoras. No hay registro ni límite fijo de puestos en esta etapa. La capacidad real depende del hardware, la red y la carga; no se ha certificado capacidad para un número determinado de puestos.

JWT conserva HS256, emisor, audiencia, caducidad y roles; las cuentas administrativas conservan validación de actividad y versión de token. No se cambian validaciones, votos, resultados, programación, migraciones ni Borrar datos.

Electron no inicia Express ni PostgreSQL ni Vite: en desarrollo carga `http://localhost:5173` (se debe iniciar Vite en cada equipo que lo use así); empaquetado carga `dist/index.html`. Conserva `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` y la seguridad web predeterminada. No se añade empaquetador ni distribución de instaladores.

## Variables

En `backend/.env`, conservar credenciales y secreto existentes; ajustar únicamente la configuración necesaria:

```dotenv
HOST=0.0.0.0
PORT=3001
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://IP_SERVIDOR:5173
CORS_ALLOW_NULL_ORIGIN=false
DB_HOST=127.0.0.1
DB_PORT=5432
DB_NAME=db_municipio_escolar_pruebas
```

Reemplazar `IP_SERVIDOR` por la IPv4 real de la interfaz LAN (consultar `ipconfig`). Preferir una reserva DHCP o nombre DNS estable. También se puede usar esa IP como `HOST` para escuchar únicamente en esa interfaz. `0.0.0.0` escucha en todas las interfaces IPv4: restringir el firewall a la red privada y equipos autorizados. Nunca usar `0.0.0.0` como dirección en el navegador.

`CORS_ORIGINS` es una lista separada por comas de orígenes del **frontend**, con esquema y puerto exactos, sin rutas, barra final ni comodines. No es una lista de IP de clientes: si todos abren el mismo frontend central, todos comparten su origen. Si cada cliente ejecuta Vite en localhost, su origen sigue siendo `http://localhost:5173`. Conservar solo los orígenes realmente utilizados. Vacío deshabilita los orígenes web; las peticiones sin cabecera Origin siguen disponibles y necesitan la autenticación correspondiente.

En `frontend/.env.local` (copiar `frontend/.env.example` si se desea):

```dotenv
VITE_API_URL=http://IP_SERVIDOR:3001/api
```

Para desarrollo local con backend en 3001 usar `http://localhost:3001/api`. Reiniciar Vite después de cambiar la variable. Para Electron empaquetado o despliegue estático, configurarla **antes** de `npm.cmd run build` y distribuir el nuevo build; no se lee en tiempo de ejecución. No colocar `DB_*`, contraseñas ni `JWT_SECRET` en el frontend: las variables `VITE_*` quedan visibles en el código distribuido ([Vite](https://vite.dev/guide/env-and-mode)).

El backend lee `backend/.env` al iniciarse; reiniciarlo después de cambiar variables. `HOST`, `PORT` y los orígenes inválidos abortan el inicio. No se modifica automáticamente ningún archivo `.env` existente.

## Prueba real con dos computadoras

1. Conectar servidor A y cliente B a la misma LAN privada autorizada; comprobar que el Wi-Fi no tenga aislamiento de clientes. Usar exclusivamente `db_municipio_escolar_pruebas`, con esquema y datos de prueba preparados previamente. Esta etapa no crea, migra ni borra bases.
2. En A configurar el backend según lo anterior con `DB_NAME=db_municipio_escolar_pruebas`, `DB_HOST=127.0.0.1`, su secreto JWT y credenciales locales. Ejecutar desde `backend`: `npm.cmd start`.
3. En A configurar `VITE_API_URL` con la IP de A y ejecutar desde `frontend`: `npm.cmd run dev -- --host 0.0.0.0 --port 5173 --strictPort`. Vite se usa aquí solo como servidor de desarrollo para la prueba, no como alojamiento electoral definitivo. No utilizar `allowedHosts: true`.
4. Con autorización del administrador, en Firewall de Windows Defender crear reglas de entrada TCP para 3001 y 5173, perfil **Privado**, restringidas a la IP de B (o al rango autorizado necesario), idealmente también al ejecutable correspondiente. No habilitar perfil Público, redirección del router ni acceso desde Internet. No abrir 5432. Retirar las reglas de desarrollo al terminar. Esta implementación no ejecuta cambios de firewall.
5. En B ejecutar `Test-NetConnection IP_SERVIDOR -Port 3001` y `Test-NetConnection IP_SERVIDOR -Port 5173`. Abrir `http://IP_SERVIDOR:3001/api/estado`; después abrir `http://IP_SERVIDOR:5173`. Revisar en herramientas de red que las solicitudes vayan a A:3001 y las imágenes carguen desde A. Desde A comprobar también `http://localhost:3001/api/estado` y el frontend local.
6. Verificar con cuentas y estudiantes de prueba: acceso administrativo, acceso de estudiante, consulta de listas y resultados; en una elección de prueba autorizada, emitir un voto desde B y confirmar su reflejo en A. Un segundo envío del mismo estudiante debe rechazarse. No usar datos ni elecciones de producción para esta prueba.
7. Comprobar que peticiones sin JWT a `/api/resultados` devuelvan 401 y que un Origin no incluido devuelva 403. Desde B comprobar que el puerto 5432 de A no sea accesible. Que CORS funcione no sustituye este control de red.

Alternativa Electron en desarrollo: instalar las dependencias del frontend en B, configurar su `VITE_API_URL` hacia A, iniciar Vite local en B con puerto 5173 y ejecutar `npm.cmd run electron` en otra terminal. No es necesario exponer Vite de B a la LAN.

Para Electron empaquetado con `loadFile`, sus solicitudes pueden llevar `Origin: null`: habilitar `CORS_ALLOW_NULL_ORIGIN=true` únicamente si se necesita ese modo. No identifica de manera exclusiva a Electron: también puede corresponder a documentos sandbox o archivos locales ajenos. JWT y firewall siguen siendo obligatorios. Si esa ampliación no es aceptable, mantener `false` y usar el frontend HTTP/HTTPS; migrar Electron a un protocolo propio seguro requiere trabajo posterior. No desactivar `webSecurity` ([Electron](https://www.electronjs.org/docs/latest/tutorial/security/)).

## Seguridad y límites pendientes

HTTP en una LAN no cifra contraseñas, DNI ni tokens. Usar HTTP solo para pruebas controladas sin credenciales reales. Antes de una elección real, preparar HTTPS con un proxy inverso y certificado confiable instalado en todos los equipos, servir el frontend por HTTPS y configurar `VITE_API_URL` y CORS con HTTPS. No ignorar errores de certificados. Si el proxy reside en A, Express puede permanecer en loopback y solo se expone HTTPS; revisar el tratamiento de IP y los límites de acceso antes de habilitar `trust proxy`. No se configura un proxy en esta etapa.

Mantener PostgreSQL escuchando solo en loopback y sus reglas `pg_hba.conf` restringidas al backend local; este repositorio no cambia esos archivos ni certifica su estado en la máquina. Una base remota requeriría reglas exclusivas para el servidor backend, nunca para los puestos.

CORS es un control del navegador, no una autorización de equipos: herramientas externas pueden omitir o falsificar Origin. Se conserva JWT y se requiere firewall ([Express CORS](https://expressjs.com/en/resources/middleware/cors/)). El registro de equipos y supervisores queda fuera de esta etapa. La ruta existente `/api/database` continúa pública y expone nombre de base y fecha; restringirla en el proxy para un despliegue real y revisar su autenticación en una tarea específica.

No se han probado aquí dos computadoras físicas, Electron empaquetado ni capacidad de 5/10/15 puestos. Las pruebas automatizadas usan bases PGlite efímeras, no el PostgreSQL instalado; ninguna prueba de esta etapa modifica datos existentes. La comprobación física y la configuración efectiva de firewall, PostgreSQL, certificados y alojamiento definitivo quedan a cargo del despliegue autorizado.

## Verificación ejecutada

- Backend: `npm.cmd test`, 114 aprobadas, 0 fallidas (111 existentes y 3 nuevas de configuración, CORS y compatibilidad del origen Electron).
- Frontend: `npm.cmd test`, 41 aprobadas, 0 fallidas.
- Frontend: `npm.cmd run build` y `npm.cmd run lint`, ambos con salida exitosa.
- Preview del build en loopback: `http://localhost:4187` respondió HTTP 200; proceso temporal detenido al finalizar.
- API: acceso por loopback con escucha `0.0.0.0`, preflight Authorization, rechazo de origen ajeno y rutas protegidas sin JWT verificados por las pruebas nuevas. No se inició el servidor contra la base configurada en el `.env` local.
- `git diff --check` sin errores. Se conserva el cambio previo de `backend/test/database.test.js`; esta etapa no lo modifica.
