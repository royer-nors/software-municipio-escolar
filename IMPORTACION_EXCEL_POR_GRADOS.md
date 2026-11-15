# Importación Excel por grados de secundaria

Implementada en `feature/importacion-excel-por-grados`, desde develop
`9bb29f7762b77b509ab247ef4f3f58fa9e233087`. Sin commit, push ni merge.

## Funcionamiento

El panel conserva el alta manual y añade un flujo Excel independiente:

1. Seleccionar **grado 1.º–5.º** y modo de carga.
2. Seleccionar un archivo `.xlsx` y pulsar **Ver vista previa**.
3. Revisar DNI, nombres, grado, sección y acción de cada estudiante. La tabla
   tiene páginas de 50 filas. Se muestran las cantidades de altas,
   actualizaciones, bajas y registros sin cambios; las bajas tienen su listado.
4. Pulsar **Revisar y confirmar importación**, revisar las cantidades y marcar
   la confirmación explícita. El servidor ejecuta la vista previamente validada,
   sin aceptar un nuevo grado o nuevas filas desde el navegador.

| Modo | Comportamiento |
| --- | --- |
| Agregar | Solo añade DNI nuevos al grado seleccionado; conserva los existentes. Un DNI ya presente en ese grado se rechaza y se indica usar reemplazar para actualizarlo. |
| Reemplazar | Actualiza coincidencias de DNI dentro del grado, agrega los nuevos y elimina únicamente los ausentes de ese mismo grado. |

Los otros cuatro grados se conservan exactamente. Un DNI de otro grado o con
grado histórico sin validar se rechaza; no se mueve automáticamente. También
se rechazan duplicados dentro del archivo. Las variantes reconocidas de grado
(`3`, `3°`, `3.º`, etc.) se normalizan al mismo grado lógico, almacenado como
texto numérico `1`–`5`.

Se conservan los IDs de estudiantes actualizados, su estado activo/inactivo y
las secuencias; el Excel no reactiva estudiantes deshabilitados. Los nuevos
estudiantes quedan activos conforme al valor predeterminado existente. No se
modifican marcas `ya_voto`, cuentas administrativas o de consultores, listas,
candidatos, computadoras, vinculaciones ni configuración electoral.

## Formato y plantilla

Plantilla: `frontend/public/plantilla_padron_por_grado.xlsx`, descargable desde
el panel. Contiene una fila explícitamente ficticia; debe reemplazarse por datos
propios antes de una importación autorizada. No se carga automáticamente.

Columnas recomendadas: **DNI**, **Nombre completo**, **Sección**.

- Se conservan los alias existentes, incluyendo Nombres/Apellidos separados.
- El DNI debe tener ocho dígitos; guardar como texto conserva ceros iniciales.
- Grado es opcional: si no existe esa columna se asigna el grado seleccionado.
  Si la columna existe, todas sus filas deben tener un grado válido y coincidente.
  Una celda vacía, grado 6, grado de primaria o grado diferente se rechaza.
- Sección sigue siendo opcional, hasta diez caracteres.
- Nombre completo admite hasta cien caracteres.
- Se lee la primera hoja; máximo 5 MiB y 10 000 filas por archivo.
- Los archivos antiguos con varias filas de distintos grados deben separarse por
  grado antes de utilizarlos. El importador no cambia sus grados para aceptarlos.

## Seguridad, transacciones y publicación electoral

Las dos operaciones HTTP requieren JWT administrativo vigente, Origin exacto
de la lista permitida y `X-Padron-CSRF: 1`. No se admite Origin null. No se
debilitan las cookies ni los permisos de puestos, votantes o consultores.

Se bloquean tanto la vista previa como la confirmación si:

- la elección está abierta, manualmente o por programación automática;
- existe cualquier voto, incluso en blanco, o una marca de participación en
  cualquier grado;
- falta configuración electoral o hay operaciones incompatibles concurrentes.

El bloqueo por votos es deliberadamente conservador y global: no se borran votos
ni marcas para permitir importar otro grado. La configuración se consulta bajo
bloqueo y se vuelve a comprobar después de las escrituras con el reloj real,
para revertir la transacción si llega la hora de apertura durante el proceso.

La vista previa pertenece al administrador, vence en diez minutos y es de un
solo uso. Una nueva vista del mismo administrador invalida la anterior. Se
compara una huella SHA-256 del padrón completo y de la configuración: cualquier
cambio desde la vista previa obliga a revisarla nuevamente, incluso si el número
de filas no varía. Esto también evita confirmar previsiones incompatibles de
grados diferentes preparadas sobre una versión anterior del padrón.

