// Configuration d'ESLint : outil qui vérifie la qualité du code JavaScript (commande : npm run lint)
import js from '@eslint/js' // règles JavaScript recommandées
import globals from 'globals' // variables globales connues (window, document...)
import reactHooks from 'eslint-plugin-react-hooks' // règles d'utilisation des hooks React (useState, useEffect...)
import reactRefresh from 'eslint-plugin-react-refresh' // règles pour le rechargement à chaud de Vite
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']), // ne pas analyser le dossier compilé
  {
    files: ['**/*.{js,jsx}'], // fichiers analysés
    // Ensembles de règles appliqués
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser, // le code s'exécute dans un navigateur
      parserOptions: { ecmaFeatures: { jsx: true } }, // autorise la syntaxe JSX
    },
  },
])
