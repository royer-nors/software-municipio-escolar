# Borrar datos desde el panel administrativo

Implementado en `feature/mejorar-borrado-datos`, sin commit, push ni merge.
El administrador confirma con su contraseña vigente; no necesita autorización
externa ni un código adicional. Se conserva el interruptor general del servidor
y la prohibición de borrar elecciones reales en producción.

## Flujo y consistencia

1. Iniciar sesión como administrador y entrar en **Borrar datos**.
2. Seleccionar una operación y **Simular operación**. Esta acción solo registra
   la vista previa en auditoría: no elimina información electoral.
3. Revisar cantidades y efectos, pulsar **Revisar y confirmar**, marcar la
   confirmación e introducir otra vez la contraseña administrativa.
4. El servidor vuelve a comprobar permisos, contraseña, estado electoral,
   origen de la solicitud y que los registros sigan siendo los de la simulación.
5. Si todo coincide, realiza la eliminación y la auditoría en una transacción.
   Un error revierte también configuración, revocaciones y consumo de la vista
   previa. Una operación concurrente incompatible se rechaza; hay que simular
   nuevamente. La aplicación no reintenta automáticamente una eliminación.

Todas las operaciones requieren una elección cerrada, incluida su programación
automática. La vista previa pertenece al administrador que la generó, vence a
los diez minutos y solo se consume una vez. Una huella SHA-256 detecta cambios
en registros y configuración, incluso si sus cantidades siguen iguales.

| Operación | Condición y efecto |
| --- | --- |
| Votos y marcas de participación | Elimina votos y restablece `ya_voto`; conserva padrón y candidaturas. |
| Solo estudiantes Excel | Solo registros con origen `excel`; exige no tener votos ni marcas de participación. |
| Todo el padrón | Exige no tener votos ni marcas de participación. |
| Solo candidatos | Exige no tener votos ni marcas; conserva listas. |
| Solo listas | Exige no tener candidatos, votos ni marcas. |
| Votos, candidatos y listas | Borra en ese orden, restablece participación y conserva estudiantes. |
| Reinicio electoral completo | Elimina votos, candidatos, listas y estudiantes; limpia fecha, año y horario electoral. |

En todos los casos se conservan administradores, computadoras y auditorías.
Se revocan todas las autorizaciones pendientes y vinculaciones de puestos:
las sesiones estudiantiles vinculadas dejan de servir aunque se abra otra vez
la elección. Se conserva el historial de vinculaciones; los puestos requieren
una nueva vinculación. No se revocan las sesiones administrativas.

La elección queda cerrada, con programación automática desactivada y revisión
de configuración incrementada. Se conserva la institución, ubicación y opción
de voto en blanco. No se reinician secuencias ni se borran archivos de imágenes
del disco; la auditoría tampoco se elimina.

Tras un reinicio completo se puede importar el nuevo padrón, registrar listas
y candidatos y configurar otra elección con las pantallas existentes. El
importador Excel conserva su comportamiento de reemplazar el padrón, no de
combinarlo con registros anteriores.

## Migración y despliegue pendiente

Nueva migración: `database/migrations/012_reinicio_electoral.sql`.

- Añade `estudiantes.origen_registro`, con valores `desconocido`, `manual` o
  `excel`. Las altas manuales y nuevas importaciones registran su origen.
- Los estudiantes anteriores quedan como `desconocido`: no se puede atribuirles
  retrospectivamente un origen Excel sin evidencia. **Solo importados** los
  conserva. **Todo el padrón** y **Reinicio completo** sí los incluyen.
- Amplía las operaciones admitidas por la restricción de auditoría.
- No modifica migraciones anteriores ni elimina registros existentes.

**No se ha aplicado la migración 012 al esquema público de la base instalada.**
Esta entrega aplica migraciones únicamente a bases efímeras o esquemas nuevos
aislados. Antes de usar esta versión contra una base instalada se deberá aplicar
012 mediante el ejecutor existente, bajo autorización de despliegue. Hasta
entonces el módulo devuelve indisponibilidad si falta la columna nueva.

