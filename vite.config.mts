import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import electron from 'vite-plugin-electron/simple'

// Renderer builds to dist/, main + preload build to dist-electron/.
// node:* builtins stay external in the main bundle (Electron provides them,
// including node:sqlite).
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: { external: [/^node:/] }
          }
        }
      },
      preload: {
        input: 'electron/preload.ts',
        vite: {
          build: {
            outDir: 'dist-electron'
          }
        }
      }
    })
  ],
  build: {
    outDir: 'dist'
  }
})
