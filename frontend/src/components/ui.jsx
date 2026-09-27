import { useState } from "react" // état local (utilisé par ConfirmAction)
// Icônes de la bibliothèque lucide-react
import {
  CircleCheck, CircleAlert, TriangleAlert, Info, X, Clock, CircleX, LoaderCircle, Inbox, Handshake,
} from "lucide-react"

// ----------------------------------------------------------------
// Composants d'interface réutilisables (même apparence partout)
// ----------------------------------------------------------------

// En-tête de page : icône + titre + description, et boutons d'action à droite
export function PageHeader({ icon: Icon, titre, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        {/* Icône dans un carré bleu (si fournie) */}
        {Icon && (
          <div className="mt-0.5 rounded-xl bg-marine-700 p-2.5 text-white shadow-sm">
            <Icon className="size-6" aria-hidden />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-marine-900">{titre}</h1>
          {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
        </div>
      </div>
      {/* Boutons d'action (ex. "Nouvelle parcelle") */}
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

// Carte blanche : conteneur des formulaires et des listes, avec un titre facultatif
export function Card({ titre, icon: Icon, actions, children, className = "", padding = true }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm ${className}`}>
      {/* En-tête de la carte (affiché seulement si un titre est donné) */}
      {titre && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800">
            {Icon && <Icon className="size-5 text-marine-600" aria-hidden />}
            {titre}
          </h2>
          {actions}
        </header>
      )}
      {/* Contenu de la carte, avec ou sans marge intérieure */}
      <div className={padding ? "p-5" : ""}>{children}</div>
    </section>
  )
}

// Styles disponibles pour les boutons
const VARIANTES = {
  primaire: "bg-marine-700 text-white hover:bg-marine-800 shadow-sm", // action principale (bleu)
  secondaire: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50", // action secondaire (blanc)
  succes: "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm", // validation (vert)
  danger: "bg-rdc-rouge text-white hover:bg-red-800 shadow-sm", // action destructive (rouge)
  discret: "text-slate-600 hover:bg-slate-100", // bouton sans fond
}

// Bouton commun : icône facultative, animation de chargement, deux tailles
export function Button({ variante = "primaire", icon: Icon, chargement, children, className = "", taille = "md", ...props }) {
  const tailles = { sm: "px-3 py-1.5 text-xs gap-1.5", md: "px-4 py-2.5 text-sm gap-2" } // petite / normale
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-semibold transition
        disabled:cursor-not-allowed disabled:opacity-60 ${tailles[taille]} ${VARIANTES[variante]} ${className}`}
      disabled={chargement || props.disabled}
      {...props}
    >
      {/* Pendant le chargement : roue qui tourne à la place de l'icône (et bouton désactivé) */}
      {chargement ? (
        <LoaderCircle className={`${taille === "sm" ? "size-3.5" : "size-4"} animate-spin`} aria-hidden />
      ) : (
        Icon && <Icon className={taille === "sm" ? "size-3.5" : "size-4"} aria-hidden />
      )}
      {children}
    </button>
  )
}

// Champ de formulaire : étiquette + astérisque si obligatoire + texte d'aide
export function Field({ label, htmlFor, requis, aide, children, className = "" }) {
  return (
    <div className={className}>
      {/* htmlFor relie l'étiquette au champ (un clic sur l'étiquette active le champ) */}
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {requis && <span className="ml-0.5 text-rdc-rouge" aria-hidden>*</span>}
      </label>
      {/* Le champ lui-même (input, select...) */}
      {children}
      {/* Texte d'aide sous le champ */}
      {aide && <p className="mt-1 text-xs text-slate-500">{aide}</p>}
    </div>
  )
}

// Types de messages : icône et couleurs de chacun
const ALERTES = {
  succes: { icon: CircleCheck, cls: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  erreur: { icon: CircleAlert, cls: "border-red-200 bg-red-50 text-red-800" },
  attention: { icon: TriangleAlert, cls: "border-amber-200 bg-amber-50 text-amber-800" },
  info: { icon: Info, cls: "border-marine-100 bg-marine-50 text-marine-800" },
}

// Message (succès, erreur, avertissement, information), avec bouton de fermeture facultatif
export function Alert({ type = "info", children, onClose, className = "" }) {
  const { icon: Icon, cls } = ALERTES[type] // icône et couleurs du type demandé
  return (
    // role="alert" : les lecteurs d'écran annoncent immédiatement les erreurs
    <div role={type === "erreur" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${cls} ${className}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex-1 break-words">{children}</div>
      {/* Croix de fermeture (seulement si onClose est fourni) */}
      {onClose && (
        <button onClick={onClose} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Fermer le message">
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

// Libellé, icône et couleurs de chaque statut (transactions et parcelles)
const STATUTS = {
  en_cours: { label: "Offre en attente", icon: Clock, cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  "acceptée": { label: "Acceptée par le vendeur", icon: Handshake, cls: "bg-marine-50 text-marine-700 ring-marine-100" },
  "terminée": { label: "Validée", icon: CircleCheck, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  "refusée": { label: "Refusée", icon: CircleX, cls: "bg-red-50 text-red-700 ring-red-200" },
  "annulée": { label: "Annulée", icon: CircleX, cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  disponible: { label: "Disponible", icon: CircleCheck, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  vendue: { label: "Vendue", icon: CircleCheck, cls: "bg-slate-100 text-slate-600 ring-slate-200" },
  en_negociation: { label: "En négociation", icon: Clock, cls: "bg-amber-50 text-amber-700 ring-amber-200" },
}

// Le statut est toujours indiqué par une icône + un texte (pas seulement une couleur)
export function StatutBadge({ statut }) {
  // Statut inconnu : affichage neutre avec sa valeur brute
  const s = STATUTS[statut] || { label: statut, icon: Info, cls: "bg-slate-100 text-slate-600 ring-slate-200" }
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>
      <Icon className="size-3.5" aria-hidden />
      {s.label}
    </span>
  )
}

// Couleurs disponibles pour les cartes de statistiques
const TONS = {
  marine: "bg-marine-50 text-marine-700",
  vert: "bg-emerald-50 text-emerald-700",
  ambre: "bg-amber-50 text-amber-700",
  rouge: "bg-red-50 text-red-700",
  violet: "bg-violet-50 text-violet-700",
}

// Carte de statistique : icône colorée + libellé + grand chiffre + détail facultatif
export function StatCard({ icon: Icon, label, valeur, ton = "marine", detail }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur-sm">
      <div className={`rounded-xl p-3 ${TONS[ton]}`}>
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="truncate text-2xl font-bold text-slate-900">{valeur}</p>
        {detail && <p className="text-xs text-slate-400">{detail}</p>}
      </div>
    </div>
  )
}

// Affichage quand une liste est vide : icône, titre, explication et action proposée
export function EmptyState({ icon: Icon = Inbox, titre, texte, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-4 text-slate-400">
        <Icon className="size-8" aria-hidden />
      </div>
      <p className="font-semibold text-slate-700">{titre}</p>
      {texte && <p className="mt-1 max-w-sm text-sm text-slate-500">{texte}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// Indicateur de chargement (roue qui tourne + texte)
export function Chargement({ texte = "Chargement..." }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500" role="status">
      <LoaderCircle className="size-5 animate-spin text-marine-600" aria-hidden />
      {texte}
    </div>
  )
}

// Action irréversible : demande une confirmation sur place avant d'exécuter
// "sobre" : bouton initial discret (ex. suppression), seule la confirmation est colorée
export function ConfirmAction({ label, question, icon, variante, onConfirm, chargement, sobre = false }) {
  const [confirmer, setConfirmer] = useState(false) // true = on affiche la question "Oui / Non"
  // Étape 1 : bouton d'action
  if (!confirmer) {
    return (
      <Button
        taille="sm"
        variante={sobre ? "secondaire" : variante}
        className={sobre ? "text-red-700! hover:bg-red-50!" : ""}
        icon={icon}
        chargement={chargement}
        onClick={() => setConfirmer(true)}
      >
        {label}
      </Button>
    )
  }
  // Étape 2 : question de confirmation
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2 py-1 ring-1 ring-slate-200">
      <span className="text-xs font-medium text-slate-700">{question}</span>
      {/* "Oui" exécute l'action, "Non" revient au bouton de départ */}
      <Button taille="sm" variante={variante} onClick={() => { setConfirmer(false); onConfirm() }}>Oui</Button>
      <Button taille="sm" variante="secondaire" onClick={() => setConfirmer(false)}>Non</Button>
    </div>
  )
}
