import { useState, useEffect } from "react" // hooks React : état local et effets
import { useNavigate } from "react-router-dom" // redirection vers la page Messages
import { motion, AnimatePresence } from "framer-motion" // animations (ouverture/fermeture du formulaire)
// Icônes de la bibliothèque lucide-react
import {
  LandPlot, Plus, X, Save, Search, Ruler, MapPin, Coins, TriangleAlert, BrainCircuit, Hourglass, RefreshCw, PencilLine,
  Trash2, Check, Lock, FolderOpen, MessagesSquare, Map as IconeCarte, List, Satellite,
} from "lucide-react"
import Layout from "../components/Layout" // mise en page commune
// Pièces justificatives : boutons d'ajout, liste des fichiers choisis et fenêtre "dossier"
import DossierParcelle, { SelecteurFichiers, FichiersChoisis } from "../components/Documents"
// Cartes (satellite / plan) : saisie de la position réelle et consultation
import { SelecteurPosition, FenetreCarte, CarteParcelles } from "../components/Carte"
import { aPosition } from "../geo"
// Composants d'interface
import {
  Alert, Button, Card, Chargement, ConfirmAction, EmptyState, Field, PageHeader, StatutBadge,
} from "../components/ui"
import api, { messageErreur, formatMontant, capitaliser } from "../api" // client HTTP et fonctions utilitaires

// Valeurs initiales du formulaire d'ajout de parcelle
const FORMULAIRE_VIDE = {
  su: "", superficie_ha: "0", superficie_ares: "", superficie_ca: "", superficie_pourcent: "0",
  zone: "", usage: "residentiel", nature: "", prix_reel: "", titre_foncier: "",
}

// Au-delà de cet écart avec le prix estimé par l'IA, on signale au vendeur que son prix s'en éloigne
// (simple information : le vendeur reste libre de fixer le prix de son choix)
const ECART_PRIX_MAX = 0.10

// Position vide (parcelle non localisée)
const POSITION_VIDE = { latitude: null, longitude: null, precision_gps: null, contour: [] }

// Libellés des usages possibles
const USAGES = { residentiel: "Résidentiel", commercial: "Commercial", autre: "Autre" }

