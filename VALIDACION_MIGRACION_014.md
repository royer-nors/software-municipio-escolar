# Validación final de importación por grados y migración 014

**Resultado: validación satisfactoria; base real lista para actualizar con
004–014 bajo autorización separada.** No se actualizó ninguna base instalada.

## Comprobaciones previas a integrar

- Backend: **178/178** pruebas.
- Frontend: **63/63** pruebas.
- Build y lint: aprobados.
- Tests exclusivamente con datos ficticios y PostgreSQL embebido en memoria,
  con las cuatro modalidades de PostgreSQL instalado deshabilitadas.
- No se modificaron migraciones 001–013, credenciales, `.env` ni Caddyfile.

## Ensayo sobre respaldo real

Se utilizó el respaldo CUSTOM de PostgreSQL 18.6 previamente verificado,
de 18 764 bytes y SHA-256
`c5f400f1ed2c4d33931c3c3ada69ec2bd7c9765dec18b02ac83ee1b3e5052fcf`.
Se restauró con `pg_restore --single-transaction --exit-on-error`, sin `--clean`,
en una base nueva aleatoria de ensayo, nunca sobre una base existente.

La copia restaurada con 001–003 coincidió con los registros originales. Se
ejecutaron dos fases:

1. **004–013**, mediante una copia sin modificaciones del ejecutor del proyecto
   y del conjunto 001–013 en un directorio temporal de SQL.
2. **014**, mediante el ejecutor actual del proyecto: verificó los checksums
   anteriores y aplicó únicamente `014_importacion_padron_grados.sql`.

Se confirmó el registro ordenado de **001–014**, y una segunda ejecución no
aplicó ninguna migración. No se editaron archivos SQL para realizar el ensayo.

| Registros | Original / restaurado / actualizado |
| --- | ---: |
| Administradores | 2 / 2 / 2 |
| Estudiantes | 3 / 3 / 3 |
| Listas | 1 / 1 / 1 |
| Candidatos | 0 / 0 / 0 |
| Votos | 1 / 1 / 1 |

La comparación comprendió todas las columnas históricas y sus valores, no solo
cantidades: IDs, estados, nombres, DNI y hashes de contraseña se conservaron.
No se exponen esos datos en este informe.

El esquema actualizado contiene 16 tablas, incluidas `vistas_previas_padron` y
`auditoria_importaciones_padron`, inicialmente vacías. Las restricciones
instaladas están validadas. Se comprobaron rechazos de valores inválidos mediante
savepoints posteriormente revertidos, sin borrar registros electorales ni
crear cuentas de acceso.

La API efímera, con conexión de solo lectura a la copia, respondió HTTP 200 en
estado, identificación del destino PostgreSQL, identidad administrativa,
resultados, configuración electoral y administración de consultores. El conteo
electoral siguió mostrando un voto. No se invocó el módulo Borrar datos ni se
realizaron importaciones sobre los datos históricos restaurados.

## Preservación y limpieza

Las consultas a `db_municipio_escolar` y `db_municipio_escolar_pruebas` fueron de
solo lectura. Sus tablas, columnas, restricciones, funciones y secuencias se
compararon antes/después mediante huellas, sin diferencias. El respaldo conservó
su hash y no se cambió la conexión del backend.

La base de ensayo se eliminó únicamente tras confirmar conservación y respaldo
intacto, comprobando nombre y OID, sin DROP FORCE ni conexiones ajenas. También
se retiraron las copias temporales del SQL y el script efímero del ensayo.
El respaldo original y los archivos locales previos permanecen conservados.

## Uso posterior

La publicación del código no aplica las migraciones ni cambia `DB_NAME`.
Para usar definitivamente la base real falta una operación autorizada de
mantenimiento: respaldo reciente, confirmación del destino, ejecución del
migrador para 004–014, comprobación de integridad y reanudación controlada.

El voto histórico sigue existiendo y debe conservarse. Por ello, el bloqueo de
importación ante votos o marcas continuará activo después de actualizar; no se
debe borrar el voto para eludirlo. Crear una instalación institucional vacía es
una decisión separada de actualizar esta base conservando su historia.