Para una futura ejecución autorizada en pruebas, el servidor requiere
`DB_NAME=db_municipio_escolar_pruebas`,
`BORRADO_DATOS_DB_PRUEBAS=db_municipio_escolar_pruebas` y
`BORRADO_DATOS_HABILITADO=true`. El valor general de ejemplo sigue siendo
`false`; no se ha editado ningún `.env` real. Ya no se utilizan
`BORRADO_DATOS_REINICIO_HABILITADO` ni
`BORRADO_DATOS_AUTORIZACION_REINICIO`. `NODE_ENV=production` bloquea el borrado.
No hay una autorización adicional por operación fuera del panel.

## API y seguridad

Todas las rutas requieren JWT administrativo vigente:

- `GET /api/borrado-datos/resumen`
- `GET /api/borrado-datos/auditoria`: últimas 50 entradas con actor, fecha,
  operación, resultado y cantidades cuando corresponde.
- `POST /api/borrado-datos/simulacion`
- `POST /api/borrado-datos/ejecutar`
- `POST /api/borrado-datos/reinicio-excepcional`: alias de compatibilidad que
  utiliza las mismas comprobaciones; no permite saltarse la simulación.

Los POST exigen `Origin` explícito permitido por `CORS_ORIGINS`, JSON y
`X-Borrado-CSRF: 1`. No aceptan origen `null`. Se conservan autenticación y
autorización existentes; las cuentas inactivas no pueden ejecutar el borrado.
Los endpoints de ejecución comparten límite de cinco solicitudes fallidas por
IP cada quince minutos. Se verifica la contraseña actual en PostgreSQL/bcrypt;
no se guarda en estado persistente, auditoría ni logs. La confirmación visible
es una casilla y la contraseña, no una frase o un código que el usuario tenga
que obtener externamente.

El registro de éxito forma parte de la transacción y guarda actor, fecha,
operación, cantidades eliminadas y revocaciones. No contiene DNI individuales,
contraseñas ni credenciales de puestos. La base conserva las auditorías previas.
Esto no constituye un archivo inmutable frente a quien tenga administración
directa de PostgreSQL.

## Pruebas seguras

Desde `backend`: `npm.cmd test` utiliza bases efímeras para las pruebas del
módulo. Para comprobarlo además en PostgreSQL instalado, ejecutar:

```powershell
$env:BORRADO_PG_REAL='true'
node --test test/borrado-datos.test.js
Remove-Item Env:BORRADO_PG_REAL
```

El helper fija `db_municipio_escolar_pruebas`, comprueba la base y crea un esquema
aleatorio nuevo. Su `search_path` excluye `public`; los borrados, fixtures,
migraciones y limpieza afectan únicamente ese esquema. No emplear esos fixtures
contra un esquema público o una conexión de producción.

Desde `frontend`:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run lint
node scripts/revisar-borrado-datos.mjs
```

La última comprobación abre un navegador con perfil temporal y una demo nueva
en PostgreSQL embebido en memoria. Verifica vista previa, contraseña incorrecta
sin borrado, confirmación con contraseña, doble envío, auditoría y conservación
de administradores/computadoras. Nunca utiliza la base instalada. Requiere
Chrome disponible y el build del frontend actualizado.

## Elecciones reales: conservación y revisión normativa

La [RVM 046-2025-MINEDU](https://dne.jne.gob.pe/DnefDocumentos/public/pdf/5.%20RESOLUCI%C3%93N%20VICEMINISTERIALES/RESOLUCI%C3%93N-_046-2025-minedu.pdf)
regula el proceso de municipios escolares e incluye actas y remisión de
resultados a UGEL. No debe suponerse que terminar la elección autoriza destruir
su evidencia. La institución debe definir conservación de actas y resultados,
reclamaciones, responsables y archivo antes de habilitar borrado de elecciones
reales; este cambio mantiene el bloqueo de producción.

También corresponde revisar la [Ley 29733](https://www.gob.pe/institucion/congreso-de-la-republica/normas-legales/243470)
y su [Reglamento, DS 016-2024-JUS](https://cdn.www.gob.pe/uploads/document/file/7568330/6426760-decreto-supremo-n-016-2024-jus-reglamento-de-la-ley-n-29733-ley-de-proteccion-de-datos-personales-publicado-nov-2024.pdf),
incluidos finalidad, conservación y medidas de seguridad de datos personales.
No se ha identificado un plazo único que permita eliminar todos los registros
electorales escolares. Respaldos, actas firmadas y archivos institucionales
requieren una política propia; el botón no los sustituye ni los elimina.
