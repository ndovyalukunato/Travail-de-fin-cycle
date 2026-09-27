import { useState, useEffect } from "react" // hooks React : état local et effets
import { motion, AnimatePresence } from "framer-motion" // animations (ouverture/fermeture du formulaire)
// Icônes de la bibliothèque lucide-react
import {
  ArrowLeftRight, Plus, X, Send, Check, Ban, BrainCircuit, ShieldAlert, ShieldCheck, Link2, User, CalendarDays,
  Handshake, ThumbsDown, Undo2, ServerOff, RefreshCw, Blocks, Clock,
} from "lucide-react"
import Layout from "../components/Layout" // mise en page commune
// Composants d'interface
import {
  Alert, Button, Card, Chargement, ConfirmAction, EmptyState, Field, PageHeader, StatutBadge,
} from "../components/ui"
import api, { messageErreur, formatMontant, capitaliser } from "../api" // client HTTP et fonctions utilitaires

// Statuts d'une transaction encore en cours de traitement
const OUVERTS = ["en_cours", "acceptée"]

// Suivi visuel du circuit : Offre -> Accord du vendeur -> Validation (blockchain)
function Etapes({ statut }) {
  // Les 3 étapes et, pour chacune, si elle est déjà franchie
  const etapes = [
    { label: "Offre de l'acheteur", fait: true },
    { label: "Accord du vendeur", fait: ["acceptée", "terminée"].includes(statut) },
    { label: "Validation admin + blockchain", fait: statut === "terminée" },
  ]
  const interrompu = ["refusée", "annulée"].includes(statut) // circuit arrêté avant la fin
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs" aria-label="Avancement de la transaction">
      {etapes.map((e, i) => (
        <li key={e.label} className="flex items-center gap-1">
          {/* Pastille : coche verte si l'étape est franchie, sinon son numéro */}
          <span
            className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
              e.fait ? "bg-emerald-600 text-white" : interrompu ? "bg-slate-200 text-slate-400" : "bg-slate-200 text-slate-600"
            }`}
          >
            {e.fait ? <Check className="size-3" aria-hidden /> : i + 1}
          </span>
          <span className={e.fait ? "font-medium text-slate-700" : "text-slate-400"}>{e.label}</span>
          {/* Trait de liaison entre deux étapes */}
          {i < etapes.length - 1 && <span className="mx-1 h-px w-5 bg-slate-300" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

// Page "Transactions" : offres d'achat, accord du vendeur, validation par l'admin
export default function Transactions() {
  const role = localStorage.getItem("role") // rôle de l'utilisateur connecté

  const [transactions, setTransactions] = useState([]) // transactions reçues du backend
  const [parcelles, setParcelles] = useState([]) // parcelles (pour le formulaire d'offre)
  const [loading, setLoading] = useState(true) // chargement en cours
  const [version, setVersion] = useState(0) // incrémenté pour recharger
  const [erreur, setErreur] = useState("") // message d'erreur général
  const [succes, setSucces] = useState("") // message de succès
  const [actionEnCours, setActionEnCours] = useState(null) // id de la transaction en cours de modification
  const [erreursCartes, setErreursCartes] = useState({}) // erreur affichée sous la transaction concernée
  const [blockchain, setBlockchain] = useState(null) // état de Ganache (admin uniquement)
  const [filtre, setFiltre] = useState("a_traiter") // onglet choisi : "à traiter" ou "toutes"

  // Formulaire d'offre (acheteur)
  const [afficherFormulaire, setAfficherFormulaire] = useState(false)
  const [parcelleId, setParcelleId] = useState("")
  const [montant, setMontant] = useState("")
  const [envoi, setEnvoi] = useState(false)
  const [controle, setControle] = useState(null) // avis de l'IA sur le montant proposé
  const [controleEnCours, setControleEnCours] = useState(false)

  // Charge les transactions et les parcelles (au début et après chaque action)
  useEffect(() => {
    Promise.all([api.get("/transactions/"), api.get("/parcelles/")]) // les deux requêtes en parallèle
      .then(([resT, resP]) => {
        setTransactions(resT.data)
        setParcelles(resP.data)
      })
      .catch(() => setErreur("Erreur lors du chargement des données."))
      .finally(() => setLoading(false))
  }, [version])

  // L'admin est prévenu à l'avance si Ganache n'est pas lancé
  useEffect(() => {
    if (role !== "admin") return
    api.get("/blockchain/statut/").then((res) => setBlockchain(res.data)).catch(() => {})
  }, [role, version])

  const recharger = () => setVersion((v) => v + 1) // relance les deux chargements ci-dessus
  const trouverParcelle = (id) => parcelles.find((p) => p.id === id) // parcelle à partir de son id
  const parcellesDisponibles = parcelles.filter((p) => p.statut === "disponible") // parcelles achetables

  // Transactions qui attendent une action de l'utilisateur connecté
  const aTraiter = (t) =>
    role === "vendeur" ? t.statut === "en_cours"
    : role === "admin" ? OUVERTS.includes(t.statut)
    : OUVERTS.includes(t.statut)
  const nbATraiter = transactions.filter(aTraiter).length
  const affichees = filtre === "a_traiter" ? transactions.filter(aTraiter) : transactions // selon l'onglet

  // Contrôle du montant proposé par l'IA avant d'initier la transaction
  const controlerMontant = async () => {
    setControle(null)
    if (!parcelleId || montant === "") return // rien à contrôler
    setControleEnCours(true)
    try {
      const res = await api.post("/estimer/", { parcelle_id: parseInt(parcelleId), prix: parseFloat(montant) })
      setControle(res.data) // avis de l'IA
    } catch {
      setControle(null)
    }
    setControleEnCours(false)
  }

  // Envoi d'une offre d'achat (acheteur)
  const handleCreerTransaction = async (e) => {
    e.preventDefault() // empêche le rechargement de la page
    setErreur("")
    setSucces("")
    const parcelle = trouverParcelle(parseInt(parcelleId))
    if (!parcelle) {
      setErreur("Veuillez choisir une parcelle valide.")
      return
    }
    setEnvoi(true)
    try {
      // Le vendeur n'est pas envoyé : le backend le déduit du propriétaire de la parcelle
      await api.post("/transactions/", {
        parcelle: parcelle.id,
        montant: parseFloat(montant) || parcelle.prix_reel,
      })
      setSucces("Offre envoyée. Le vendeur doit maintenant l'accepter, puis l'administrateur la valider.")
      // Vide et referme le formulaire
      setParcelleId("")
      setMontant("")
      setControle(null)
      setAfficherFormulaire(false)
      setFiltre("a_traiter")
      recharger()
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de la création de la transaction."))
    }
    setEnvoi(false)
  }

  // Message de succès affiché après chaque changement de statut
  const MESSAGES = {
    "acceptée": (t) => `Offre #${t.id} acceptée. La parcelle ${t.parcelle_su} passe en négociation, en attente de validation par l'administrateur.`,
    "refusée": (t) => `Offre #${t.id} refusée.`,
    "terminée": (t) => `Transaction #${t.id} validée et enregistrée sur la blockchain. La parcelle ${t.parcelle_su} est vendue.`,
    "annulée": (t) => `Transaction #${t.id} annulée.`,
  }

  // Change le statut d'une transaction (accepter, refuser, annuler, valider)
  const changerStatut = async (t, nouveauStatut) => {
    setErreur("")
    setSucces("")
    setErreursCartes((e) => ({ ...e, [t.id]: "" })) // efface l'ancienne erreur de cette transaction
    setActionEnCours(t.id)
    try {
      await api.patch(`/transactions/${t.id}/`, { statut: nouveauStatut })
      setSucces(MESSAGES[nouveauStatut](t))
      recharger()
    } catch (err) {
      // L'erreur est affichée juste sous la transaction concernée
      setErreursCartes((e) => ({ ...e, [t.id]: messageErreur(err, "Erreur lors de la mise à jour du statut.") }))
    }
    setActionEnCours(null)
  }

  // Boutons proposés selon le rôle et le statut
  const actions = (t) => {
    const charge = actionEnCours === t.id // cette transaction est en cours de modification
    // ----- Vendeur -----
    if (role === "vendeur") {
      // Offre reçue : accepter ou refuser
      if (t.statut === "en_cours") return [
        <ConfirmAction key="a" label="Accepter l'offre" question="Accepter cette offre ?" icon={Handshake} variante="succes" chargement={charge} onConfirm={() => changerStatut(t, "acceptée")} />,
        <ConfirmAction key="r" label="Refuser" question="Refuser cette offre ?" icon={ThumbsDown} variante="danger" chargement={charge} onConfirm={() => changerStatut(t, "refusée")} />,
      ]
      // Offre déjà acceptée : possibilité d'annuler la vente avant la validation
      if (t.statut === "acceptée") return [
        <ConfirmAction key="c" label="Annuler la vente" question="Annuler cette vente ?" icon={Ban} variante="danger" chargement={charge} onConfirm={() => changerStatut(t, "annulée")} />,
      ]
    }
    // ----- Acheteur : retirer son offre tant qu'elle n'est pas validée -----
    if (role === "acheteur" && OUVERTS.includes(t.statut)) return [
      <ConfirmAction key="w" label="Retirer mon offre" question="Retirer votre offre ?" icon={Undo2} variante="danger" chargement={charge} onConfirm={() => changerStatut(t, "annulée")} />,
    ]
    // ----- Admin : valider (blockchain) ou annuler -----
    if (role === "admin" && OUVERTS.includes(t.statut)) {
      const bloque = blockchain && !blockchain.disponible // Ganache éteint : validation impossible
      return [
        bloque ? (
          // Bouton grisé ; le survol affiche la raison
          <Button key="v" taille="sm" variante="succes" icon={ServerOff} disabled title={blockchain.message}>Valider</Button>
        ) : (
          <ConfirmAction
            key="v"
            label="Valider"
            question={t.statut === "en_cours" ? "Le vendeur n'a pas encore accepté. Valider quand même ?" : "Enregistrer sur la blockchain ?"}
            icon={t.analyse_ia?.montant_suspect ? ShieldAlert : Check}
            variante="succes"
            chargement={charge}
            onConfirm={() => changerStatut(t, "terminée")}
          />
        ),
        <ConfirmAction key="c" label="Annuler" question="Annuler la transaction ?" icon={Ban} variante="danger" chargement={charge} onConfirm={() => changerStatut(t, "annulée")} />,
      ]
    }
    return [] // aucune action possible (transaction terminée, refusée ou annulée)
  }

  // Message expliquant qui doit agir ensuite
  const prochaineEtape = (t) => {
    if (t.statut === "en_cours") return role === "vendeur" ? "À vous d'accepter ou de refuser cette offre." : "En attente de la réponse du vendeur."
    if (t.statut === "acceptée") return role === "admin" ? "Le vendeur a accepté : prête à être validée." : "En attente de la validation par l'administrateur."
    return null // transaction terminée : plus rien à faire
  }

  // Titre et description de la page selon le rôle
  const titre = role === "acheteur" ? "Mes achats" : role === "vendeur" ? "Mes ventes" : "Transactions"
  const description =
    role === "vendeur" ? "Acceptez ou refusez les offres reçues sur vos parcelles."
    : role === "acheteur" ? "Faites une offre sur une parcelle et suivez son traitement."
    : "Validez les ventes acceptées par les vendeurs : elles sont enregistrées sur la blockchain."

  return (
    <Layout titre="Transactions">
      {/* En-tête, avec le bouton "Faire une offre" pour l'acheteur */}
      <PageHeader
        icon={ArrowLeftRight}
        titre={titre}
        description={description}
        actions={
          role === "acheteur" && (
            <Button
              icon={afficherFormulaire ? X : Plus}
              variante={afficherFormulaire ? "secondaire" : "primaire"}
              onClick={() => { setAfficherFormulaire(!afficherFormulaire); setErreur("") }}
              aria-expanded={afficherFormulaire}
            >
              {afficherFormulaire ? "Fermer" : "Faire une offre"}
            </Button>
          )
        }
      />

      {/* Bandeau d'état de la blockchain (admin) : jaune si Ganache est indisponible, vert sinon */}
      {role === "admin" && blockchain && !blockchain.disponible && (
        <Alert type="attention" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><b>Blockchain indisponible.</b> {blockchain.message}</span>
            <Button taille="sm" variante="secondaire" icon={RefreshCw} onClick={recharger}>Vérifier à nouveau</Button>
          </div>
        </Alert>
      )}
      {role === "admin" && blockchain?.disponible && (
        <Alert type="succes" className="mb-4">
          <span className="inline-flex items-center gap-1.5"><Blocks className="size-4" aria-hidden /> Blockchain opérationnelle — les validations seront enregistrées sur Ganache.</span>
        </Alert>
      )}
      {/* Messages de succès et d'erreur */}
      {succes && <Alert type="succes" onClose={() => setSucces("")} className="mb-4">{succes}</Alert>}
      {erreur && <Alert type="erreur" onClose={() => setErreur("")} className="mb-4">{erreur}</Alert>}

      {/* Formulaire d'offre d'achat (acheteur), avec animation */}
      <AnimatePresence>
        {afficherFormulaire && role === "acheteur" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <Card titre="Faire une offre d'achat" icon={Plus}>
              <form onSubmit={handleCreerTransaction} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Choix de la parcelle (le montant est pré-rempli avec son prix) */}
                <Field label="Parcelle" htmlFor="parcelle" requis>
                  <select
                    id="parcelle"
                    value={parcelleId}
                    onChange={(e) => {
                      setParcelleId(e.target.value)
                      setControle(null)
                      const parc = trouverParcelle(parseInt(e.target.value))
                      if (parc) setMontant(parc.prix_reel)
                    }}
                    required
                    className="champ"
                  >
                    <option value="">— Choisir une parcelle disponible —</option>
                    {parcellesDisponibles.map((parc) => (
                      <option key={parc.id} value={parc.id}>
                        {parc.su} — {capitaliser(parc.zone)} — {formatMontant(parc.prix_reel)}
                      </option>
                    ))}
                  </select>
                </Field>
                {/* Montant proposé : contrôlé par l'IA quand on quitte le champ (onBlur) */}
                <Field label="Montant proposé ($)" htmlFor="montant" requis aide="L'IA vérifie le montant dès que vous quittez ce champ.">
                  <input
                    id="montant"
                    type="number"
                    min="1"
                    step="any"
                    value={montant}
                    onChange={(e) => { setMontant(e.target.value); setControle(null) }}
                    onBlur={controlerMontant}
                    required
                    className="champ"
                  />
                </Field>

                {/* Avis de l'IA sur le montant */}
                {(controle || controleEnCours) && (
                  <div className="md:col-span-2">
                    {controleEnCours ? (
                      <Alert type="info">Analyse du montant par l'IA...</Alert>
                    ) : (
                      <Alert type={controle.fraude.est_fraude ? "attention" : "succes"}>
                        Prix estimé par l'IA : <b>{formatMontant(controle.estimation.moyenne)}</b>.{" "}
                        {controle.fraude.est_fraude
                          ? "Ce montant est jugé anormal pour cette parcelle : vérifiez-le avant d'envoyer."
                          : "Montant cohérent avec le marché."}
                      </Alert>
                    )}
                  </div>
                )}

                {/* Boutons du formulaire */}
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 md:col-span-2">
                  <Button type="button" variante="secondaire" onClick={() => setAfficherFormulaire(false)}>Annuler</Button>
                  <Button type="submit" icon={Send} chargement={envoi}>Envoyer l'offre</Button>
                </div>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Onglets "À traiter" / "Toutes" */}
      <div role="tablist" aria-label="Filtrer les transactions" className="mb-4 inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {[
          ["a_traiter", `${role === "acheteur" ? "En cours" : "À traiter"} (${nbATraiter})`],
          ["toutes", `Toutes (${transactions.length})`],
        ].map(([f, label]) => (
          <button
            key={f}
            role="tab"
            aria-selected={filtre === f}
            onClick={() => setFiltre(f)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              filtre === f ? "bg-marine-700 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Chargement, liste vide ou liste des transactions */}
      {loading ? (
        <Card><Chargement texte="Chargement des transactions..." /></Card>
      ) : affichees.length === 0 ? (
        <Card>
          <EmptyState
            icon={filtre === "a_traiter" ? Check : ArrowLeftRight}
            titre={filtre === "a_traiter" ? "Rien à traiter pour le moment" : "Aucune transaction"}
            texte={
              filtre === "a_traiter" && transactions.length > 0
                ? "Consultez l'onglet « Toutes » pour voir les transactions terminées."
                : role === "acheteur" ? "Faites une offre sur une parcelle disponible." : undefined
            }
            action={role === "acheteur" && <Button icon={Plus} onClick={() => setAfficherFormulaire(true)}>Faire une offre</Button>}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {affichees.map((t) => {
            const boutons = actions(t) // boutons disponibles pour cette transaction
            const etape = prochaineEtape(t) // qui doit agir ensuite
            return (
              // Carte d'une transaction
              <li key={t.id} className="rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-sm backdrop-blur-sm sm:p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  {/* Partie gauche : informations */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">Transaction #{t.id}</span>
                      <StatutBadge statut={t.statut} />
                    </div>
                    <p className="text-sm text-slate-700">
                      Parcelle <b>{t.parcelle_su}</b> — {capitaliser(t.parcelle_zone)}
                    </p>
                    {/* Autre partie de la transaction et date */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {role !== "vendeur" && (
                        <span className="inline-flex items-center gap-1"><User className="size-3.5" aria-hidden /> Vendeur : {t.vendeur_nom}</span>
                      )}
                      {role !== "acheteur" && (
                        <span className="inline-flex items-center gap-1"><User className="size-3.5" aria-hidden /> Acheteur : {t.acheteur_nom}</span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="size-3.5" aria-hidden /> {new Date(t.created_at).toLocaleDateString("fr-FR")}
                      </span>
                    </div>
                    {/* Avis de l'IA sur le montant (en rouge s'il est suspect) */}
                    {t.analyse_ia && (
                      <p className={`inline-flex items-center gap-1.5 text-xs ${t.analyse_ia.montant_suspect ? "font-semibold text-red-600" : "text-slate-500"}`}>
                        {t.analyse_ia.montant_suspect
                          ? <ShieldAlert className="size-3.5" aria-hidden />
                          : <BrainCircuit className="size-3.5" aria-hidden />}
                        Estimation IA : {formatMontant(t.analyse_ia.prix_estime)}
                        {t.analyse_ia.montant_suspect ? " — montant suspect" : " — montant normal"}
                      </p>
                    )}
                    {/* Hash de la transaction blockchain (après validation) */}
                    {t.hash_blockchain && (
                      <p className="flex items-center gap-1.5 break-all font-mono text-xs text-marine-600" title={t.hash_blockchain}>
                        <Link2 className="size-3.5 shrink-0" aria-hidden /> {t.hash_blockchain}
                      </p>
                    )}
                  </div>

                  {/* Partie droite : montant et boutons d'action */}
                  <div className="flex flex-col items-start gap-3 sm:items-end">
                    <p className="text-xl font-bold text-slate-900">{formatMontant(t.montant)}</p>
                    {boutons.length > 0 && <div className="flex flex-wrap gap-2 sm:justify-end">{boutons}</div>}
                    {role === "admin" && OUVERTS.includes(t.statut) && !t.analyse_ia?.montant_suspect && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <ShieldCheck className="size-3.5" aria-hidden /> Contrôle IA favorable
                      </span>
                    )}
                  </div>
                </div>

                {/* Bas de la carte : avancement du circuit et prochaine étape */}
                <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <Etapes statut={t.statut} />
                  {etape && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                      <Clock className="size-3.5" aria-hidden /> {etape}
                    </span>
                  )}
                </div>

                {/* Erreur liée à cette transaction (ex. Ganache éteint, adresse Ethereum manquante) */}
                {erreursCartes[t.id] && (
                  <Alert type="erreur" className="mt-3" onClose={() => setErreursCartes((e) => ({ ...e, [t.id]: "" }))}>
                    {erreursCartes[t.id]}
                  </Alert>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Layout>
  )
}
