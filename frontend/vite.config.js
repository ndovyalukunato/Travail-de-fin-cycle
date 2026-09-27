// Configuration de Vite (serveur de développement et outil de compilation du frontend)
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react' // prise en charge de React (JSX, rechargement à chaud)
import tailwindcss from '@tailwindcss/vite' // génération des styles Tailwind CSS

export default defineConfig({
  // Extensions utilisées par Vite
  plugins: [
    react(),
    tailwindcss(),
  ],
})
