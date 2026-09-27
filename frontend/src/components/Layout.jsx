import { useEffect, useState } from "react" // hooks React : effets et état local
import { NavLink, useNavigate } from "react-router-dom" // liens de navigation et redirection
// Icônes de la bibliothèque lucide-react
import {
  LayoutDashboard, LandPlot, BrainCircuit, ArrowLeftRight, History, Users, LogOut, Menu, X,
} from "lucide-react"
import armoiries from "../assets/armoiries.png" // armoiries de la RDC (fond transparent)

// Libellés affichés pour chaque rôle
const ROLES = { admin: "Administrateur", vendeur: "Vendeur", acheteur: "Acheteur" }

// Mise en page commune : barre latérale (écran large) / menu déroulant (mobile)
// et armoiries de la RDC en filigrane derrière le contenu.
export default function Layout({ titre, children }) {
  const navigate = useNavigate() // permet de changer de page par le code
  const [menuOuvert, setMenuOuvert] = useState(false) // menu mobile ouvert ou fermé
  const role = localStorage.getItem("role") // rôle de l'utilisateur connecté
  const nom = localStorage.getItem("nom") || "" // nom de l'utilisateur connecté

  // Met à jour le titre de l'onglet du navigateur quand la page change
  useEffect(() => {
    document.title = titre ? `${titre} — FoncierAI` : "FoncierAI"
  }, [titre])

  // Liens du menu ; "roles" limite certains liens à l'administrateur
  const liens = [
    { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["admin"] },
    { to: "/parcelles", label: role === "vendeur" ? "Mes parcelles" : "Parcelles", icon: LandPlot },
    { to: "/estimation", label: "Estimation IA", icon: BrainCircuit },
    { to: "/transactions", label: "Transactions", icon: ArrowLeftRight },
    { to: "/historique", label: "Historique", icon: History },
    { to: "/utilisateurs", label: "Utilisateurs", icon: Users, roles: ["admin"] },
  ].filter((l) => !l.roles || l.roles.includes(role)) // garde seulement les liens autorisés

  // Déconnexion : efface le token et revient à la page de connexion
  const deconnexion = () => {
    localStorage.clear()
    navigate("/")
  }

  // Initiales affichées dans le rond jaune (ex. "Josue Lukunato" -> "JL")
  const initiales = nom.split(" ").map((m) => m[0]).join("").slice(0, 2).toUpperCase() || "?"

  // Liste des liens (utilisée dans la barre latérale et dans le menu mobile)
  const Navigation = (
    <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Navigation principale">
      {liens.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={() => setMenuOuvert(false)}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? "bg-white/15 text-white shadow-inner"
                : "text-marine-100 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  // Bloc du bas : utilisateur connecté + bouton de déconnexion
  const Profil = (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        {/* Rond avec les initiales */}
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-rdc-jaune text-sm font-bold text-marine-950">
          {initiales}
        </div>
        {/* Nom et rôle */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{nom}</p>
          <p className="text-xs text-marine-100">{ROLES[role] || role}</p>
        </div>
      </div>
      <button
        onClick={deconnexion}
        className="mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-marine-100 transition hover:bg-rdc-rouge hover:text-white"
      >
        <LogOut className="size-5" aria-hidden />
        Déconnexion
      </button>
    </div>
  )

  // Logo : armoiries dans un cercle blanc + nom de l'application
  const Logo = (
    <div className="flex items-center gap-3 px-5 py-5">
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white p-1.5 shadow">
        <img src={armoiries} alt="Armoiries de la RDC" className="size-full object-contain" />
      </div>
      <div>
        <p className="text-lg font-bold leading-tight text-white">FoncierAI</p>
        <p className="text-xs text-marine-100">Cadastre de Goma</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen">
      {/* Barre latérale — écran large */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-marine-900 lg:flex">
        {/* Fine bande aux couleurs du drapeau */}
        <div className="bande-rdc h-1.5" />
        {Logo}
        {Navigation}
        {Profil}
      </aside>

      {/* Barre supérieure — mobile */}
      <header className="sticky top-0 z-30 flex items-center justify-between bg-marine-900 px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-white p-1">
            <img src={armoiries} alt="" className="size-full object-contain" />
          </div>
          <span className="font-bold text-white">FoncierAI</span>
        </div>
        {/* Bouton "hamburger" qui ouvre le menu */}
        <button
          onClick={() => setMenuOuvert(true)}
          className="rounded-lg p-2 text-white hover:bg-white/10"
          aria-label="Ouvrir le menu"
        >
          <Menu className="size-6" />
        </button>
      </header>

      {/* Menu mobile */}
      {menuOuvert && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          {/* Fond sombre : un clic dessus ferme le menu */}
          <div className="absolute inset-0 bg-marine-950/60" onClick={() => setMenuOuvert(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-marine-900">
            <div className="bande-rdc h-1.5" />
            <div className="flex items-center justify-between pr-3">
              {Logo}
              {/* Bouton de fermeture du menu */}
              <button
                onClick={() => setMenuOuvert(false)}
                className="rounded-lg p-2 text-white hover:bg-white/10"
                aria-label="Fermer le menu"
              >
                <X className="size-5" />
              </button>
            </div>
            {Navigation}
            {Profil}
          </aside>
        </div>
      )}

      {/* Armoiries en filigrane */}
      <div aria-hidden className="pointer-events-none fixed inset-0 flex items-center justify-center lg:left-64">
        <img src={armoiries} alt="" className="w-[min(34rem,85vw)] select-none opacity-[0.07]" />
      </div>

      {/* Contenu de la page (décalé à droite de la barre latérale sur grand écran) */}
      <main className="relative lg:pl-64">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-8">{children}</div>
      </main>
    </div>
  )
}
