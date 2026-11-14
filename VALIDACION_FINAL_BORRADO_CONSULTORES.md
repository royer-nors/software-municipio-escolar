# Validación final: Borrar datos y Consultores de resultados

**Resultado: LISTO PARA INTEGRAR**, según las verificaciones automatizadas
realizadas. No se hizo commit, push ni merge.

Rama: `feature/mejorar-borrado-datos`. HEAD y develop local/remoto permanecen
en `6c576e6171cc0483fc9af63764c0858485b6bce4`; no se detectó divergencia remota.
Los cambios pendientes se conservaron. El Caddyfile mantiene su huella Git
`2a98919fdc99abb8fa708bd3277f8e6f4108197a`.

## Aislamiento y migraciones

Se utilizaron esquemas nuevos aleatorios
`prueba_votacion_puesto_<uuid>` dentro de
`db_municipio_escolar_pruebas`, con conexión fijada a esa base y `search_path`
limitado al esquema temporal y `pg_catalog`, excluyendo `public`.
Los datos de prueba fueron ficticios; no se copiaron registros de la base
instalada. No se aplicaron migraciones a ningún esquema público.

Se comprobó:

- Instalación desde cero de 001–013 mediante el ejecutor existente.
- Actualización de un esquema 001–011 con padrón, lista, candidata, voto,
  administrador y computadoras ficticios: 012/013 conservaron todos esos datos.
- Origen histórico `desconocido` y restricción de valores del origen.
- Checksums de las trece migraciones y segunda ejecución sin pendientes.
- Integridad de votos/listas y auditoría/consultores mediante claves foráneas.
- Restricciones de dos espacios de consultor y de usuario único.

Antes y después de las pruebas reales se compararon cantidades y huellas SHA-256
de todas las filas de cada tabla pública, además de sus columnas, mediante
conexiones de solo lectura. La comparación fue idéntica. La limpieza eliminó
únicamente los esquemas recién creados; el principal confirmó su desaparición
mediante `to_regnamespace`.

## Flujos comprobados por HTTP y PostgreSQL

1. Login administrativo y creación de dos consultores por la API administrativa.
   Sus respuestas no incluyen hashes de contraseña.
2. Tercer consultor rechazado por la API y por una restricción PostgreSQL.
   Usuario duplicado rechazado sin alterar la segunda cuenta.
3. Consultores rechazados en resultados administrativos, administración de
   consultores, Borrar datos y cuentas administrativas.
4. Administrador con conteos durante votación abierta; consultores con solo el
   mensaje de espera. El intento de reinicio con elección abierta se bloqueó.
5. Dos puestos vinculados emitieron votos simultáneos; el segundo voto del mismo
   estudiante fue rechazado.
6. Cierre manual y programación futura sin publicación. Tras finalizar el horario
   automático, ambos consultores recibieron resultados completos.
7. Reinicio completo eliminó estudiantes, votos, listas y candidatos ficticios,
   conservando exactamente administradores, consultores y computadoras.
   Se revocaron ambas vinculaciones y se registró actor y cantidades en auditoría.
8. Los tokens de consultores conservaron su identidad tras el reinicio, pero
   volvieron a recibir el mensaje de espera de la nueva elección.
9. Dos importaciones de archivos Excel reales conservaron las cuentas y marcaron
   los nuevos estudiantes con origen `excel`.
10. El flujo administrativo permitió registrar otra lista con candidata y abrir
    una nueva elección. Las credenciales antiguas de puestos siguieron rechazadas.

## Resultados

| Comprobación | Resultado |
| --- | --- |
| Backend completo, bases embebidas aisladas | 174/174 |
| Integración en PostgreSQL instalado, esquemas temporales | 9/9 (incluye contenedor y ocho subpruebas) |
| Frontend | 62/62 |
| Build | Aprobado |
| Lint | Aprobado |
| Git diff --check | Aprobado |

La primera ejecución completa detectó una expectativa de prueba desactualizada
en `backend/test/database.test.js`: faltaban las dos tablas introducidas por
013. Se actualizaron únicamente esos nombres esperados; se conservaron las
comparaciones exactas, idempotencia y verificaciones de checksum. La siguiente
ejecución completa aprobó las 174 pruebas.

Archivos añadidos/modificados durante esta validación:

- `backend/test/integracion-borrado-consultores.test.js`: escenario integral y
  comprobaciones de conservación y limpieza.
- `backend/test-support/entorno-votacion-puesto.js`: preparación opcional de un
  esquema anterior y devolución de las migraciones aplicadas, sin cambiar el
  comportamiento predeterminado.
- `backend/test/database.test.js`: expectativa de las dos tablas nuevas.
- `CONSULTORES_RESULTADOS.md` y este informe: resultados actualizados.

## Reproducción

Desde `backend`:

```powershell
npm.cmd test
$env:VALIDACION_PG_REAL='true'
node --test test/integracion-borrado-consultores.test.js
Remove-Item Env:VALIDACION_PG_REAL
```

La modalidad real requiere PostgreSQL accesible y las credenciales de desarrollo
en el entorno habitual. Ignora `DB_NAME` y fija la base de pruebas; falla antes
de crear el esquema si no puede confirmar su destino.

Desde `frontend`: `npm.cmd test`, `npm.cmd run build`, `npm.cmd run lint`.

## Límites y despliegue

Las migraciones 012/013 siguen pendientes en el esquema instalado: integrarlas
en Git no las aplica. El despliegue y la creación de las dos cuentas reales
requieren una acción posterior autorizada.

No se comprobó una LAN con varias computadoras físicas ni HTTPS con certificados
reales. La publicación para consultores requiere programación automática; un
cierre manual no publica. El bloqueo de borrados en producción y la necesidad
de definir conservación institucional de elecciones reales permanecen vigentes.
