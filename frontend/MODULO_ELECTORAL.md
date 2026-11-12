# Votación y resultados

Las pantallas se integran en el `App.jsx` existente. No se reemplazan los
formularios de estudiantes/candidatos ni el login administrativo. El módulo
electoral incluye su propio marco y ya no anida encabezados/pies dentro del menú.

## Ejecutar

Con el backend y su esquema ya preparados por el responsable del proyecto:

1. Desde `backend`, ejecutar `npm.cmd run dev`.
2. Desde `frontend`, ejecutar `npm.cmd run dev`.
3. Abrir la URL de Vite. El menú conserva Configurar, Ver resultados y Votación.
4. Para Electron en desarrollo, mantener Vite abierto y ejecutar
   `npm.cmd run electron` desde otra terminal en `frontend`.

No se ejecutan migraciones al iniciar estas pantallas. Para que la configuración
exista, el servidor necesita su migración 004 ya aplicada por separado. La elección
debe estar abierta desde administración para permitir votar. Esta implementación
consulta su estado; no modifica la configuración ni agrega un panel administrativo.

`VITE_API_URL` es opcional y representa la URL base terminada en `/api`.
Por defecto se utiliza `http://localhost:3000/api`. No hay modo mock ni autenticación
de demostración en el módulo: todas las llamadas de la aplicación son reales.

## Contratos utilizados

- `POST /auth/estudiante`: DNI como cadena de ocho dígitos. Se verifica la respuesta
  con token, estudiante y `habilitadoParaVotar: true`.
- `GET /listas`: token del estudiante; cada lista debe tener un ID real.
- `GET /votacion/configuracion`: apertura y permiso del voto en blanco. Si falla,
  la papeleta queda bloqueada. Se consulta al cargar, al recuperar foco, cada
  veinte segundos y antes de confirmar; el backend mantiene la autoridad final.
- `POST /votos`: solo después de confirmación explícita. La selección de lista
  envía `{ listaId: id }`; únicamente el blanco explícito envía `null`.
- `GET /resultados`: usa el token entregado por App o `sessionStorage.admin_token`.
  Se leen `resumen`, `listas` y `generadoEn`, preservando porcentajes, posiciones
  y empates del servidor. Los datos incompletos no se sustituyen por ceros.

No se registra identidad en el cuerpo del voto, no se guarda la elección en
storage y no se reintenta una escritura automáticamente. Una respuesta incierta
bloquea la confirmación y solicita volver a identificar al estudiante para conocer
su habilitación. Solo un 201 verificable muestra el diálogo de voto registrado.

Grado, sección, fotos, cargos, números electorales y propuestas se muestran
cuando llegan del servidor. No se inventan esos campos ni resultados. Los avatares
de reemplazo son ilustraciones decorativas, no fotografías de candidatos reales.

## Diseño y recursos

Se conserva el azul institucional, fondo gris azulado, disposición en dos paneles,
cuadrícula de listas, confirmación y ranking con anillo y barras del prototipo.
Los estilos nuevos están limitados a `.marco-electoral`. La impresión utiliza los
resultados ya cargados, sin consultar ni modificar datos al imprimir.

Se reutiliza `public/logoo.png`, el escudo institucional disponible en el proyecto.
Es una variante distinta del escudo de Figma. La descarga del original no fue
autorizada, por lo que no se sustituyó por un icono genérico ni se sobrescribió
el recurso existente. Esa diferencia visual queda pendiente de aportar el archivo.

La base relativa de Vite permite resolver recursos de `dist` mediante `file://`
en Electron. No se modificó el empaquetado ni el proceso principal de Electron.

## Pruebas sin PostgreSQL

Desde `frontend`:

```powershell
npm.cmd test
npm.cmd run lint -- --no-cache
npm.cmd run build
node scripts/revisar-electoral.mjs
```

Las pruebas unitarias interceptan `fetch` en memoria y nunca usan red.
La revisión visual requiere Chrome instalado (o `CHROME_PATH` apuntando a Chrome
o Edge). Abre Chrome headless y el preview del build en 127.0.0.1:4179, intercepta
todas las solicitudes externas y responde con fixtures exclusivamente de prueba.
No inicia el backend, no usa credenciales reales y no registra votos en PostgreSQL.
Guarda capturas en una carpeta temporal `municipio-electoral-revision-*` y cierra
los procesos que inició. Los fixtures no forman parte del código de producción.

La revisión cubre navegación, ID, doble clic, cambios de configuración antes de
confirmar, elección cerrada, blanco deshabilitado, voto previo, respuesta incierta,
empates, ausencia de votos, respuesta inválida, impresión y anchura móvil.

El lint global conserva una importación `React` sin uso en `AgregarCandidatos.jsx`.
El formulario de votantes ahora permite registro manual real e importación Excel.

## Importar padrón desde Excel

En Configuración → Gestionar estudiantes se conserva el alta manual y se añade
la sección de importación debajo de Guardar Votante. Usa la sesión administrativa
actual, `VITE_API_URL` y `POST /api/padron/importar`, con un único campo `archivo`
en FormData. El navegador genera automáticamente el boundary multipart.

Selecciona un `.xlsx` de hasta 5 MiB y revisa el nombre antes de pulsar Importar
estudiantes. El diálogo advierte que se reemplazarán TODOS los estudiantes y exige
confirmación expresa. Antes de confirmar en un entorno real, comprueba que
`GET /api/database` indique `db_municipio_escolar_pruebas`. El frontend no cambia
la conexión de PostgreSQL ni elimina registros mediante otra operación.

Formato recomendado en la primera hoja: `DNI | Nombre completo | Grado | Sección`.
El DNI debe guardarse como texto para conservar ceros iniciales. La validación
de contenido se mantiene en el backend: ocho dígitos, DNI no duplicados, nombres,
longitudes y encabezados. Sus reglas y alias existentes no se modificaron.
Los errores por fila se muestran en una tabla; con votos previos se presenta el
409 del servidor. El éxito solo se muestra tras una respuesta verificable, con
totales importados y reemplazados. No se reintentan escrituras automáticamente.

El alta manual concatena nombres y apellidos en `nombre` y usa el endpoint
existente `POST /api/estudiantes`, conservando DNI, grado y sección. Ya no utiliza
`console.log` ni alertas para simular un guardado.

La revisión aislada en Chrome también comprueba alta manual, selección del archivo,
cancelación sin envío, doble clic, multipart/Bearer, importación aceptada y mensajes
422, 409 y 401. Usa respuestas interceptadas; no importa archivos en la base real.

Para una revisión manual segura, consultar resultados es de solo lectura. No
confirmar un voto contra la base real para probar el diseño: usar la revisión
aislada anterior o un entorno electoral de pruebas preparado por el responsable.
