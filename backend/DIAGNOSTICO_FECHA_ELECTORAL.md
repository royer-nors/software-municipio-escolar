# Diagnóstico: elección de noviembre mostrada como Programada

## Evidencia de solo lectura (12 de noviembre de 2026)

Se consultó exclusivamente `db_municipio_escolar_pruebas` con `default_transaction_read_only=on`. La API en el puerto 3001 confirmó el mismo destino. No se cambiaron registros, configuración ni votos.

| Dato | Valor hallado |
| --- | --- |
| Reloj de PostgreSQL en Lima al consultar | 2026-11-12 22:33:25 |
| Fecha guardada | 2026-12-11 (11 de diciembre) |
| Hora de inicio | 22:27:00 |
| Hora de fin | 23:00:00 |
| Automática | true |
| Revisión | 7 |
| Estado calculado | Programada |

El historial de auditoría ya contiene la fecha de diciembre desde el primer guardado. En dos registros posteriores aparece 22:00 como inicio y, en el último, 22:27. Por tanto, los valores almacenados difieren del escenario reportado de 12 de noviembre, 22:00–23:00.

La causa comprobada del estado es la fecha guardada: el reloj está en noviembre y el inicio de la configuración está en diciembre. No se encontró un desplazamiento UTC incorrecto en el cálculo SQL. No se puede reconstruir con certeza cómo se introdujo la fecha original en el navegador; el control `type=date` dependía de la presentación regional y no ofrecía un resumen con el nombre del mes.

Se inspeccionaron las definiciones instaladas de `estado_votacion` y `registrar_voto`. Usan `America/Lima` y el reloj de PostgreSQL. Se probó, mediante una expresión SQL sin UPDATE, que para la fecha 2026-11-12 y las horas 22:00–23:00 el instante reportado 22:30:19 devuelve Abierta.

## Corrección de interfaz

- El campo fecha ahora tiene formato fijo **DD/MM/AAAA**, independiente del orden de fecha del navegador. 12/11/2026 se transforma explícitamente en 2026-11-12; 11/12/2026 en 2026-12-11.
- La API conserva fechas civiles ISO, sin convertirlas mediante la zona local del navegador.
- Formulario, confirmación y control de votación muestran el mes en letras y las horas de 24 horas.
- Los campos `type=time` siguen enviando HH:mm: 10:00 p. m. corresponde a 22:00 y 11:00 p. m. a 23:00. No se agregó una segunda conversión AM/PM.
- El mensaje de identificación fuera de horario incluye la fecha ISO guardada, las horas y America/Lima, para que un rechazo revele la configuración que lo explica.

No se cambió la función de estado ni se reinterpretó la fecha de diciembre como noviembre. Esa conversión automática alteraría la configuración y podría abrir una elección equivocada. **La elección existente seguirá figurando Programada mientras conserve su fecha de diciembre.** Un administrador debe revisar y confirmar la configuración deseada; este trabajo no la cambió.

No se necesita otra migración. Se conservaron JWT, auditoría, revisión de configuración, activo, ya_voto y prioridad manual. Las consultas de configuración y la identificación usan `estado_votacion`; `registrar_voto` usa esa misma función y vuelve a validarla después de posibles esperas.

## Archivos

- `frontend/src/utils/horario-electoral.js`: formato civil, validación y resumen inequívoco.
- `frontend/src/components/ConfigurarCentroEducativo.jsx`: entrada DD/MM/AAAA y confirmación con fecha/horas.
- `frontend/src/components/ControlVotacion.jsx`: horario almacenado visible junto al estado.
- `backend/services/estudiante-auth.service.js`: mensaje de rechazo con el horario guardado.
- `frontend/test/horario-electoral.test.js`: separación noviembre/diciembre, fechas inválidas y transporte de horas nocturnas.
- `backend/test/programacion-electoral.test.js`: antes, inicio exacto, 22:30:19, equivalencia UTC, fin exacto, día siguiente, fecha de diciembre y emergencia manual.
- `frontend/scripts/revisar-electoral.mjs`: adaptación del recorrido aislado al formato DD/MM/AAAA y las horas nocturnas. La ejecución de navegador en esta revisión no se realizó porque se rechazó su autorización.
- `frontend/src/components/ConfigurarSeguridad.jsx`: solo se retiraron tres declaraciones sin uso que impedían pasar lint; no se implementaron ni ejecutaron cambios de contraseñas.
- Este documento.