Altas, actualizaciones, bajas, consumo de vista y auditoría de éxito se confirman
en una misma transacción. Si falla cualquier paso se revierte todo. Se conserva
la unicidad global de DNI en PostgreSQL y no se reintentan automáticamente
confirmaciones con respuesta incierta. La aplicación pide revisar el padrón
antes de repetir una operación no confirmada.

Se registra administrador, fecha, grado, modo y cantidades, sin guardar el Excel
en disco ni datos individuales en la auditoría. Los datos de la vista se limpian
al consumirse; las vencidas se limpian al generar otra vista. No se añadió una
tarea programada de purga: si no hay otra solicitud, los datos de una vista
vencida pueden permanecer en la tabla hasta esa limpieza, aunque no pueden
confirmarse. Las respuestas HTTP tienen `Cache-Control: no-store`.

## API y migración

- `POST /api/padron/previsualizar`: multipart, archivo `archivo`, `grado` y
  `modo` (`agregar` o `reemplazar`). Devuelve identificador, vencimiento,
  estudiantes, bajas y cantidades.
- `POST /api/padron/importar`: JSON
  `{ "vistaPreviaId": "UUID", "confirmar": true }`.
  Rechaza la carga multipart global anterior: no existe un camino alternativo
  para reemplazar todo el padrón sin selección ni vista previa.

La migración nueva **014_importacion_padron_grados.sql** crea únicamente:

- `vistas_previas_padron`, para guardar de forma transaccional la preparación;
- `auditoria_importaciones_padron`, vinculada a una vista consumida y única.

No modifica estudiantes existentes ni migraciones 001–013. Se validó en bases
PostgreSQL embebidas PGlite nuevas, aisladas y en memoria. **No se aplicó a ninguna
base instalada.** Debe desplegarse mediante el ejecutor de migraciones existente,
bajo autorización, antes de utilizar el nuevo módulo.

El ensayo final de 014 también se completó sobre una copia temporal restaurada
del respaldo real, aplicando primero 004–013: conservó exactamente los valores
históricos y dejó registradas 001–014. Véase `VALIDACION_MIGRACION_014.md`.
No se actualizaron las bases instaladas. Los archivos locales pendientes de la
preparación anterior se conservaron sin cambios y no forman parte de la entrega.

## Pruebas y reproducción

Desde `backend`: `npm.cmd test`.
Desde `frontend`: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.

Resultados finales: **178/178 backend, 63/63 frontend, build y lint aprobados**.
No se realizaron pruebas con varias computadoras físicas ni con credenciales
reales; las comprobaciones HTTP de puestos utilizaron únicamente fixtures.

Para garantizar que las pruebas no usen PostgreSQL instalado, se ejecutaron con
`VALIDACION_PG_REAL`, `BORRADO_PG_REAL`, `ETAPA5_PG_REAL` y
`VINCULACION_PG_REAL` en `false`, únicamente en el proceso de ejecución.
No se editó `.env`.

Las pruebas específicas de padrón cubren:

- carga sucesiva 1–5 y votación por HTTP desde cinco puestos vinculados;
- preservación de los otros grados y de identidades y configuración ajenas;
- reemplazo selectivo, cantidades, IDs conservados y auditoría;
- duplicados, grados incompatibles, DNI, encabezados y límites del archivo;
- voto o marca previa, apertura manual/automática y apertura durante la escritura;
- vistas vencidas, ajenas, consumidas o invalidadas por cambios;
- confirmación simultánea, rollback ante fallo de auditoría y límite de intentos;
- CSRF, roles, rechazo del endpoint global antiguo, plantilla y estado inactivo.

La suite integral anterior se adaptó al nuevo contrato de importación; las
pruebas del módulo Borrar datos se ejecutan solo con fixtures efímeros, sin
invocar ese módulo contra ninguna instalación. No se utilizaron los datos ni
las conexiones de `db_municipio_escolar` o `db_municipio_escolar_pruebas`.

## Archivos de implementación

- Backend: `app.js`, `routes/padron.routes.js`, `services/padron.service.js`,
  `services/padron-excel.js`, `repositories/padron.repository.js`.
- Frontend: `src/api/padron.js`, `src/components/AgregarVotante.jsx`, nuevo
  `src/components/ImportarPadronGrado.jsx` y la plantilla `.xlsx`.
- Base: nueva migración 014.
- Pruebas: `backend/test/padron.test.js`, `database.test.js`,
  `borrado-datos.test.js`, `integracion-borrado-consultores.test.js` y
  `frontend/test/padron.test.js`.
- Este documento. Se conservó el comportamiento del alta manual y del proceso
  de emisión de votos; se adaptaron las pruebas afectadas al nuevo contrato.
