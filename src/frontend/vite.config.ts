import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build:preview` inlines everything into one HTML file (used for shareable previews).
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  build: mode === 'singlefile' ? { outDir: 'dist-preview' } : undefined,
  server: { port: 5173 },
}))
