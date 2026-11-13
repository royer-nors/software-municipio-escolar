# Etapa 1: voto en blanco y seguridad

Se comprobó la rama `develop` y el árbol estaba limpio antes de editar. Esta etapa conecta dos ventanas existentes; no agrega endpoints ni migraciones y no modifica Resultados, la programación automática, Electron, Excel ni Borrar datos.

## Funcionalidades previas y correcciones

Ya existían `GET/PATCH /api/votacion/configuracion`, JWT administrativo, persistencia de configuración, validación SQL del voto en blanco y `PATCH /api/auth/password` con bcrypt e invalidación por `version_token`.

`ConfigurarVotoBlanco` y `ConfigurarSeguridad` solo validaban localmente y mostraban mensajes pendientes. Ahora:

- Voto en blanco consulta el valor persistido al abrir, permite volver a consultar y guarda únicamente `votoBlancoHabilitado` y la revisión. Conserva el horario y el modo automático.
- El servidor bloquea cambios de voto en blanco durante una votación abierta, dentro de la transacción que bloquea la configuración. Primero debe cerrarse la votación para cambiar esta opción. Las operaciones requieren JWT administrativo y se auditan como las demás actualizaciones de configuración.
- Seguridad verifica confirmación y longitud (8 caracteres como mínimo y 72 bytes UTF-8 como máximo), llama al endpoint real y no reintenta escrituras si se pierde la respuesta.
- El backend también rechaza usar la misma contraseña actual como nueva. Continúa verificando la contraseña actual y guardando bcrypt; no devuelve hashes ni contraseñas.
- Los tres campos tienen botones independientes Mostrar/Ocultar, con `type=button`, nombres accesibles y estado `aria-pressed`.
- Al confirmar el cambio, se vacían los campos, se retira el token anterior y App muestra el login con un aviso. La contraseña anterior y los JWT anteriores dejan de funcionar. Un error de contraseña actual no anuncia éxito ni cierra automáticamente una sesión válida.
- Guardar se bloquea durante la solicitud y se impide el doble envío. Cancelar no escribe en el servidor.

## Archivos

Modificados:

- `frontend/src/components/ConfigurarVotoBlanco.jsx`
- `frontend/src/components/ConfigurarSeguridad.jsx`
- `frontend/src/App.jsx`
- `backend/repositories/votacion-configuracion.repository.js` (solo protección de voto en blanco abierto)
- `backend/services/administradores.service.js` (contraseña nueva diferente)
- `frontend/test/control-votacion.test.js`
- `backend/test/programacion-electoral.test.js`
- `backend/test/votos.test.js` (cerrar antes de cambiar la opción)

Nuevos:

- `frontend/src/api/seguridad.js`
- `frontend/test/seguridad.test.js`
- `frontend/scripts/revisar-etapa1.mjs`
- `backend/scripts/probar-etapa1.js`
- Este documento.

## Pruebas realizadas

- Backend: **100/100** pruebas aisladas con PGlite.
- Frontend: **38/38** pruebas de transporte y validación.
- `npm.cmd run lint` y `npm.cmd run build`: aprobados.
- `node scripts/revisar-etapa1.mjs`, desde frontend: Chrome con todas las API interceptadas. Verifica carga y recuperación, bloqueo abierto, cancelar, tres controles Mostrar/Ocultar, confirmación incorrecta, contraseña actual incorrecta, doble envío y retorno al login con token eliminado. No conecta a un backend real.
- `node scripts/probar-etapa1.js --confirmar-base-pruebas`, desde backend: Express y PostgreSQL real, en un esquema efímero de `db_municipio_escolar_pruebas`. Comprueba permisos, persistencia al recrear servidor y conexiones, blanco deshabilitado/habilitado, rechazo de modificación durante apertura, contraseña incorrecta, hash bcrypt, rechazo de contraseña anterior, JWT anterior invalidado y conservación de votos del escenario. Elimina solo el esquema recién creado. No modifica tablas, cuentas ni votos de `public`.

No se cambiaron contraseñas reales ni datos existentes. No se hicieron commits ni push.

## Comprobación manual

Usa únicamente tu backend de pruebas en el puerto 3001. Comprueba `http://localhost:3001/api/database`: debe devolver `db_municipio_escolar_pruebas`. El `.env` puede apuntar a otra base; no lo des por verificado solo por el puerto. Usa `VITE_API_URL=http://localhost:3001/api` al iniciar Vite.

1. Entra con una cuenta administrativa **de pruebas** y abre Configurar voto en blanco.
2. Con la votación cerrada, cambia la opción y guarda. Cierra y abre la ventana: debe conservar el valor. Consultar configuración debe recuperar lo persistido, descartando cambios locales sin guardar.
3. Comprueba que Cancelar no cambie el valor. Durante una votación abierta la ventana no permite editar la opción y el backend también lo rechaza.
4. En Seguridad prueba Mostrar/Ocultar en cada campo: solo debe afectar al campo elegido. Prueba confirmaciones distintas y una contraseña actual incorrecta; no debe mostrarse éxito.
5. Si decides cambiar la contraseña de una cuenta de pruebas, introduce las tres contraseñas válidas y guarda. La aplicación debe volver al login. Entra con la nueva contraseña; la anterior debe rechazarse. Esto cambia realmente esa cuenta, por lo que no uses una cuenta de producción.
6. Reinicia el backend de pruebas y comprueba la misma configuración y el acceso con la nueva contraseña.

La prueba automatizada de PostgreSQL crea sus propias cuentas en un esquema aislado; es la opción para verificar todo sin cambiar siquiera las cuentas actuales de la base de pruebas.
