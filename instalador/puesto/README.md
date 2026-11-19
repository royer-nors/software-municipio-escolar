# Puesto de votación

## Configuración

En el primer inicio, escribe la dirección LAN que aparece en la aplicación del servidor y define y confirma una **Clave para salir o reconfigurar** de al menos cuatro caracteres. La app comprueba `GET /api/estado` y guarda la URL y el hash scrypt de la clave en su carpeta de datos de usuario. Luego abre `/puesto` directamente en el origen del servidor.

La clave nunca se guarda en texto plano. `Ctrl+Shift+F10` solicita esa clave para cerrar la app y `Ctrl+Shift+F12` la solicita para cambiar la dirección del servidor. Tras cinco intentos fallidos, la entrada se bloquea 30 segundos.

Si cambia la dirección del servidor, usa `Ctrl+Shift+F12` para volver a la pantalla de configuración. Si el servidor está apagado o no se puede alcanzar, la app muestra **Sin conexión con el servidor** y reintenta automáticamente; también puedes pulsar **Reintentar ahora**.

## Vincular cada puesto

1. Registra cada una de las cinco computadoras desde Administración → Computadoras de votación y asigna a cada puesto su propio registro.
2. En la fila de una computadora que figure **Sin vincular**, pulsa **Generar autorización**. Mantén abierto el diálogo y copia el código temporal.
3. En la computadora correspondiente, abre la app Puesto. En la pantalla **Vincular puesto**, pega el código completo y pulsa **Vincular este navegador**. Al aceptar, aparece la pantalla de ingreso del DNI.
4. Repite el proceso con la siguiente computadora y su código. Cada autorización sirve una sola vez y vence a los 10 minutos.

No pulses **Revocar** mientras el estado sea **Pendiente**: revoca la autorización y anula el código. Si ya se revocó o venció, genera uno nuevo. Si se necesita trasladar una computadora ya **Vinculada** a otro navegador, primero revoca la vinculación anterior y luego genera una autorización nueva; el navegador anterior pierde acceso de inmediato.

La app bloquea los atajos habituales de cierre mientras muestra la votación. Si la app deja de responder y no se puede cerrar con `Ctrl+Shift+F10` y la clave, el Administrador de tareas de Windows queda como último recurso para finalizar **Municipio Escolar Puesto**.
