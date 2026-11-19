# Instaladores de escritorio

## Preparar el entorno

Desde la raíz del repositorio, instala una vez las dependencias en este orden:

```powershell
npm --prefix backend ci
npm --prefix frontend ci
npm --prefix instalador ci
```

## Generar instaladores

```powershell
npm --prefix instalador run dist:servidor
npm --prefix instalador run dist:puesto
```

O genera ambos, limpiando `instalador/release/` antes de construir:

```powershell
npm --prefix instalador run dist:todo
```

Los resultados quedan en:

- `instalador/release/servidor/MunicipioEscolar-Servidor-Setup-1.0.0.exe`
- `instalador/release/puesto/MunicipioEscolar-Puesto-Setup-1.0.0.exe`

`dist:servidor` compila el frontend con `VITE_API_URL=/api` y `base=/` sin leer archivos `.env`; además instala las dependencias de producción del backend en `instalador/staging/servidor`. No escribe en `backend/node_modules`. El backend, `frontend/dist`, las migraciones y las dependencias de producción se copian como recursos externos al asar. El script de verificación comprueba los WASM de PGlite, bcryptjs, migraciones, frontend y los archivos principales de cada app.

Los comandos `pack:servidor` y `pack:puesto` preparan app directories (`win-unpacked`) para pruebas y verifican sus recursos. Todo queda dentro de `release/servidor/` o `release/puesto/`.

## Instalación y datos

El instalador del servidor es asistido, permite escoger carpeta y requiere elevación para crear la regla de entrada TCP 3000 del perfil Privado. Al desinstalar, elimina esa regla. La opción de inicio con Windows se muestra durante la instalación de ambos productos. El servidor no elimina su base, `jwt.secret` ni imágenes al actualizar o desinstalar; esos datos permanecen en la carpeta `userData` de Windows.

La app del puesto no requiere regla de firewall. En el primer inicio guarda la URL y el hash de la clave de salida/reconfiguración en su carpeta local de datos.

No hay ícono propio en el repositorio: electron-builder usa su ícono por defecto. Para usar uno propio, coloca un archivo Windows `.ico` en `instalador/build/icon.ico` y vuelve a generar los instaladores.

Los instaladores no están firmados. Windows puede mostrar Microsoft Defender SmartScreen indicando que no reconoce al editor o que la aplicación no es de uso común. Para distribución externa conviene firmarlos con un certificado de firma de código.

## Comprobación empaquetada sin instalador

```powershell
npm --prefix instalador run pack:servidor
npm --prefix instalador run pack:puesto
```

Los scripts limpian la salida del producto correspondiente y verifican el contenido de `win-unpacked`. No ejecutan ni instalan esas apps.
