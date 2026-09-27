import { useEffect, useState } from "react" // hooks React : état local et effets
import { useNavigate } from "react-router-dom" // redirection vers une autre page
import { motion } from "framer-motion" // animations
import { Mail, Lock, Eye, EyeOff, LogIn, BrainCircuit, ShieldCheck, Blocks } from "lucide-react" // icônes
import api from "../api" // client HTTP vers le backend
import armoiries from "../assets/armoiries.png" // armoiries de la RDC
import { Alert, Button, Field } from "../components/ui" // composants d'interface

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
  ]

  return (
    // Deux colonnes sur grand écran : panneau institutionnel à gauche, formulaire à droite
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Panneau institutionnel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-marine-900 p-10 text-white lg:flex">
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
          <p className="text-sm font-semibold uppercase tracking-widest text-rdc-jaune">République Démocratique du Congo</p>
          <p className="mt-1 text-marine-100">Province du Nord-Kivu — Ville de Goma</p>
        </div>

        <div className="relative">
          {/* Armoiries dans un cercle blanc */}
          <div className="mb-6 flex size-28 items-center justify-center overflow-hidden rounded-full bg-white p-4 shadow-xl">
            <img src={armoiries} alt="Armoiries de la RDC" className="size-full object-contain" />
          </div>
          <h1 className="text-4xl font-bold">FoncierAI</h1>
          <p className="mt-2 max-w-md text-lg text-marine-100">
            Plateforme intelligente de gestion et de sécurisation des transactions foncières.
          </p>
          {/* Liste des points forts */}
          <ul className="mt-8 space-y-3">
            {atouts.map(({ icon: Icon, texte }) => (
              <li key={texte} className="flex items-center gap-3 text-marine-100">
                <span className="rounded-lg bg-white/10 p-2"><Icon className="size-5 text-rdc-jaune" aria-hidden /></span>
                {texte}
              </li>
            ))}
          </ul>
        </div>

        {/* Devise de la RDC */}
        <p className="text-xs text-marine-100/70">Justice — Paix — Travail</p>
      </div>

      {/* Formulaire */}
      <div className="relative flex items-center justify-center overflow-hidden bg-slate-50 px-4 py-10">
        {/* Armoiries en filigrane (mobile uniquement) */}
        <img
          src={armoiries}
          alt=""
          aria-hidden
          className="pointer-events-none absolute w-[min(30rem,90vw)] opacity-[0.06] lg:hidden"
        />
        {/* Apparition en fondu du bloc de connexion */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative w-full max-w-md"
        >
          {/* Logo et titre (mobile uniquement, le panneau de gauche étant masqué) */}
          <div className="mb-8 text-center lg:hidden">
            <img src={armoiries} alt="Armoiries de la RDC" className="mx-auto mb-3 size-20 object-contain" />
            <h1 className="text-2xl font-bold text-marine-900">FoncierAI</h1>
            <p className="text-sm text-slate-500">Cadastre de Goma — RDC</p>
          </div>

          {/* Carte de connexion */}
          <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
            <h2 className="text-xl font-bold text-slate-900">Connexion</h2>
            <p className="mb-6 mt-1 text-sm text-slate-500">Accédez à votre espace avec vos identifiants.</p>

            {/* Message d'erreur éventuel */}
            {erreur && <Alert type="erreur" className="mb-4">{erreur}</Alert>}

            <form onSubmit={handleLogin} className="space-y-4" noValidate={false}>
              {/* Champ email avec icône d'enveloppe */}
              <Field label="Adresse email" htmlFor="email" requis>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="votre@email.com"
                    className="champ pl-9"
                    required
                  />
                </div>
              </Field>

              {/* Champ mot de passe avec bouton "œil" pour l'afficher ou le masquer */}
              <Field label="Mot de passe" htmlFor="mdp" requis>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <input
                    id="mdp"
                    type={voirMotDePasse ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="champ pl-9 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setVoirMotDePasse(!voirMotDePasse)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                    aria-label={voirMotDePasse ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                  >
                    {voirMotDePasse ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              {/* Bouton de connexion (animation pendant l'envoi) */}
              <Button type="submit" icon={LogIn} chargement={loading} className="w-full">
                {loading ? "Connexion..." : "Se connecter"}
              </Button>
            </form>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">
            Pas de compte ? Adressez-vous à l'administrateur du cadastre.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
