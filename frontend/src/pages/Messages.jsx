import { useState, useEffect, useRef } from "react" // hooks React : état local, effets et références
import { Link, useSearchParams } from "react-router-dom" // lien interne et paramètres de l'adresse (?c=12)
// Icônes de la bibliothèque lucide-react
import {
  MessagesSquare, Send, ArrowLeft, BadgeDollarSign, LandPlot, Handshake, CheckCheck, X,
} from "lucide-react"
import Layout from "../components/Layout" // mise en page commune
// Composants d'interface
import { Alert, Button, Card, Chargement, EmptyState, PageHeader, StatutBadge } from "../components/ui"
import api, { messageErreur, formatMontant, capitaliser } from "../api" // client HTTP et fonctions utilitaires

// Fréquence d'actualisation (la messagerie interroge régulièrement le serveur)
const DELAI_MESSAGES = 4000 // messages de la discussion ouverte : toutes les 4 secondes
const DELAI_CONVERSATIONS = 10000 // liste des discussions : toutes les 10 secondes
const AUCUN_MESSAGE = [] // liste vide partagée (évite de recréer un tableau à chaque affichage)

// Heure si le message est d'aujourd'hui, sinon date + heure
const formatDate = (iso) => {
  const d = new Date(iso)
  const heure = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  return d.toDateString() === new Date().toDateString() ? heure : `${d.toLocaleDateString("fr-FR")} ${heure}`
}

