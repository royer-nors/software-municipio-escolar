# Consulta de resultados por rol

## Reglas implementadas

- **Administrador:** mantiene `/api/resultados` y su pantalla existente,
  incluyendo conteos, gráficos, actualización e impresión durante la votación.
  No se añade ninguna condición de publicación a esa ruta.
- **CONSULTOR_RESULTADOS:** inicia sesión desde el tercer botón **Resultados**
  de la portada. Solo puede consultar el reporte, sin funciones administrativas.
  Antes de publicarse recibe exactamente: «Los resultados estarán disponibles
  cuando finalice la elección». Esa respuesta no contiene conteos ni tendencias.
- **Estudiante votante:** conserva el flujo del puesto vinculado. Su JWT y la
  cookie del puesto no otorgan acceso a resultados ni administración.

La publicación es automática: PostgreSQL debe informar `automatica=true` y
`estado_votacion(c)='Finalizada'`. Se usa la fecha y hora final programadas en
`America/Lima`, con fin inclusivo para publicación. Un cierre manual, una
elección pendiente o una votación abierta no habilitan la consulta.
Una elección únicamente manual, sin programación automática, no publica
resultados para consultores. El administrador sigue pudiendo consultarlos.

El estado y los conteos del consultor se leen en una misma transacción de solo
lectura con aislamiento REPEATABLE READ. Una nueva programación o reapertura no
permite combinar la autorización del proceso anterior con los conteos nuevos.
Se reutilizan el servicio de cálculos y el componente `Resultados`; la ruta
administrativa mantiene su comportamiento y su actualización existente.
La pantalla de consulta revalida cada 15 segundos y al recuperar foco.

## Cuentas y conservación

La nueva migración **013_consultores_resultados.sql** crea dos espacios de
cuenta (IDs 1 y 2), inicialmente deshabilitados y sin contraseña ni usuario.
No crea credenciales predeterminadas ni modifica estudiantes existentes.
El administrador los configura desde **Consultores de resultados** en el panel:
usuario, nueva contraseña y estado habilitado/deshabilitado. Una contraseña
vacía conserva la actual; una cuenta nueva necesita contraseña para habilitarse.

Los usuarios se normalizan a minúsculas y son únicos entre consultores.
PostgreSQL impide un tercer espacio de cuenta. Las contraseñas se guardan con
bcrypt y nunca se devuelven. Cada cambio incrementa la versión de sesión;
una cuenta deshabilitada o un token anterior pierde acceso inmediatamente.
La sesión dura 15 minutos y se conserva solo en memoria del navegador.

Estas identidades son independientes de `estudiantes` y `administradores`.
Ni el reinicio electoral ni el reemplazo del padrón Excel eliminan sus cuentas,
permisos o contraseñas. No requieren pertenecer al padrón de una nueva elección.
El reinicio desactiva la programación automática, por lo que conservan su acceso
de consulta pero vuelven a recibir el mensaje de espera hasta finalizar el
horario de la siguiente elección. Administradores y computadoras se conservan.

## Rutas

| Método | Ruta | Permiso |
| --- | --- | --- |
| GET | `/api/resultados` | Administrador; conteo disponible en tiempo real |
| POST | `/api/consultores/login` | Usuario/contraseña de consultor; límite de intentos |
| GET | `/api/consultores/resultados` | JWT exclusivo de consultor; publicación comprobada en servidor |
| GET | `/api/consultores/administracion` | Administrador |
| PUT | `/api/consultores/administracion/:id` | Administrador; Origin permitido, JSON y `X-Consultor-CSRF: 1` |

El JWT usa rol `CONSULTOR_RESULTADOS` y audiencia distinta de la administrativa
y de votación. Cambiar un rol en React o enviar un identificador no autoriza
ninguna operación. Las respuestas usan `Cache-Control: no-store`.
La gestión registra administrador, consultor, acción y fecha, sin contraseñas.

## Verificación y despliegue pendiente

No se han aplicado las migraciones 012 ni 013 a la base instalada, ni se han
creado cuentas reales. Deben desplegarse mediante el ejecutor existente en una
acción autorizada antes de usar las pantallas nuevas. Las migraciones anteriores
no se modifican. HTTPS sigue siendo necesario para credenciales reales en LAN.

Pruebas sin migraciones ni borrados:

```powershell
cd backend
node --test test/consultores-resultados.test.js test/resultados.routes.test.js
cd ../frontend
npm.cmd test
npm.cmd run build
npm.cmd run lint
```

Los tests de backend indicados usan repositorios simulados y verifican permisos,
contraseñas, revocación por versión, CSRF, respuesta restringida y lectura con
instantánea. No prueban la aplicación de la migración 013 ni borrados reales.
También se comprobó la función electoral instalada mediante SELECT en una
transacción READ ONLY de `db_municipio_escolar_pruebas`, con registros compuestos
de entrada ficticios: pendiente, abierta, antes del fin, fin exacto, cierre y
apertura manual. Ninguna consulta modificó la elección existente.

La validación final autorizada ya comprobó las migraciones 001–013 y la
conservación tras reinicio e importaciones en esquemas temporales de PostgreSQL.
El esquema público no recibió migraciones ni modificaciones. Véase
`VALIDACION_FINAL_BORRADO_CONSULTORES.md` para resultados y reproducción.
