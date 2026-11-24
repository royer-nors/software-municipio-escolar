# Puesto de votación

## Configuración

En cada inicio normal aparece **Conectar al Servidor**. Pega la dirección LAN que muestra el Servidor. La dirección guardada aparece precargada. Pulsa **Conectar al Servidor** para comprobar `GET /api/estado`. Tras una respuesta válida, pulsa **Continuar** para guardar la dirección y abrir `/puesto` en el origen verificado.

`Ctrl+Shift+F12` abre el formulario cuando es seguro cambiar la dirección. Si el Puesto conserva una clave de salida de una instalación anterior, `Ctrl+Shift+F10` permite usarla exclusivamente para el cierre de emergencia.

Después de continuar, si se pierde la conexión, la app reintenta automáticamente y ofrece **Reintentar ahora**. Con una sesión activa, pendiente o incierta, la dirección queda bloqueada. Si se reinicia con una sesión pendiente, el Puesto intenta recuperarla con la dirección guardada.

## Vincular cada puesto

1. Registra cada una de las cinco computadoras desde Administración → Computadoras de votación y asigna a cada puesto su propio registro.
2. En la fila de una computadora que figure **Sin vincular**, pulsa **Generar autorización**. Mantén abierto el diálogo y copia el código temporal.
3. En la computadora correspondiente, abre la app Puesto. En la pantalla **Vincular puesto**, pega el código completo y pulsa **Vincular este navegador**. Al aceptar, aparece la pantalla de ingreso del DNI.
4. Repite el proceso con la siguiente computadora y su código. Cada autorización sirve una sola vez y vence a los 10 minutos.

No pulses **Revocar** mientras el estado sea **Pendiente**: revoca la autorización y anula el código. Si ya se revocó o venció, genera uno nuevo. Si se necesita trasladar una computadora ya **Vinculada** a otro navegador, primero revoca la vinculación anterior y luego genera una autorización nueva; el navegador anterior pierde acceso de inmediato.

La app bloquea los atajos habituales de cierre mientras hay una sesión de votación protegida.