Pruebas ejecutadas: backend 92/92 y frontend 33/33; lint y build aprobados. Los tests usan PGlite temporal o fetch simulado; no escriben en la base de pruebas real.

## Consultas para pgAdmin (solo lectura)

```sql
SELECT current_database(), clock_timestamp() AT TIME ZONE 'America/Lima' AS hora_lima;
SELECT fecha_votacion::text, hora_inicio::text, hora_fin::text, automatica,
       estado_votacion(c) AS estado
FROM configuracion_votacion c;
```

No es necesario cambiar TimeZone de la sesión: la función ya aplica explícitamente America/Lima.

## Verificación general con reloj controlado

La ampliación posterior comprueba horarios arbitrarios, no una condición especial para 22:00:

| Jornada de prueba | Inicio | Fin |
| --- | --- | --- |
| Mañana, 18/05/2032 | 07:13 | 10:47 |
| Tarde, 31/12/2035 | 13:25 | 17:42 |
| Noche, 29/02/2036 | 21:17 | 23:51 |
| Regresión del caso reportado, 12/11/2026 | 22:00 | 23:00 |

En cada jornada se avanza únicamente el reloj de pruebas a un minuto antes, inicio exacto, momento intermedio, cierre exacto y un minuto después. Se consultan las rutas reales de configuración e identificación, y se intenta registrar votos mediante Express y PostgreSQL embebido. Durante cada jornada cinco estudiantes distintos se identifican y votan mediante solicitudes simultáneas; fuera de horario se rechazan las solicitudes y se conserva `ya_voto`.

`backend/test/programacion-reloj-controlado.test.js` crea una instancia PGlite en una carpeta temporal y un reloj SQL en `reloj_pruebas`. El `search_path` de esa instancia resuelve las llamadas a `clock_timestamp` hacia el reloj controlado. Se ejecutan las migraciones originales sin editarlas. El reloj no es un campo, parámetro de API ni variable de entorno de producción: no se puede alterar desde los puestos de votación.

La prueba también usa el transporte real del formulario del frontend para cambiar fecha y horario mediante PATCH, comprueba la persistencia al cerrar y reabrir Node y el motor embebido, y verifica que un booleano manual antiguo no interfiera con el automático. Una emergencia explícita, con confirmación y motivo, sí pasa a manual.

Para verificar concurrencia real con conexiones distintas:

```powershell
# Desde backend; destino fijo y comprobado: db_municipio_escolar_pruebas.
node scripts/probar-programacion-controlada.js --confirmar-base-pruebas
```

Ese script crea un esquema efímero y un reloj controlado dentro de él, verifica cinco PID de conexión diferentes, admite sus cinco votos y rechaza nuevos votos en el cierre exacto. No necesita esperar ni cambiar la hora del servidor; elimina solamente el esquema que acaba de crear. No modifica tablas de `public` ni el horario electoral existente. Se ejecutó satisfactoriamente.

En producción la lógica ya es genérica: `estado_votacion` combina la fecha, inicio y fin guardados, los interpreta en America/Lima y compara el reloj real de PostgreSQL. No requiere cron ni ventanas abiertas. La columna manual se ignora mientras `automatica=true`. No fue necesario modificar SQL ni agregar otra migración.

Se quitaron las horas sugeridas del formulario cuando todavía no hay configuración, y sus etiquetas ya no presentan ejemplos de horas nocturnas. El control administrativo muestra el estado automático devuelto por el servidor y descarta respuestas antiguas que podrían sobrescribir una consulta posterior. Consultar estado actual sigue siendo una lectura de la API sin caché; el refresco periódico solo actualiza la presentación, no abre ni cierra la votación.

Archivos adicionales de esta ampliación:

- `backend/test/programacion-reloj-controlado.test.js`.
- `backend/scripts/probar-programacion-controlada.js`.
- `frontend/src/components/ConfigurarCentroEducativo.jsx`.
- `frontend/src/components/ControlVotacion.jsx`.
- `frontend/test/horario-electoral.test.js`.
- Este documento.

Resultados finales: **99/99 pruebas backend**, **34/34 frontend**, lint y build aprobados; prueba real de cinco conexiones con reloj controlado aprobada. La fecha y horario de la elección existente no se modificaron para obtener estos resultados.
