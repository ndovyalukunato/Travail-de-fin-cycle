import { useState, useEffect } from "react" // hooks React : état local et effets
import { motion, AnimatePresence } from "framer-motion" // animations (ouverture/fermeture du formulaire)
// Icônes de la bibliothèque lucide-react
import {
  LandPlot, Plus, X, Save, Search, Ruler, MapPin, Coins, TriangleAlert, BrainCircuit, Hourglass, RefreshCw, PencilLine,
  Trash2, Check, Lock,
} from "lucide-react"
import Layout from "../components/Layout" // mise en page commune
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

  // Enregistrement d'une nouvelle parcelle
  const handleSubmit = async (e) => {
    e.preventDefault() // empêche le rechargement de la page
    setErreur("")
    setSucces("")
    setEnvoi(true)
    try {
      // Envoie le formulaire en convertissant les nombres
      const res = await api.post("/parcelles/", {
        ...form,
        superficie_ha: entier(form.superficie_ha),
        superficie_ares: entier(form.superficie_ares),
        superficie_ca: entier(form.superficie_ca),
        superficie_pourcent: entier(form.superficie_pourcent),
        prix_reel: parseFloat(form.prix_reel),
        statut: "disponible",
      })
      // Le backend renvoie la parcelle avec le prix estimé par l'IA
      setSucces(
        res.data.prix_estime
          ? `Parcelle ${res.data.su} enregistrée. Prix estimé par l'IA : ${formatMontant(res.data.prix_estime)}.`
          : `Parcelle ${res.data.su} enregistrée (zone inconnue du modèle IA : pas d'estimation).`
      )
      setForm(FORMULAIRE_VIDE) // vide le formulaire
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

  // Applique le filtre de statut et la recherche
  const parcellesFiltrees = parcelles.filter((p) => {
    if (filtreStatut !== "tous" && p.statut !== filtreStatut) return false // mauvais statut
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
                  <Field label="Prix réel ($)" htmlFor="prix" requis aide="Le prix estimé par l'IA sera calculé automatiquement après l'enregistrement." className="md:w-1/2">
                    <input id="prix" type="number" min="0" step="any" name="prix_reel" value={form.prix_reel} onChange={maj} required className="champ" />
                  </Field>
                </fieldset>

                {/* Boutons du formulaire */}
                <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
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
        </div>

        {/* Chargement, liste vide ou tableau */}
        {loading ? (
          <Chargement texte="Chargement des parcelles..." />
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
                  {peutAjouter && <th scope="col" className="px-4 py-3 font-semibold">Actions</th>}
                </tr>
              </thead>
              {/* Une ligne par parcelle */}
              <tbody className="divide-y divide-slate-100">
                {parcellesFiltrees.map((p) => (
                  <tr key={p.id} className="transition hover:bg-marine-50/50">
                    {/* SU, lotissement et usage */}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{p.su}</p>
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
                    <td className="px-4 py-3"><StatutBadge statut={p.statut} /></td>
                    {/* Actions du propriétaire / de l'admin */}
                    {peutAjouter && (
                      <td className="px-4 py-3">
                        {p.statut === "vendue" ? (
                          // Parcelle vendue : plus aucune action possible
                          <span className="inline-flex items-center gap-1 text-xs text-slate-400" title="Vente validée et enregistrée sur la blockchain">
                            <Lock className="size-3.5" aria-hidden /> Définitive
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
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
    </Layout>
  )
}