// Page "Parcelles" (ou "Mes parcelles" pour un vendeur)
export default function Parcelles() {
  const role = localStorage.getItem("role") // rôle de l'utilisateur connecté
  const peutAjouter = role === "vendeur" || role === "admin" // l'acheteur ne peut pas ajouter de parcelle

  const [parcelles, setParcelles] = useState([]) // parcelles reçues du backend
  const [zones, setZones] = useState([]) // lotissements connus par le modèle IA
  const [loading, setLoading] = useState(true) // chargement en cours
  const [version, setVersion] = useState(0) // incrémenté pour recharger la liste
  const [afficherFormulaire, setAfficherFormulaire] = useState(false) // formulaire d'ajout affiché ?
  const [form, setForm] = useState(FORMULAIRE_VIDE) // champs du formulaire
  const [envoi, setEnvoi] = useState(false) // enregistrement en cours
  const [erreur, setErreur] = useState("") // message d'erreur
  const [succes, setSucces] = useState("") // message de succès
  const [recherche, setRecherche] = useState("") // texte de recherche
  const [filtreStatut, setFiltreStatut] = useState("tous") // filtre par statut
  const [prixEdition, setPrixEdition] = useState({}) // { idParcelle: nouveau prix en cours de saisie }
  const [actionEnCours, setActionEnCours] = useState(null) // id de la parcelle en cours de modification
  const [fichiers, setFichiers] = useState([]) // pièces justificatives choisies dans le formulaire
  const [filtreVerification, setFiltreVerification] = useState("toutes") // filtre par état de vérification
  const [dossier, setDossier] = useState(null) // parcelle dont le dossier (pièces) est ouvert
  const [position, setPosition] = useState(POSITION_VIDE) // position saisie dans le formulaire d'ajout
  const [carte, setCarte] = useState(null) // parcelle affichée dans la fenêtre "Localisation"
  const [affichage, setAffichage] = useState("liste") // "liste" (tableau) ou "carte" (vue d'ensemble)
  const [estimationForm, setEstimationForm] = useState(null) // { cle, prix } : prix estimé pour le formulaire d'ajout
  const navigate = useNavigate() // permet de changer de page par le code

  // Charge les parcelles (au début et après chaque modification)
  useEffect(() => {
    api.get("/parcelles/")
      .then((res) => setParcelles(res.data))
      .catch(() => setErreur("Impossible de charger les parcelles."))
      .finally(() => setLoading(false))
  }, [version])

  // Charge la liste des lotissements (une seule fois)
  useEffect(() => {
    api.get("/zones/").then((res) => setZones(res.data)).catch(() => {})
  }, [])

  // Met à jour le champ modifié du formulaire (grâce à son attribut name)
  const maj = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  // Convertit un texte en entier (0 si vide ou invalide)
  const entier = (v) => parseInt(v) || 0
  // Superficie totale en m², recalculée à chaque saisie (1 ha = 10 000 m², 1 are = 100 m², 1 ca = 1 m²)
  const superficieM2 =
    entier(form.superficie_ha) * 10000 + entier(form.superficie_ares) * 100 +
    entier(form.superficie_ca) + entier(form.superficie_pourcent) / 100

  // ----- Prix proposé par l'IA : estimation en direct pendant la saisie -----
  // L'estimation ne dépend que de la superficie, du lotissement et de la nature du titre.
  // Le vendeur peut reprendre ce prix ou saisir librement le sien.
  const infrastructure = form.nature.toLowerCase().includes("certificat") ? 1 : 0
  const cleEstimation = `${superficieM2}|${form.zone}|${infrastructure}`
  useEffect(() => {
    if (!(superficieM2 > 0) || !form.zone) return
    const minuterie = setTimeout(() => {
      api.post("/estimer/", { superficie: superficieM2, zone: form.zone, infrastructure })
        .then((res) => setEstimationForm({ cle: cleEstimation, prix: res.data.estimation.moyenne }))
        .catch(() => setEstimationForm({ cle: cleEstimation, prix: null })) // lotissement inconnu du modèle
    }, 400) // attend que l'utilisateur ait fini de taper
    return () => clearTimeout(minuterie)
  }, [cleEstimation, superficieM2, form.zone, infrastructure])

  const estimationActuelle = estimationForm?.cle === cleEstimation ? estimationForm.prix : undefined
  const prixSaisi = parseFloat(form.prix_reel)
  const ecartPrix = estimationActuelle && prixSaisi > 0 ? (prixSaisi - estimationActuelle) / estimationActuelle : null
  const prixEloigne = ecartPrix !== null && Math.abs(ecartPrix) > ECART_PRIX_MAX // information seulement
  const utiliserPrixPropose = () => setForm({ ...form, prix_reel: String(Math.round(estimationActuelle)) })

  // Enregistrement d'une nouvelle parcelle
  const handleSubmit = async (e) => {
    e.preventDefault() // empêche le rechargement de la page
    setErreur("")
    setSucces("")
    // Sans pièce justificative, l'administrateur ne peut pas vérifier l'authenticité du bien
    if (fichiers.length === 0) {
      setErreur("Joignez au moins une pièce justificative (photo ou vidéo du titre foncier, PDF...).")
      return
    }
    setEnvoi(true)
    try {
      // Formulaire "multipart" : les champs convertis en nombres + les fichiers dans "documents"
      const donnees = new FormData()
      Object.entries({
        ...form,
        superficie_ha: entier(form.superficie_ha),
        superficie_ares: entier(form.superficie_ares),
        superficie_ca: entier(form.superficie_ca),
        superficie_pourcent: entier(form.superficie_pourcent),
        prix_reel: parseFloat(form.prix_reel),
        statut: "disponible",
      }).forEach(([champ, valeur]) => donnees.append(champ, valeur))
      fichiers.forEach((f) => donnees.append("documents", f))
      // Position réelle de la parcelle (facultative mais recommandée)
      if (aPosition(position)) {
        donnees.append("latitude", position.latitude)
        donnees.append("longitude", position.longitude)
        if (position.precision_gps) donnees.append("precision_gps", position.precision_gps)
        if (position.contour.length >= 3) donnees.append("contour", JSON.stringify(position.contour))
      }
      const res = await api.post("/parcelles/", donnees)
      // Le backend renvoie la parcelle avec le prix estimé par l'IA
      setSucces(
        (res.data.prix_estime
          ? `Parcelle ${res.data.su} enregistrée. Prix estimé par l'IA : ${formatMontant(res.data.prix_estime)}.`
          : `Parcelle ${res.data.su} enregistrée (zone inconnue du modèle IA : pas d'estimation).`)
        + " Elle sera proposée aux acheteurs dès que l'administrateur aura authentifié les pièces."
      )
      setForm(FORMULAIRE_VIDE) // vide le formulaire
      setPosition(POSITION_VIDE)
      setFichiers([]) // et la liste des pièces
      setAfficherFormulaire(false) // le referme
      setVersion((v) => v + 1) // recharge la liste
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de l'enregistrement de la parcelle."))
    }
    setEnvoi(false)
  }

  // Quitte le mode édition du prix d'une parcelle
  const annulerPrix = (id) => setPrixEdition((e) => { const copie = { ...e }; delete copie[id]; return copie })

  // Actions du propriétaire (vendeur) ou de l'admin sur une parcelle
  const modifierParcelle = async (p, donnees, message) => {
    setErreur("")
    setSucces("")
    setActionEnCours(p.id)
    try {
      const res = await api.patch(`/parcelles/${p.id}/`, donnees) // modification partielle
      // Le message peut dépendre de la réponse (ex. nouvelle estimation IA)
      setSucces(typeof message === "function" ? message(res.data) : message)
      annulerPrix(p.id)
      setVersion((v) => v + 1) // recharge la liste
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de la modification de la parcelle."))
    }
    setActionEnCours(null)
  }

  // Enregistre le nouveau prix saisi (l'IA recalcule alors l'estimation)
  const enregistrerPrix = (p) =>
    modifierParcelle(p, { prix_reel: parseFloat(prixEdition[p.id]) }, (d) => `Prix de ${p.su} mis à jour. Nouvelle estimation IA : ${formatMontant(d.prix_estime)}.`)

  // Suppression d'une parcelle (refusée par le backend si elle a des transactions)
  const supprimerParcelle = async (p) => {
    setErreur("")
    setSucces("")
    setActionEnCours(p.id)
    try {
      await api.delete(`/parcelles/${p.id}/`)
      setSucces(`Parcelle ${p.su} supprimée.`)
      setVersion((v) => v + 1) // recharge la liste
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de la suppression."))
    }
    setActionEnCours(null)
  }

  // Acheteur : ouvre (ou retrouve) la discussion avec le vendeur, puis va à la page Messages
  const discuter = async (p) => {
    setErreur("")
    setActionEnCours(p.id)
    try {
      const res = await api.post("/conversations/", { parcelle: p.id })
      navigate(`/messages?c=${res.data.id}`)
    } catch (err) {
      setErreur(messageErreur(err, "Impossible d'ouvrir la discussion."))
      setActionEnCours(null)
    }
  }

  // Enregistre la position modifiée depuis la fenêtre "Localisation"
  const enregistrerPosition = async (valeur) => {
    try {
      const res = await api.patch(`/parcelles/${carte.id}/`, valeur)
      setCarte(res.data)
      setSucces(`Position de la parcelle ${carte.su} enregistrée.`)
      setVersion((v) => v + 1)
    } catch (err) {
      throw new Error(messageErreur(err, "Erreur lors de l'enregistrement de la position."), { cause: err })
    }
  }

  // Bouton "Carte" d'une ligne du tableau
  const boutonCarte = (p) => (
    <Button taille="sm" variante="secondaire" icon={aPosition(p) ? Satellite : MapPin} onClick={() => setCarte(p)}
      title={aPosition(p) ? "Voir la parcelle sur la carte (satellite / plan)" : "Parcelle non localisée"}>
      {aPosition(p) ? "Carte" : peutAjouter && p.statut !== "vendue" ? "Localiser" : "Carte"}
    </Button>
  )

  // Nombre de dossiers que l'admin doit encore contrôler
  const nbAVerifier = parcelles.filter((p) => p.verification === "en_attente").length

  // Admin : lance le réseau de neurones sur tous les dossiers en attente
  const [analyseIA, setAnalyseIA] = useState(false)
  const authentifierTout = async () => {
    setErreur("")
    setSucces("")
    setAnalyseIA(true)
    try {
      const { data } = await api.post("/parcelles/authentifier_en_attente/")
      setSucces(
        `Réseau de neurones : ${data.analyses} dossier(s) analysé(s) — ${data.authentique} authentique(s) (vérifiés), `
        + `${data.douteux} douteux, ${data.falsifie} probablement falsifié(s), ${data.introuvable} absent(s) du registre. `
        + "Ouvrez les dossiers restants pour décider."
      )
      setVersion((v) => v + 1)
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de l'authentification par l'IA."))
    }
    setAnalyseIA(false)
  }

  // Applique les filtres (statut, vérification) et la recherche
  const parcellesFiltrees = parcelles.filter((p) => {
    if (filtreStatut !== "tous" && p.statut !== filtreStatut) return false // mauvais statut
    if (filtreVerification !== "toutes" && p.verification !== filtreVerification) return false
    if (!recherche) return true // pas de recherche : on garde la parcelle
    // Recherche dans le SU, la zone, le propriétaire et la nature (sans tenir compte des majuscules)
    return `${p.su} ${p.zone} ${p.proprietaire_nom} ${p.nature}`.toLowerCase().includes(recherche.toLowerCase())
  })

  return (
    <Layout titre="Parcelles">
      {/* En-tête : titre et description selon le rôle, bouton d'ajout pour vendeur/admin */}
      <PageHeader
        icon={LandPlot}
        titre={role === "vendeur" ? "Mes parcelles" : "Parcelles"}
        description={
          role === "vendeur"
            ? "Les parcelles dont vous êtes propriétaire."
            : role === "acheteur"
              ? "Parcelles disponibles à l'achat et celles de vos transactions."
              : "Toutes les parcelles enregistrées au cadastre."
        }
        actions={
          peutAjouter && (
            <Button
              icon={afficherFormulaire ? X : Plus}
              variante={afficherFormulaire ? "secondaire" : "primaire"}
              onClick={() => { setAfficherFormulaire(!afficherFormulaire); setErreur("") }}
              aria-expanded={afficherFormulaire}
            >
              {afficherFormulaire ? "Fermer le formulaire" : "Nouvelle parcelle"}
            </Button>
          )
        }
      />

      {/* Messages de succès et d'erreur */}
      {succes && <Alert type="succes" onClose={() => setSucces("")} className="mb-4">{succes}</Alert>}
      {erreur && <Alert type="erreur" onClose={() => setErreur("")} className="mb-4">{erreur}</Alert>}
      {/* Rappel pour l'admin : dossiers en attente de contrôle */}
      {role === "admin" && nbAVerifier > 0 && filtreVerification !== "en_attente" && (
        <Alert type="attention" className="mb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span><b>{nbAVerifier} parcelle(s) à vérifier.</b> Elles ne sont pas visibles par les acheteurs tant que leurs pièces ne sont pas authentifiées.</span>
            <div className="flex flex-wrap gap-2">
              <Button taille="sm" icon={BrainCircuit} chargement={analyseIA} onClick={authentifierTout}>Lancer l'authentification IA</Button>
              <Button taille="sm" variante="secondaire" icon={FolderOpen} onClick={() => setFiltreVerification("en_attente")}>Voir les dossiers</Button>
            </div>
          </div>
        </Alert>
      )}

      {/* Formulaire d'ajout (apparaît et disparaît avec une animation) */}
      <AnimatePresence>
        {afficherFormulaire && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <Card titre="Enregistrer une parcelle" icon={Plus}>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Section 1 : identification de la parcelle */}
                <fieldset>
                  <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-marine-800">
                    <MapPin className="size-4" aria-hidden /> Identification
                  </legend>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Numéro SU" htmlFor="su" requis>
                      <input id="su" name="su" value={form.su} onChange={maj} required placeholder="ex : SU:63251" className="champ" />
                    </Field>
                    {/* Liste des lotissements fournie par le modèle IA */}
                    <Field label="Lotissement" htmlFor="zone" requis>
                      <select id="zone" name="zone" value={form.zone} onChange={maj} required className="champ">
                        <option value="">— Choisir —</option>
                        {zones.map((z) => <option key={z} value={z}>{capitaliser(z)}</option>)}
                      </select>
                    </Field>
                    <Field label="Usage" htmlFor="usage">
                      <select id="usage" name="usage" value={form.usage} onChange={maj} className="champ">
                        {Object.entries(USAGES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    </Field>
                    {/* Nature du titre, avec des suggestions (datalist) */}
                    <Field label="Nature du titre" htmlFor="nature" requis aide="Un certificat est considéré par l'IA comme une zone équipée.">
                      <input id="nature" name="nature" list="natures" value={form.nature} onChange={maj} required placeholder="ex : certificat d'enregistrement" className="champ" />
                      <datalist id="natures">
                        <option value="certificat d'enregistrement" />
                        <option value="contrat de location" />
                        <option value="fiche parcellaire" />
                      </datalist>
                    </Field>
                    <Field label="Titre foncier" htmlFor="titre_foncier" className="md:col-span-2">
                      <input id="titre_foncier" name="titre_foncier" value={form.titre_foncier} onChange={maj} className="champ" placeholder="Référence du titre (optionnel)" />
                    </Field>
                  </div>
                </fieldset>

                {/* Section 2 : superficie cadastrale */}
                <fieldset>
                  <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-marine-800">
                    <Ruler className="size-4" aria-hidden /> Superficie
                  </legend>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <Field label="Hectares" htmlFor="ha">
                      <input id="ha" type="number" min="0" name="superficie_ha" value={form.superficie_ha} onChange={maj} className="champ" />
                    </Field>
                    <Field label="Ares" htmlFor="ares" requis>
                      <input id="ares" type="number" min="0" name="superficie_ares" value={form.superficie_ares} onChange={maj} required className="champ" />
                    </Field>
                    <Field label="Centiares" htmlFor="ca" requis>
                      <input id="ca" type="number" min="0" name="superficie_ca" value={form.superficie_ca} onChange={maj} required className="champ" />
                    </Field>
                    <Field label="% de centiare" htmlFor="pct">
                      <input id="pct" type="number" min="0" max="99" name="superficie_pourcent" value={form.superficie_pourcent} onChange={maj} className="champ" />
                    </Field>
                  </div>
                  {/* Superficie convertie en m², mise à jour pendant la saisie */}
                  <p className="mt-2 text-sm text-slate-500">
                    Soit <b className="text-slate-800">{superficieM2.toLocaleString("fr-FR")} m²</b> (valeur utilisée par le modèle IA).
                  </p>
                </fieldset>

                {/* Section 3 : prix */}
                <fieldset>
                  <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-marine-800">
                    <Coins className="size-4" aria-hidden /> Valeur
                  </legend>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label="Prix réel ($)" htmlFor="prix" requis aide="Prix de votre choix : l'IA vous propose un prix estimé, que vous pouvez reprendre ou non.">
                      <input id="prix" type="number" min="0" step="any" name="prix_reel" value={form.prix_reel} onChange={maj} required
                        className="champ" />
                    </Field>
                    {/* Estimation en direct et prix proposé par le système */}
                    <div role="status" className={`rounded-xl border p-3 text-sm ${
                      prixEloigne ? "border-amber-200 bg-amber-50" : ecartPrix !== null ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                      {!(superficieM2 > 0) || !form.zone ? (
                        <p className="text-slate-500">Renseignez la superficie et le lotissement : l'IA estimera le prix.</p>
                      ) : estimationActuelle === undefined ? (
                        <p className="text-slate-500">Estimation en cours...</p>
                      ) : estimationActuelle === null ? (
                        <p className="text-slate-500">Lotissement inconnu du modèle IA : pas de prix proposé.</p>
                      ) : (
                        <>
                          <p className="flex items-center gap-1.5 text-slate-700">
                            <BrainCircuit className="size-4 text-violet-600" aria-hidden />
                            Prix proposé par l'IA : <b>{formatMontant(estimationActuelle)}</b>
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Vous restez libre de fixer le prix de votre choix.
                          </p>
                          {prixEloigne ? (
                            <div className="mt-2">
                              <p className="font-medium text-amber-700">
                                Votre prix s'écarte de {ecartPrix > 0 ? "+" : ""}{Math.round(ecartPrix * 100)} % de l'estimation : il sera tout de même accepté.
                              </p>
                              <Button type="button" taille="sm" variante="secondaire" icon={Check} className="mt-1.5" onClick={utiliserPrixPropose}>
                                Utiliser le prix proposé ({formatMontant(Math.round(estimationActuelle))})
                              </Button>
                            </div>
                          ) : ecartPrix !== null ? (
                            <p className="mt-1 font-medium text-emerald-700">Prix proche de l'estimation (écart de {ecartPrix > 0 ? "+" : ""}{Math.round(ecartPrix * 100)} %).</p>
                          ) : (
                            !form.prix_reel && (
                              <Button type="button" taille="sm" variante="secondaire" icon={Check} className="mt-1.5" onClick={utiliserPrixPropose}>
                                Utiliser ce prix
                              </Button>
                            )
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </fieldset>

                {/* Section 4 : position réelle de la parcelle */}
                <fieldset>
                  <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-marine-800">
                    <IconeCarte className="size-4" aria-hidden /> Localisation de la parcelle
                  </legend>
                  <p className="mb-3 text-xs text-slate-500">
                    Placez la parcelle sur l'image satellite, ou tenez-vous sur le terrain et touchez « Ma position GPS ».
                    Tracez si possible le contour (les bornes) : les acheteurs et l'administrateur verront la parcelle exacte.
                  </p>
                  <SelecteurPosition valeur={position} onChange={setPosition} superficieDeclaree={superficieM2} />
                </fieldset>

                {/* Section 5 : pièces justificatives (obligatoires) */}
                <fieldset>
                  <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-marine-800">
                    <FolderOpen className="size-4" aria-hidden /> Pièces justificatives
                    <span className="text-rdc-rouge" aria-hidden>*</span>
                  </legend>
                  <p className="mb-3 text-xs text-slate-500">
                    Photographiez ou filmez le document original de la parcelle (certificat d'enregistrement, contrat de location,
                    fiche parcellaire...) ou choisissez-le dans votre galerie. Seuls vous et l'administrateur pouvez voir ces
                    pièces : elles servent à vérifier l'authenticité du bien. Photos, vidéos ou PDF, 50 Mo maximum par fichier.
                  </p>
                  <SelecteurFichiers onAjout={(nouveaux) => setFichiers((liste) => [...liste, ...nouveaux])} desactive={envoi} />
                  <FichiersChoisis fichiers={fichiers} onRetirer={(i) => setFichiers((liste) => liste.filter((_, j) => j !== i))} />
                </fieldset>

                {/* Boutons du formulaire */}
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
                  {!aPosition(position) && <span className="mr-auto self-center text-xs text-amber-700">Parcelle non localisée (vous pourrez l'ajouter plus tard).</span>}
                  <Button type="button" variante="secondaire" onClick={() => setAfficherFormulaire(false)}>Annuler</Button>
                  <Button type="submit" icon={Save} chargement={envoi}>Enregistrer la parcelle</Button>
                </div>
              </form>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Liste des parcelles */}
      <Card padding={false}>
        {/* Barre de recherche et filtre par statut */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher par SU, lotissement, propriétaire..."
              aria-label="Rechercher une parcelle"
              className="champ pl-9"
            />
          </div>
          <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="champ sm:w-52" aria-label="Filtrer par statut">
            <option value="tous">Tous les statuts</option>
            <option value="disponible">Disponibles</option>
            <option value="en_negociation">En négociation</option>
            <option value="vendue">Vendues</option>
          </select>
          {/* Filtre par état de vérification (l'acheteur ne voit que des parcelles vérifiées) */}
          {peutAjouter && (
            <select value={filtreVerification} onChange={(e) => setFiltreVerification(e.target.value)} className="champ sm:w-52" aria-label="Filtrer par vérification">
              <option value="toutes">Toutes les vérifications</option>
              <option value="en_attente">À vérifier</option>
              <option value="verifiee">Vérifiées</option>
              <option value="rejetee">Rejetées</option>
            </select>
          )}
          {/* Bascule tableau / carte d'ensemble */}
          <div className="inline-flex shrink-0 rounded-lg border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="Affichage">
            {[["liste", List, "Liste"], ["carte", IconeCarte, "Carte"]].map(([v, Icone, l]) => (
              <button key={v} onClick={() => setAffichage(v)} aria-pressed={affichage === v}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium ${affichage === v ? "bg-marine-700 text-white" : "text-slate-600"}`}>
                <Icone className="size-4" aria-hidden /> {l}
              </button>
            ))}
          </div>
        </div>

        {/* Chargement, liste vide ou tableau */}
        {loading ? (
          <Chargement texte="Chargement des parcelles..." />
        ) : affichage === "carte" ? (
          <div>
            <CarteParcelles parcelles={parcellesFiltrees} onChoisir={setCarte} />
            <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              <span>{parcellesFiltrees.filter(aPosition).length} parcelle(s) localisée(s) sur {parcellesFiltrees.length}</span>
              <span><b className="text-emerald-600">■</b> Vérifiée</span>
              <span><b className="text-amber-600">■</b> À vérifier</span>
              <span><b className="text-red-600">■</b> Rejetée</span>
              <span><b className="text-slate-500">■</b> Vendue</span>
              <span>Cliquez sur une parcelle pour l'ouvrir.</span>
            </p>
          </div>
        ) : parcellesFiltrees.length === 0 ? (
          <EmptyState
            icon={LandPlot}
            titre={parcelles.length === 0 ? "Aucune parcelle enregistrée" : "Aucun résultat"}
            texte={parcelles.length === 0 ? (peutAjouter ? "Commencez par enregistrer votre première parcelle." : "Aucune parcelle n'est disponible pour le moment.") : "Modifiez la recherche ou le filtre."}
            action={parcelles.length === 0 && peutAjouter && (
              <Button icon={Plus} onClick={() => setAfficherFormulaire(true)}>Nouvelle parcelle</Button>
            )}
          />
        ) : (
          // overflow-x-auto : le tableau défile horizontalement sur petit écran
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              {/* En-têtes (la colonne Propriétaire est masquée pour le vendeur, Actions pour l'acheteur) */}
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Parcelle</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Superficie</th>
                  {role !== "vendeur" && <th scope="col" className="px-4 py-3 font-semibold">Propriétaire</th>}
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Prix réel</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Estimation IA</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              {/* Une ligne par parcelle */}
              <tbody className="divide-y divide-slate-100">
                {parcellesFiltrees.map((p) => (
                  <tr key={p.id} className="transition hover:bg-marine-50/50">
                    {/* SU, lotissement et usage */}
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1 font-semibold text-slate-900">
                        {p.su}
                        {aPosition(p) && <MapPin className="size-3.5 text-emerald-600" aria-label="Parcelle localisée" />}
                      </p>
                      <p className="text-xs text-slate-500">{capitaliser(p.zone)} · {USAGES[p.usage] || p.usage}</p>
                    </td>
                    {/* Superficie en m² et en ares/centiares */}
                    <td className="whitespace-nowrap px-4 py-3">
                      <p>{p.superficie_m2?.toLocaleString("fr-FR")} m²</p>
                      <p className="text-xs text-slate-500">{p.superficie_ares} a {p.superficie_ca} ca</p>
                    </td>
                    {role !== "vendeur" && <td className="px-4 py-3">{p.proprietaire_nom}</td>}
                    {/* Prix réel : champ de saisie en mode édition, sinon montant ; mention si prix anormal */}
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                      {p.id in prixEdition ? (
                        // Entrée pour enregistrer, Échap pour annuler
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min="1"
                            step="any"
                            value={prixEdition[p.id]}
                            onChange={(e) => setPrixEdition({ ...prixEdition, [p.id]: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") enregistrerPrix(p)
                              if (e.key === "Escape") annulerPrix(p.id)
                            }}
                            aria-label={`Nouveau prix de ${p.su}`}
                            autoFocus
                            className="champ w-28 py-1.5 text-right"
                          />
                          <button onClick={() => enregistrerPrix(p)} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" aria-label="Enregistrer le prix">
                            <Check className="size-4" />
                          </button>
                          <button onClick={() => annulerPrix(p.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Annuler">
                            <X className="size-4" />
                          </button>
                        </div>
                      ) : formatMontant(p.prix_reel)}
                      {p.analyse_ia?.prix_suspect && (
                        <span className="mt-0.5 flex items-center justify-end gap-1 text-xs font-medium text-red-600" title="Prix jugé anormal par l'Isolation Forest">
                          <TriangleAlert className="size-3.5" aria-hidden /> Prix anormal
                        </span>
                      )}
                    </td>
                    {/* Prix estimé par l'IA */}
                    <td className="whitespace-nowrap px-4 py-3 text-right text-violet-700">
                      <span className="inline-flex items-center gap-1">
                        <BrainCircuit className="size-3.5" aria-hidden />
                        {formatMontant(p.prix_estime)}
                      </span>
                    </td>
                    {/* Statut de vente + état de la vérification (et motif en cas de rejet) */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <StatutBadge statut={p.statut} />
                        <StatutBadge statut={p.verification} />
                        {p.verification === "verifiee" && p.verifie_par && (
                          <span className="text-[11px] text-slate-500">{p.verifie_par === "admin" ? "par l'administrateur" : "par le réseau de neurones"}</span>
                        )}
                        {p.verification === "rejetee" && p.motif_rejet && (
                          <span className="max-w-48 text-xs text-red-600" title={p.motif_rejet}>{p.motif_rejet}</span>
                        )}
                      </div>
                    </td>
                    {/* Acheteur : discuter du prix avec le vendeur */}
                    {!peutAjouter && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {boutonCarte(p)}
                          <Button taille="sm" variante="secondaire" icon={MessagesSquare} chargement={actionEnCours === p.id} onClick={() => discuter(p)}>
                            Discuter
                          </Button>
                        </div>
                      </td>
                    )}
                    {/* Actions du propriétaire / de l'admin */}
                    {peutAjouter && (
                      <td className="px-4 py-3">
                        {p.statut === "vendue" ? (
                          // Parcelle vendue : seules les pièces restent consultables
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button taille="sm" variante="secondaire" icon={FolderOpen} onClick={() => setDossier(p)}>
                              Pièces ({p.nb_documents})
                            </Button>
                            {boutonCarte(p)}
                            <span className="inline-flex items-center gap-1 text-xs text-slate-400" title="Vente validée et enregistrée sur la blockchain">
                              <Lock className="size-3.5" aria-hidden /> Définitive
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {/* Ouvre le dossier : pièces justificatives et, pour l'admin, la vérification */}
                            <Button
                              taille="sm"
                              variante={role === "admin" && p.verification === "en_attente" ? "primaire" : "secondaire"}
                              icon={FolderOpen}
                              onClick={() => setDossier(p)}
                            >
                              {role === "admin" && p.verification === "en_attente" ? "Vérifier" : "Pièces"} ({p.nb_documents})
                            </Button>
                            {boutonCarte(p)}
                            {/* Basculer entre "disponible" et "en négociation" */}
                            {p.statut === "disponible" ? (
                              <Button
                                taille="sm"
                                variante="secondaire"
                                icon={Hourglass}
                                chargement={actionEnCours === p.id}
                                onClick={() => modifierParcelle(p, { statut: "en_negociation" }, `Parcelle ${p.su} mise en négociation : elle n'est plus proposée aux acheteurs.`)}
                                title="Retirer temporairement la parcelle des offres"
                              >
                                En négociation
                              </Button>
                            ) : (
                              <Button
                                taille="sm"
                                variante="secondaire"
                                icon={RefreshCw}
                                chargement={actionEnCours === p.id}
                                onClick={() => modifierParcelle(p, { statut: "disponible" }, `Parcelle ${p.su} de nouveau disponible à la vente.`)}
                              >
                                Remettre disponible
                              </Button>
                            )}
                            {/* Ouvre l'édition du prix */}
                            {!(p.id in prixEdition) && (
                              <Button taille="sm" variante="discret" icon={PencilLine} onClick={() => setPrixEdition({ ...prixEdition, [p.id]: p.prix_reel })}>
                                Prix
                              </Button>
                            )}
                            {/* Suppression avec confirmation */}
                            <ConfirmAction
                              label="Supprimer"
                              question="Supprimer ?"
                              icon={Trash2}
                              variante="danger"
                              sobre
                              chargement={actionEnCours === p.id}
                              onConfirm={() => supprimerParcelle(p)}
                            />
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Compteur de résultats */}
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              {parcellesFiltrees.length} parcelle(s) affichée(s) sur {parcelles.length}
            </p>
          </div>
        )}
      </Card>

      {/* Fenêtre du dossier d'une parcelle (pièces + vérification) ; la liste est rechargée après chaque changement */}
      {dossier && (
        <DossierParcelle parcelle={dossier} onClose={() => setDossier(null)} onChange={() => setVersion((v) => v + 1)} />
      )}
      {/* Fenêtre "Localisation" : satellite / plan ; le propriétaire (ou l'admin) peut corriger la position */}
      {carte && (
        <FenetreCarte
          parcelle={carte}
          peutModifier={peutAjouter && carte.statut !== "vendue"}
          onEnregistrer={enregistrerPosition}
          onClose={() => setCarte(null)}
        />
      )}
    </Layout>
  )
}
