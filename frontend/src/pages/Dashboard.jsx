import { useState, useEffect } from "react" // hooks React : état local et effets
import { Link } from "react-router-dom" // liens vers les autres pages
// Icônes de la bibliothèque lucide-react
import {
  LayoutDashboard, LandPlot, ArrowLeftRight, BrainCircuit, ShieldAlert, Users, ChevronRight, Clock, RefreshCw,
} from "lucide-react"
import Layout from "../components/Layout" // mise en page commune (barre latérale)
import { Alert, Button, StatCard } from "../components/ui" // composants d'interface
import api from "../api" // client HTTP vers le backend

// Libellé et couleur du résultat d'un réentraînement
const RESULTATS = {
  adopte: { texte: "nouveau modèle adopté", cls: "text-emerald-700" },
  rejete: { texte: "ancien modèle conservé (pas meilleur)", cls: "text-amber-700" },
  ignore: { texte: "aucune nouvelle donnée", cls: "text-slate-500" },
  erreur: { texte: "erreur", cls: "text-red-700" },
}

// Apprentissage continu : les modèles réapprennent avec les ventes validées et les dossiers tranchés
function ApprentissageContinu() {
  const [etat, setEtat] = useState(null)
  const [message, setMessage] = useState("")
  const [version, setVersion] = useState(0)

  useEffect(() => {
    api.get("/ia/apprentissage/").then((r) => setEtat(r.data)).catch(() => {})
  }, [version])

  // Pendant un réentraînement, l'état est relu toutes les 5 secondes
  useEffect(() => {
    if (!etat?.en_cours) return
    const minuteur = setInterval(() => setVersion((v) => v + 1), 5000)
    return () => clearInterval(minuteur)
  }, [etat?.en_cours])

  const lancer = async () => {
    setMessage("")
    try {
      const r = await api.post("/ia/apprentissage/")
      setMessage(r.data.message)
    } catch (err) {
      setMessage(err.response?.data?.message || "Impossible de lancer le réentraînement.")
    }
    setVersion((v) => v + 1)
  }

  if (!etat) return null
  const nouvelles = (etat.nouvelles_donnees?.ventes || 0) + (etat.nouvelles_donnees?.dossiers || 0)
  const d = etat.dernier
  const ligne = (titre, res, detail) => {
    const r = RESULTATS[res?.statut] || RESULTATS.ignore
    return (
      <li className="flex flex-wrap justify-between gap-x-3 text-sm">
        <span className="text-slate-600">{titre}</span>
        <span className={`font-medium ${r.cls}`}>{r.texte}{res?.statut === "adopte" && detail ? ` — ${detail}` : ""}</span>
      </li>
    )
  }
  return (
    <section className="mb-6 rounded-2xl border border-violet-200 bg-white/95 p-5 shadow-sm" aria-label="Apprentissage continu de l'IA">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-50 p-2.5 text-violet-700"><RefreshCw className={`size-5 ${etat.en_cours ? "animate-spin" : ""}`} aria-hidden /></div>
          <div>
            <h2 className="font-semibold text-slate-800">Apprentissage continu de l'IA</h2>
            <p className="text-sm text-slate-500">
              {etat.en_cours
                ? "Réentraînement en cours…"
                : `${nouvelles} nouvelle(s) donnée(s) réelle(s) sur ${etat.seuil} avant le prochain réentraînement automatique.`}
            </p>
            <p className="text-xs text-slate-400">
              {etat.donnees_reelles.ventes} vente(s) validée(s) · {etat.donnees_reelles.dossiers} dossier(s) tranché(s)
            </p>
          </div>
        </div>
        <Button taille="sm" variante="secondaire" icon={RefreshCw} disabled={etat.en_cours} onClick={lancer}>Réentraîner maintenant</Button>
      </div>
      {d && (
        <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3">
          <li className="text-xs text-slate-400">Dernier réentraînement : {new Date(d.date).toLocaleString("fr-FR")} ({d.declencheur}, {d.duree_s} s)</li>
          {ligne("Modèles de prix et de fraude", d.prix,
            d.prix?.comparaison && `R² ${d.prix.comparaison.random_forest.r2_avec_donnees_reelles.toLocaleString("fr-FR")}`
            + (d.prix.zones_ajoutees?.length ? ` · nouveau(x) lotissement(s) : ${d.prix.zones_ajoutees.join(", ")}` : ""))}
          {ligne("Réseau d'authentification", d.authentification,
            d.authentification?.f1_avec_donnees_reelles != null && `F1 ${d.authentification.f1_avec_donnees_reelles.toLocaleString("fr-FR")}`)}
        </ul>
      )}
      {message && <p className="mt-2 text-xs text-slate-600" role="status">{message}</p>}
    </section>
  )
}

