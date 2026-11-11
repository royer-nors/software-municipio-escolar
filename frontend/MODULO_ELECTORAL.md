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

El lint global conserva dos errores preexistentes de importaciones `React` sin uso
en `AgregarVotante.jsx` y `AgregarCandidatos.jsx`; esos módulos no se modificaron.

Para una revisión manual segura, consultar resultados es de solo lectura. No
confirmar un voto contra la base real para probar el diseño: usar la revisión
aislada anterior o un entorno electoral de pruebas preparado por el responsable.
