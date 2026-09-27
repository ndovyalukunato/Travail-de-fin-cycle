// Point d'entrée de l'application React
import { StrictMode } from 'react' // mode strict : signale les erreurs courantes pendant le développement
import { createRoot } from 'react-dom/client' // affiche l'application React dans la page HTML
import './index.css' // styles globaux (Tailwind + couleurs du projet)
import App from './App.jsx' // composant principal (routes de l'application)

// Monte l'application dans la balise <div id="root"> de index.html
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