// Page "Tableau de bord" (administrateur) : chiffres clés et accès rapides
export default function Dashboard() {
  const [chiffres, setChiffres] = useState(null) // statistiques reçues du backend (null = pas encore chargées)
  const [erreur, setErreur] = useState("") // message d'erreur éventuel

  // Au chargement de la page : récupère les statistiques
  useEffect(() => {
    api
      .get("/statistiques/")
      .then((res) => setChiffres(res.data))
      .catch(() => setErreur("Impossible de charger les statistiques."))
  }, [])

  const valeur = (v) => (chiffres ? v : "—") // affiche "—" tant que les chiffres ne sont pas chargés
  const parStatut = chiffres?.transactions_par_statut || {} // ex. {"en_cours": 2, "acceptée": 1}
  const pretes = parStatut["acceptée"] || 0 // acceptées par le vendeur, à valider
  const enAttente = (parStatut.en_cours || 0) + pretes // transactions encore en cours

  // Cartes d'accès rapide vers les autres pages
  const raccourcis = [
    { to: "/parcelles", icon: LandPlot, titre: "Gérer les parcelles", texte: "Consulter et enregistrer des parcelles" },
    { to: "/estimation", icon: BrainCircuit, titre: "Estimation IA", texte: "Prédire le prix d'une parcelle" },
    { to: "/transactions", icon: ArrowLeftRight, titre: "Valider les transactions", texte: "Enregistrer les ventes sur la blockchain" },
    { to: "/utilisateurs", icon: Users, titre: "Gérer les utilisateurs", texte: "Créer les comptes acheteur et vendeur" },
  ]

  return (
    <Layout titre="Tableau de bord">
      {/* En-tête avec message de bienvenue */}
      <div className="mb-6 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-marine-700 p-2.5 text-white shadow-sm">
          <LayoutDashboard className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-marine-900">Tableau de bord</h1>
          <p className="text-sm text-slate-500">
            Bonjour {localStorage.getItem("nom")}, voici l'état du cadastre aujourd'hui.
          </p>
        </div>
      </div>

      {/* Message d'erreur (si les statistiques n'ont pas pu être chargées) */}
      {erreur && <Alert type="erreur" className="mb-4">{erreur}</Alert>}

      {/* Les 4 chiffres clés */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={LandPlot} label="Parcelles" valeur={valeur(chiffres?.parcelles)} ton="marine" />
        <StatCard
          icon={ArrowLeftRight}
          label="Transactions"
          valeur={valeur(chiffres?.transactions)}
          ton="vert"
          detail={chiffres ? `${chiffres.transactions_par_statut?.["terminée"] || 0} validée(s)` : null}
        />
        <StatCard icon={BrainCircuit} label="Estimations IA" valeur={valeur(chiffres?.estimations)} ton="violet" />
        <StatCard icon={ShieldAlert} label="Montants suspects" valeur={valeur(chiffres?.fraudes)} ton="rouge" detail="Isolation Forest" />
      </div>

      {/* Bandeau "transactions en cours" (cliquable, mène à la page Transactions) */}
      {enAttente > 0 && (
        <Link
          to="/transactions"
          className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 transition hover:bg-amber-100"
        >
          <Clock className="size-5 shrink-0" aria-hidden />
          <span className="flex-1 text-sm">
            <b>{enAttente} transaction(s)</b> en cours
            {pretes > 0 && <>, dont <b>{pretes} acceptée(s) par le vendeur</b> et prête(s) à être validée(s)</>}.
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold">
            Traiter <ChevronRight className="size-4" aria-hidden />
          </span>
        </Link>
      )}

      <ApprentissageContinu />

      {/* Accès rapides */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Accès rapide</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {raccourcis.map(({ to, icon: Icon, titre, texte }) => (
          <Link
            key={to}
            to={to}
            className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-sm backdrop-blur-sm transition hover:border-marine-500 hover:shadow-md"
          >
            <div className="rounded-xl bg-marine-50 p-3 text-marine-700 transition group-hover:bg-marine-700 group-hover:text-white">
              <Icon className="size-6" aria-hidden />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-800">{titre}</h3>
              <p className="text-sm text-slate-500">{texte}</p>
            </div>
            <ChevronRight className="size-5 text-slate-300 transition group-hover:text-marine-600" aria-hidden />
          </Link>
        ))}
      </div>
    </Layout>
  )
}
