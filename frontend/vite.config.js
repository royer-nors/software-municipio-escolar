import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Los builds alojados por Express sirven también rutas profundas como /puesto/.
  // El build Electron local mantiene rutas relativas para loadFile().
  base: process.env.VITE_API_URL === '/api' ? '/' : './',
  plugins: [react()],
})
