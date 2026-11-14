import { useEffect, useState } from "react" // hooks React : état local et effets
import { useNavigate } from "react-router-dom" // redirection vers une autre page
import { motion } from "framer-motion" // animations
import { Mail, Lock, Eye, EyeOff, LogIn, BrainCircuit, ShieldCheck, Blocks, FileCheck2 } from "lucide-react" // icônes
import api from "../api" // client HTTP vers le backend
import armoiries from "../assets/armoiries.png" // armoiries de la RDC
import { Alert, Button } from "../components/ui" // composants d'interface

// Page de connexion (première page de l'application)
export default function Login() {
  const [email, setEmail] = useState("") // email saisi
  const [password, setPassword] = useState("") // mot de passe saisi
  const [voirMotDePasse, setVoirMotDePasse] = useState(false) // afficher le mot de passe en clair ?
  const [erreur, setErreur] = useState("") // message d'erreur
  const [loading, setLoading] = useState(false) // connexion en cours
  const navigate = useNavigate() // permet de changer de page par le code

  // Titre de l'onglet du navigateur
  useEffect(() => {
    document.title = "Connexion — FoncierAI"
  }, [])

  // Envoi du formulaire de connexion
  const handleLogin = async (e) => {
    e.preventDefault() // empêche le rechargement de la page
    setLoading(true)
    setErreur("")
    try {
      // Envoie l'email et le mot de passe au backend
      const response = await api.post("/connexion/", {
        email: email,
        mot_de_passe: password
      })
      // Sauvegarder le token et le rôle
      localStorage.setItem("token", response.data.token)
      localStorage.setItem("role", response.data.role)
      localStorage.setItem("nom", response.data.nom)

      // Rediriger selon le rôle
      navigate(response.data.role === "admin" ? "/dashboard" : "/parcelles")
    } catch (error) {
      // Réponse reçue = identifiants refusés ; aucune réponse = serveur Django éteint
      setErreur(
        error.response
          ? error.response.data?.erreur || "Email ou mot de passe incorrect"
          : "Serveur injoignable : vérifiez que le backend Django est lancé."
      )
    }
    setLoading(false)
  }

  // Points forts de l'application, affichés dans le panneau de gauche
  const atouts = [
    { icon: BrainCircuit, texte: "Estimation du prix des parcelles par intelligence artificielle" },
    { icon: ShieldCheck, texte: "Détection automatique des prix anormaux" },
    { icon: Blocks, texte: "Transactions enregistrées sur la blockchain" },
    { icon: FileCheck2, texte: "Authentification des titres fonciers par réseau de neurones" },
  ]

  return (
    // Deux colonnes sur grand écran : panneau institutionnel à gauche, connexion à droite (pleine hauteur)
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panneau institutionnel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-marine-900 p-12 text-white lg:flex">
        {/* Bande tricolore en haut */}
        <div className="bande-rdc absolute inset-x-0 top-0 h-1.5" />
        {/* Silhouette des armoiries en fond (décorative) */}
        <img
          src={armoiries}
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 w-[32rem] opacity-10 brightness-0 invert"
        />
        <div>
          <p className="text-base font-semibold uppercase tracking-widest text-rdc-jaune">République Démocratique du Congo</p>
          <p className="mt-1 text-lg text-marine-100">Province du Nord-Kivu — Ville de Goma</p>
        </div>

        <div className="relative">
          {/* Armoiries dans un cercle blanc */}
          <div className="mb-6 flex size-32 items-center justify-center overflow-hidden rounded-full bg-white p-4 shadow-xl">
            <img src={armoiries} alt="Armoiries de la RDC" className="size-full object-contain" />
          </div>
          <h1 className="text-5xl font-bold xl:text-6xl">FoncierAI</h1>
          <p className="mt-3 max-w-xl text-xl text-marine-100 xl:text-2xl">
            Plateforme intelligente de gestion et de sécurisation des transactions foncières.
          </p>
          {/* Liste des points forts (police agrandie) */}
          <ul className="mt-10 space-y-5">
            {atouts.map(({ icon: Icon, texte }) => (
              <li key={texte} className="flex items-center gap-4 text-lg font-medium text-white xl:text-xl">
                <span className="shrink-0 rounded-xl bg-white/10 p-3"><Icon className="size-7 text-rdc-jaune" aria-hidden /></span>
                {texte}
              </li>
            ))}
          </ul>
        </div>

        {/* Devise de la RDC */}
        <p className="text-sm text-marine-100/70">Justice — Paix — Travail</p>
      </div>

      {/* Connexion : occupe toute la colonne de droite */}
      <div className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-white px-6 py-12 sm:px-12 xl:px-20">
        {/* Bande tricolore en haut (mobile, le panneau de gauche étant masqué) */}
        <div className="bande-rdc absolute inset-x-0 top-0 h-1.5 lg:hidden" />
        {/* Armoiries en filigrane */}
        <img
          src={armoiries}
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 w-[min(34rem,90vw)] -translate-x-1/2 -translate-y-1/2 opacity-[0.04]"
        />
        {/* Apparition en fondu du bloc de connexion */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative mx-auto w-full max-w-xl"
        >
          {/* Logo et titre (mobile uniquement) */}
          <div className="mb-10 text-center lg:hidden">
            <img src={armoiries} alt="Armoiries de la RDC" className="mx-auto mb-3 size-24 object-contain" />
            <h1 className="text-3xl font-bold text-marine-900">FoncierAI</h1>
            <p className="text-base text-slate-500">Cadastre de Goma — RDC</p>
          </div>

          <h2 className="text-4xl font-bold text-slate-900">Connexion</h2>
          <p className="mb-10 mt-2 text-lg text-slate-500">Accédez à votre espace avec vos identifiants.</p>

          {/* Message d'erreur éventuel */}
          {erreur && <Alert type="erreur" className="mb-6">{erreur}</Alert>}

          <form onSubmit={handleLogin} className="space-y-6">
            {/* Champ email avec icône d'enveloppe */}
            <div>
              <label htmlFor="email" className="mb-2 block text-base font-semibold text-slate-700">
                Adresse email<span className="ml-0.5 text-rdc-rouge" aria-hidden>*</span>
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="votre@email.com"
                  className="champ rounded-xl py-4 pl-12 text-lg"
                  required
                />
              </div>
            </div>

            {/* Champ mot de passe avec bouton "œil" pour l'afficher ou le masquer */}
            <div>
              <label htmlFor="mdp" className="mb-2 block text-base font-semibold text-slate-700">
                Mot de passe<span className="ml-0.5 text-rdc-rouge" aria-hidden>*</span>
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="mdp"
                  type={voirMotDePasse ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="champ rounded-xl py-4 pl-12 pr-12 text-lg"
                  required
                />
                <button
                  type="button"
                  onClick={() => setVoirMotDePasse(!voirMotDePasse)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:text-slate-600"
                  aria-label={voirMotDePasse ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {voirMotDePasse ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
            </div>

            {/* Bouton de connexion (animation pendant l'envoi) */}
            <Button type="submit" icon={LogIn} chargement={loading} className="w-full rounded-xl py-4! text-lg!">
              {loading ? "Connexion..." : "Se connecter"}
            </Button>
          </form>

          <p className="mt-10 text-center text-base text-slate-500">
            Pas de compte ? Adressez-vous à l'administrateur du cadastre.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
