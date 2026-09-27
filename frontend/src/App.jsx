// Outils de navigation entre les pages (sans rechargement du navigateur)
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
// Les pages de l'application
import Login from "./pages/Login"
import Dashboard from "./pages/Dashboard"
import Parcelles from "./pages/Parcelles"
import Estimation from "./pages/Estimation"
import Utilisateurs from "./pages/Utilisateurs"
import Transactions from "./pages/Transactions"
import Historique from "./pages/Historique"

// Redirige vers la connexion si pas de token, ou si le rôle n'est pas autorisé
function Protegee({ roles, children }) {
  const token = localStorage.getItem("token") // token enregistré à la connexion
  const role = localStorage.getItem("role") // rôle de l'utilisateur connecté
  if (!token) return <Navigate to="/" replace /> // pas connecté : retour à la page de connexion
  if (roles && !roles.includes(role)) return <Navigate to="/parcelles" replace /> // rôle non autorisé
  return children // accès autorisé : on affiche la page demandée
}

// Composant principal : associe chaque adresse (URL) à une page
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Page de connexion, accessible à tous */}
        <Route path="/" element={<Login />} />
        {/* Tableau de bord : administrateur uniquement */}
        <Route path="/dashboard" element={<Protegee roles={["admin"]}><Dashboard /></Protegee>} />
        {/* Pages accessibles à tout utilisateur connecté */}
        <Route path="/parcelles" element={<Protegee><Parcelles /></Protegee>} />
        <Route path="/estimation" element={<Protegee><Estimation /></Protegee>} />
        {/* Gestion des comptes : administrateur uniquement */}
        <Route path="/utilisateurs" element={<Protegee roles={["admin"]}><Utilisateurs /></Protegee>} />
        <Route path="/transactions" element={<Protegee><Transactions /></Protegee>} />
        <Route path="/historique" element={<Protegee><Historique /></Protegee>} />
        {/* Toute autre adresse renvoie vers la connexion */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
