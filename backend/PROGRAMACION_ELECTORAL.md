# Programación electoral y control de emergencia

## Funcionamiento

Se amplían `GET` y `PATCH /api/votacion/configuracion`. No hay endpoints duplicados. GET entrega los datos institucionales, horario, `automatica`, `estado`, `revision`, `zonaHoraria`, fecha de actualización y la apertura **efectiva** en `votacionAbierta`. PATCH requiere JWT de administrador activo.

En modo automático PostgreSQL calcula el estado usando su reloj y la zona fija `America/Lima`:

| Momento | Estado | Admite votos |
| --- | --- | --- |
| Antes del inicio | Programada | No |
| Desde el inicio, inclusive | Abierta | Sí, solo estudiante activo sin voto previo |
| Desde la finalización, inclusive | Finalizada | No |

Fecha e inicio/fin pertenecen al mismo día; no se admiten jornadas que crucen medianoche. La fecha debe existir, el año coincidir y la finalización ser posterior al inicio. Se admiten años entre 2000 y 2100. El intervalo es `[inicio, fin)`.

No hay cron, tareas del navegador ni un proceso que deba cambiar físicamente el booleano a cada minuto. `votacion_abierta` conserva la orden manual; en automático el resultado vigente se calcula al consultar y al votar. No se debe consultar únicamente esa columna para decidir si se admite un voto.

La función SQL `registrar_voto` bloquea la configuración con `FOR SHARE` y revalida el reloj después de esperar el bloqueo del estudiante. Así una solicitud iniciada antes del fin pero retenida hasta después se rechaza y revierte `ya_voto`. Un voto admitido antes del límite puede terminar de confirmar después; cerrar espera que terminen las transacciones ya admitidas. El UPDATE administrativo usa `FOR UPDATE` sobre la misma fila. Los cinco puestos usan la misma API y PostgreSQL central, sin decisiones basadas en sus relojes locales.

La identificación por DNI también rechaza estudiantes fuera del horario en modo automático. Un JWT obtenido antes del cierre no evita la validación SQL obligatoria en cada voto. El modo manual mantiene el flujo existente de identificación; la papeleta y PostgreSQL siguen impidiendo votar estando cerrado.

Los intervalos del frontend solo refrescan información; no ejecutan aperturas o cierres. Apagar las ventanas administrativas o reiniciar Node no modifica la programación persistida. El reloj del servidor PostgreSQL debe mantenerse sincronizado.

## Prioridad y auditoría

Una orden Abrir/Cerrar del módulo Control de votación tiene prioridad: desactiva `automatica` y establece la apertura manual. Si reemplaza un horario automático exige confirmación y motivo. Para volver al horario hay que activar Apertura y cierre automáticos y guardar desde Configurar centro educativo.

Desmarcar el automático desde ese formulario conserva el estado efectivo que existía al guardar; no recupera una antigua orden manual que pudiera abrir una elección finalizada.

Modificar el formulario durante una elección abierta exige confirmación y motivo. El backend lo verifica dentro de la transacción; no basta con una confirmación visual. El formulario envía `revision` y los cambios con revisión anterior se rechazan con 409. Si otro administrador cambia los datos, vuelve a abrir la ventana antes de guardar. Si la elección se abre mientras se edita, una petición sin confirmación específica se rechaza.

Cada modificación por API inserta en `auditoria_configuracion_electoral` el administrador (ID y nombre), instante, motivo y documentos JSON con el estado anterior y nuevo. El registro de auditoría y la configuración se confirman juntos; si uno falla se revierte todo. La tabla no contiene selecciones de votantes. Cambios SQL directos fuera de la aplicación no pasan por este mecanismo y deben restringirse mediante permisos de operación.

Ejemplo del cuerpo del formulario (la revisión debe obtenerse mediante GET):

```json
{
  "institucion": "I.E. Micaela Bastidas Puyucahua",
  "ubicacion": "Tamburco - Abancay - Apurímac",
  "anio": 2026,
  "fecha": "2026-11-15",
  "horaInicio": "08:00",
  "horaFin": "15:00",
  "automatica": true,
  "revision": 0,
  "confirmarCambioActivo": false,
  "motivo": "Programación inicial"
}
```