// Page "Messages" : discussion et marchandage entre l'acheteur et le vendeur d'une parcelle
export default function Messages() {
  const role = localStorage.getItem("role") // rôle de l'utilisateur connecté
  const [params, setParams] = useSearchParams() // l'identifiant de la discussion ouverte est dans l'adresse
  const idOuvert = parseInt(params.get("c")) || null

  const [conversations, setConversations] = useState([]) // discussions de l'utilisateur
  const [loading, setLoading] = useState(true) // chargement de la liste
  const [fil, setFil] = useState({ id: null, liste: AUCUN_MESSAGE }) // messages chargés, et de quelle discussion
  const [texte, setTexte] = useState("") // message en cours de saisie
  const [prix, setPrix] = useState("") // prix proposé (facultatif)
  const [prixOuvert, setPrixOuvert] = useState(false) // champ "proposer un prix" affiché ?
  const [envoi, setEnvoi] = useState(false) // envoi en cours
  const [erreur, setErreur] = useState("")
  const [succes, setSucces] = useState("")
  const [offreEnCours, setOffreEnCours] = useState(null) // id du message transformé en offre officielle
  const finRef = useRef(null) // repère placé sous le dernier message (défilement automatique)
  const nbMessagesRef = useRef(0) // nombre de messages au dernier affichage

  const conversation = conversations.find((c) => c.id === idOuvert) // discussion ouverte
  // Messages affichés : seulement s'ils appartiennent à la discussion ouverte
  const messages = fil.id === idOuvert ? fil.liste : AUCUN_MESSAGE
  const chargementMessages = idOuvert !== null && fil.id !== idOuvert // premier chargement en cours
  // Ajoute à l'écran un message qu'on vient d'envoyer
  const ajouterMessage = (m) => setFil((f) => (f.id === m.conversation ? { ...f, liste: [...f.liste, m] } : f))

  // Charge la liste des discussions, puis l'actualise régulièrement
  useEffect(() => {
    const charger = () =>
      api.get("/conversations/")
        .then((res) => setConversations(res.data))
        .catch(() => setErreur("Impossible de charger les discussions."))
        .finally(() => setLoading(false))
    charger()
    const minuterie = setInterval(charger, DELAI_CONVERSATIONS)
    return () => clearInterval(minuterie) // arrête l'actualisation en quittant la page
  }, [])

  // Charge les messages de la discussion ouverte, puis les actualise régulièrement
  useEffect(() => {
    if (!idOuvert) return
    let actif = true // ignore les réponses d'une discussion qu'on a quittée
    const charger = () =>
      api.get(`/conversations/${idOuvert}/messages/`)
        .then((res) => {
          if (!actif) return
          setFil({ id: idOuvert, liste: res.data })
          // Les messages viennent d'être lus : la pastille de cette discussion disparaît
          setConversations((liste) => liste.map((c) => (c.id === idOuvert ? { ...c, non_lus: 0 } : c)))
        })
        .catch(() => {
          if (!actif) return
          setFil((f) => (f.id === idOuvert ? f : { id: idOuvert, liste: AUCUN_MESSAGE }))
          setErreur("Impossible de charger cette discussion.")
        })
    charger()
    const minuterie = setInterval(charger, DELAI_MESSAGES)
    return () => {
      actif = false
      clearInterval(minuterie)
    }
  }, [idOuvert])

  // Fait défiler jusqu'au dernier message quand il en arrive un nouveau
  useEffect(() => {
    if (messages.length > nbMessagesRef.current) finRef.current?.scrollIntoView({ block: "end" })
    nbMessagesRef.current = messages.length
  }, [messages])

  const ouvrir = (id) => { setErreur(""); setSucces(""); setParams({ c: id }) } // ouvre une discussion
  const fermer = () => setParams({}) // revient à la liste (mobile)

  // Envoi d'un message (texte et/ou proposition de prix)
  const envoyer = async (e) => {
    e.preventDefault() // empêche le rechargement de la page
    const contenu = texte.trim()
    const montant = prixOuvert && prix !== "" ? parseFloat(prix) : null
    if (envoi || (!contenu && montant === null)) return // envoi déjà en cours, ou rien à envoyer
    setErreur("")
    setEnvoi(true)
    try {
      const res = await api.post(`/conversations/${idOuvert}/messages/`, { contenu, prix_propose: montant })
      ajouterMessage(res.data) // affiche aussitôt le message envoyé
      setTexte("")
      setPrix("")
      setPrixOuvert(false)
    } catch (err) {
      setErreur(messageErreur(err, "Le message n'a pas pu être envoyé."))
    }
    setEnvoi(false)
  }

  // Acheteur : transforme un prix négocié en offre officielle (page Transactions)
  const officialiser = async (m) => {
    setErreur("")
    setSucces("")
    setOffreEnCours(m.id)
    try {
      await api.post("/transactions/", { parcelle: conversation.parcelle, montant: parseFloat(m.prix_propose) })
      // Prévient le vendeur dans la discussion
      const res = await api.post(`/conversations/${idOuvert}/messages/`, {
        contenu: `J'ai déposé une offre officielle de ${formatMontant(m.prix_propose)} pour cette parcelle.`,
      })
      ajouterMessage(res.data)
      setSucces("offre") // message de succès avec un lien vers la page Transactions
    } catch (err) {
      setErreur(messageErreur(err, "L'offre n'a pas pu être créée."))
    }
    setOffreEnCours(null)
  }

  // Nom de l'interlocuteur selon le rôle
  const interlocuteur = (c) => (role === "acheteur" ? c.vendeur_nom : c.acheteur_nom)

  const description =
    role === "acheteur" ? "Discutez avec les vendeurs et négociez le prix avant de faire une offre."
    : "Répondez aux acheteurs intéressés par vos parcelles et négociez le prix."

  return (
    <Layout titre="Messages">
      <PageHeader icon={MessagesSquare} titre="Messages" description={description} />

      {succes === "offre" && (
        <Alert type="succes" onClose={() => setSucces("")} className="mb-4">
          Offre officielle envoyée. Suivez son traitement dans{" "}
          <Link to="/transactions" className="font-semibold underline">Mes achats</Link>.
        </Alert>
      )}
      {erreur && <Alert type="erreur" onClose={() => setErreur("")} className="mb-4">{erreur}</Alert>}

      {loading ? (
        <Card><Chargement texte="Chargement des discussions..." /></Card>
      ) : conversations.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessagesSquare}
            titre="Aucune discussion"
            texte={
              role === "acheteur" ? "Ouvrez une discussion avec un vendeur depuis la page Parcelles, bouton « Discuter »."
              : "Les acheteurs intéressés par vos parcelles vous écriront ici."
            }
            action={role === "acheteur" && <Link to="/parcelles"><Button icon={LandPlot}>Voir les parcelles</Button></Link>}
          />
        </Card>
      ) : (
        // Deux colonnes sur grand écran ; sur mobile, la liste OU la discussion
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[20rem_1fr]">
          {/* ----- Liste des discussions ----- */}
          <Card padding={false} className={`overflow-hidden ${idOuvert ? "hidden lg:block" : ""}`}>
            <ul className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => ouvrir(c.id)}
                    aria-current={c.id === idOuvert}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                      c.id === idOuvert ? "bg-marine-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{interlocuteur(c)}</p>
                      <p className="truncate text-xs text-marine-700">Parcelle {c.parcelle_su} — {capitaliser(c.parcelle_zone)}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{c.dernier_message || "Aucun message pour le moment"}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-slate-400">{formatDate(c.updated_at)}</span>
                      {/* Pastille : nombre de messages non lus */}
                      {c.non_lus > 0 && (
                        <span className="rounded-full bg-rdc-rouge px-1.5 py-0.5 text-[11px] font-bold leading-none text-white" aria-label={`${c.non_lus} message(s) non lu(s)`}>
                          {c.non_lus}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          {/* ----- Discussion ouverte ----- */}
          <section className={`h-[70vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-sm backdrop-blur-sm ${idOuvert ? "flex" : "hidden lg:flex"}`}>
            {!conversation ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState icon={MessagesSquare} titre="Choisissez une discussion" texte="Sélectionnez une discussion dans la liste pour lire et envoyer des messages." />
              </div>
            ) : (
              <>
                {/* En-tête : interlocuteur, parcelle et prix demandé */}
                <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                  <button onClick={fermer} className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Retour à la liste">
                    <ArrowLeft className="size-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{interlocuteur(conversation)}</p>
                    <p className="truncate text-xs text-slate-500">
                      Parcelle <b>{conversation.parcelle_su}</b> — {capitaliser(conversation.parcelle_zone)} · Prix demandé :{" "}
                      <b className="text-slate-700">{formatMontant(conversation.parcelle_prix)}</b>
                    </p>
                  </div>
                  <StatutBadge statut={conversation.parcelle_statut} />
                </header>

                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 px-4 py-4" aria-live="polite">
                  {chargementMessages && messages.length === 0 ? (
                    <Chargement texte="Chargement des messages..." />
                  ) : messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-slate-500">
                      Aucun message. Écrivez le premier ou proposez un prix.
                    </p>
                  ) : (
                    messages.map((m) => (
                      // Mes messages à droite (bleu), ceux de l'autre à gauche (blanc)
                      <div key={m.id} className={`flex ${m.de_moi ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[70%] ${
                          m.de_moi ? "rounded-br-sm bg-marine-700 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
                        }`}>
                          {/* Proposition de prix */}
                          {m.prix_propose !== null && (
                            <div className={`mb-1 rounded-lg px-2.5 py-1.5 ${m.de_moi ? "bg-white/15" : "bg-amber-50 text-amber-900"}`}>
                              <p className="flex items-center gap-1.5 text-xs font-medium">
                                <BadgeDollarSign className="size-4" aria-hidden /> Prix proposé
                              </p>
                              <p className="text-lg font-bold">{formatMontant(m.prix_propose)}</p>
                              {/* L'acheteur peut en faire une offre officielle tant que la parcelle est disponible */}
                              {role === "acheteur" && conversation.parcelle_statut === "disponible" && (
                                <Button
                                  taille="sm"
                                  variante="succes"
                                  icon={Handshake}
                                  className="mt-1"
                                  chargement={offreEnCours === m.id}
                                  onClick={() => officialiser(m)}
                                >
                                  Faire l'offre officielle à ce prix
                                </Button>
                              )}
                            </div>
                          )}
                          {m.contenu && <p className="whitespace-pre-wrap break-words">{m.contenu}</p>}
                          {/* Heure d'envoi et accusé de lecture */}
                          <p className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${m.de_moi ? "text-marine-100" : "text-slate-400"}`}>
                            {formatDate(m.created_at)}
                            {m.de_moi && m.lu && <CheckCheck className="size-3.5" aria-label="Lu" />}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={finRef} />
                </div>

                {/* Zone de saisie */}
                <form onSubmit={envoyer} className="space-y-2 border-t border-slate-100 p-3">
                    {/* Champ "proposer un prix" (marchandage) */}
                    {prixOuvert && (
                      <div className="flex items-center gap-2">
                        <label htmlFor="prix-propose" className="shrink-0 text-xs font-medium text-slate-600">Prix proposé ($)</label>
                        <input id="prix-propose" type="number" min="1" step="any" value={prix} onChange={(e) => setPrix(e.target.value)} autoFocus className="champ py-1.5" />
                        <button type="button" onClick={() => { setPrixOuvert(false); setPrix("") }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Retirer la proposition de prix">
                          <X className="size-4" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      {!prixOuvert && (
                        <Button type="button" variante="secondaire" icon={BadgeDollarSign} onClick={() => setPrixOuvert(true)} title="Joindre une proposition de prix">
                          <span className="hidden sm:inline">Proposer un prix</span>
                        </Button>
                      )}
                      <textarea
                        value={texte}
                        onChange={(e) => setTexte(e.target.value)}
                        // Entrée envoie le message, Maj+Entrée va à la ligne
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit() } }}
                        rows={1}
                        maxLength={2000}
                        placeholder="Écrire un message..."
                        aria-label="Votre message"
                        className="champ max-h-32 min-h-[2.75rem] flex-1 resize-none"
                      />
                      <Button type="submit" icon={Send} chargement={envoi} disabled={envoi || !texte.trim() && !(prixOuvert && prix !== "")}>
                        <span className="hidden sm:inline">Envoyer</span>
                      </Button>
                    </div>
                  </form>
              </>
            )}
          </section>
        </div>
      )}
    </Layout>
  )
}