## Migración y arranque en pruebas

Nueva migración: `database/migrations/006_programacion_electoral.sql`. Agrega columnas institucionales y de horario, revisión, restricciones, auditoría y la función de estado; actualiza `registrar_voto`. Conserva las migraciones 001–005 y los votos, padrón y candidaturas. El modo inicial sigue siendo manual.

Las pruebas ejecutaron esta migración en PGlite y en un esquema efímero de `db_municipio_escolar_pruebas`, eliminado al terminar. **No se aplicó al esquema public de la base de pruebas ni a producción.** Debe aplicarse en la base de pruebas antes de usar el backend actualizado:

Desde `backend` en una terminal PowerShell exclusiva para pruebas:

```powershell
$env:DB_NAME = 'db_municipio_escolar_pruebas'
$env:PORT = '3001'
node -e "require('dotenv').config({quiet:true}); const {Pool}=require('pg'); const p=new Pool({host:process.env.DB_HOST,port:Number(process.env.DB_PORT||5432),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME}); p.query('SELECT current_database() AS base').then(r=>console.log(r.rows[0])).finally(()=>p.end())"
```

Comprueba que el resultado sea exactamente `db_municipio_escolar_pruebas`. En esa misma terminal:

```powershell
npm.cmd run db:migrate
npm.cmd run dev
```

Si ya existe un backend en 3001 no inicies otro: comprueba `/api/database` y reinicia el proceso existente con la configuración de pruebas. No cambies credenciales ni apuntes a `db_municipio_escolar`.

En `frontend`, en otra terminal:

```powershell
$env:VITE_API_URL = 'http://localhost:3001/api'
npm.cmd run dev
```

Inicia sesión administrativa, abre Configurar centro educativo y guarda una fecha y horario de pruebas con automático activado. Cierra/reabre el diálogo y verifica la recuperación. Comprueba Programada, Abierta y Finalizada. Para probar emisión, usa únicamente estudiantes de prueba y la base de pruebas. Control de votación permite una emergencia con motivo y luego se puede reactivar el automático desde el formulario.

Consultas de verificación (solo lectura en pgAdmin conectado a pruebas):

```sql
SELECT current_database();
SELECT c.*, estado_votacion(c) AS estado_efectivo FROM configuracion_votacion c;
SELECT administrador_id, administrador_usuario, registrado_en, motivo, anterior, nueva
FROM auditoria_configuracion_electoral ORDER BY id DESC;
```

## Pruebas

- `npm.cmd test` en backend: PGlite aislado, límites exactos y cambio de día/zona, autenticación y voto, motivos y auditoría, ediciones con revisión, cinco solicitudes y reinicio del servidor y motor persistente.
- `node scripts/probar-programacion.js --confirmar-base-pruebas` en backend: PostgreSQL real, nombre de base fijo y comprobado antes de escribir. Crea un esquema aleatorio aislado con su propio historial de migraciones y lo elimina al terminar. Comprueba cinco conexiones, duplicados concurrentes, cierre concurrente y un voto bloqueado hasta después de la finalización. No toca tablas de public.
- `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` en frontend.
- `node scripts/revisar-electoral.mjs` en frontend: navegador con API interceptada; guardado y recuperación del formulario, cambio a manual, y regresión de padrón, candidatos, papeleta, resultados e impresión. No registra votos en una API real.

## Archivos de esta ampliación

Nuevos: `database/migrations/006_programacion_electoral.sql`, `backend/test/programacion-electoral.test.js`, `backend/scripts/probar-programacion.js` y este documento.

Backend ampliado: `app.js`, `repositories/votacion-configuracion.repository.js`, `repositories/candidaturas.repository.js`, `services/votacion-configuracion.service.js`, `services/estudiante-auth.service.js`, `routes/votacion-configuracion.routes.js`, `routes/auth.routes.js`, `test/database.test.js`, `test/estudiante-auth.test.js`, `test/limite-acceso.test.js`.

Frontend ampliado: `src/App.jsx`, `src/api/control-votacion.js`, `src/components/ConfigurarCentroEducativo.jsx`, `src/components/ControlVotacion.jsx`, `test/control-votacion.test.js`, `scripts/revisar-electoral.mjs`.
