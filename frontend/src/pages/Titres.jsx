import { useEffect, useState } from "react"
import {
  BookMarked, Plus, X, Save, Search, PencilLine, Trash2, MapPin, ShieldCheck, ShieldAlert, Ban, Info, Bot, FileImage, Upload,
} from "lucide-react"
import Layout from "../components/Layout"
import { Alert, Button, Card, Chargement, ConfirmAction, EmptyState, Field, PageHeader, StatutBadge } from "../components/ui"
import { SelecteurPosition } from "../components/Carte"
import { aPosition } from "../geo"
import api, { messageErreur, capitaliser } from "../api"

// ----------------------------------------------------------------
// Registre officiel des titres fonciers (table "documents") — administrateur.
// L'admin y recopie les informations des documents authentiques (livres de la
// Conservation des titres immobiliers). Le système compare ensuite chaque
// parcelle déclarée par un vendeur à ce registre et la vérifie automatiquement
// si tout concorde ; sinon, l'admin la vérifie lui-même.
// ----------------------------------------------------------------

const TYPES = {
  certificat: "Certificat d'enregistrement",
  contrat_location: "Contrat de location",
  fiche_parcellaire: "Fiche parcellaire",
  autre: "Autre",
}
const STATUTS = {
  valide: { label: "Valide", icon: ShieldCheck, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  litige: { label: "En litige", icon: ShieldAlert, cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  annule: { label: "Annulé", icon: Ban, cls: "bg-red-50 text-red-700 ring-red-200" },
}

const VIDE = {
  numero: "", type_document: "certificat", su: "", titulaire: "", zone: "", superficie_m2: "",
  volume: "", folio: "", date_delivrance: "", bureau: "Conservation des titres immobiliers de Goma", pv_bornage: "",
  latitude: null, longitude: null, statut: "valide", observations: "",
}

function BadgeStatut({ statut }) {
  const s = STATUTS[statut] || STATUTS.valide
  const Icone = s.icon
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${s.cls}`}>
      <Icone className="size-3.5" aria-hidden /> {s.label}
    </span>
  )
}

export default function Titres() {
  const [documents, setDocuments] = useState([])
  const [zones, setZones] = useState([])
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)
  const [form, setForm] = useState(null) // null = formulaire fermé ; sinon données (avec id en modification)
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState("")
  const [succes, setSucces] = useState("")
  const [recherche, setRecherche] = useState("")
  const [suppression, setSuppression] = useState(null)
  const [fichierScan, setFichierScan] = useState(null) // photo / PDF du document authentique à joindre
  const [apercu, setApercu] = useState(null) // { url, type, titre } : scan affiché en grand

  // Affiche le scan d'un document du registre (fichier protégé : téléchargé avec le token)
  const voirScan = async (d) => {
    setErreur("")
    try {
      const res = await api.get(`/documents-officiels/${d.id}/scan/`, { responseType: "blob" })
      setApercu({ url: URL.createObjectURL(res.data), type: res.data.type, titre: `${d.numero} — ${d.su}` })
    } catch (err) {
      setErreur(messageErreur(err, "Impossible d'afficher le scan."))
    }
  }
  const fermerApercu = () => { if (apercu) URL.revokeObjectURL(apercu.url); setApercu(null) }

  useEffect(() => {
    api.get("/documents-officiels/")
      .then((res) => setDocuments(res.data))
      .catch((e) => setErreur(messageErreur(e, "Impossible de charger le registre.")))
      .finally(() => setLoading(false))
  }, [version])

  useEffect(() => {
    api.get("/zones/").then((res) => setZones(res.data)).catch(() => {})
  }, [])

  const maj = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  const ouvrir = (doc = null) => {
    setErreur("")
    setSucces("")
    setForm(doc ? { ...VIDE, ...doc, date_delivrance: doc.date_delivrance || "" } : { ...VIDE })
    setFichierScan(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const enregistrer = async (e) => {
    e.preventDefault()
    setEnvoi(true)
    setErreur("")
    const donnees = {
      numero: form.numero.trim(), type_document: form.type_document, su: form.su.trim(), titulaire: form.titulaire.trim(),
      zone: form.zone, superficie_m2: form.superficie_m2, volume: form.volume, folio: form.folio,
      date_delivrance: form.date_delivrance || null, bureau: form.bureau, statut: form.statut, observations: form.observations,
      pv_bornage: form.pv_bornage,
      latitude: aPosition(form) ? form.latitude : null, longitude: aPosition(form) ? form.longitude : null,
    }
    try {
      const res = form.id
        ? await api.put(`/documents-officiels/${form.id}/`, donnees)
        : await api.post("/documents-officiels/", donnees)
      // Scan du document authentique (envoyé à part, en multipart)
      if (fichierScan) {
        const donneesScan = new FormData()
        donneesScan.append("scan", fichierScan)
        await api.post(`/documents-officiels/${res.data.id}/scan/`, donneesScan)
        setFichierScan(null)
      }
      const liees = res.data.parcelles_liees || []
      setSucces(
        `Document ${res.data.numero} ${form.id ? "modifié" : "ajouté au registre"}.`
        + (liees.length ? ` ${liees.length} parcelle(s) portant ce SU : relancez l'authentification IA depuis leur dossier.` : "")
      )
      setForm(null)
      setVersion((v) => v + 1)
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de l'enregistrement du document."))
    }
    setEnvoi(false)
  }

  const supprimer = async (doc) => {
    setSuppression(doc.id)
    setErreur("")
    try {
      await api.delete(`/documents-officiels/${doc.id}/`)
      setSucces(`Document ${doc.numero} retiré du registre.`)
      setVersion((v) => v + 1)
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de la suppression."))
    }
    setSuppression(null)
  }

  const filtres = documents.filter((d) =>
    `${d.numero} ${d.su} ${d.titulaire} ${d.zone}`.toLowerCase().includes(recherche.toLowerCase())
  )

  return (
    <Layout titre="Registre des titres">
      <PageHeader
        icon={BookMarked}
        titre="Registre officiel des titres"
        description="Documents authentiques servant de référence à la vérification automatique des parcelles."
        actions={!form && <Button icon={Plus} onClick={() => ouvrir()}>Nouveau document</Button>}
      />

      {succes && <Alert type="succes" onClose={() => setSucces("")} className="mb-4">{succes}</Alert>}
      {erreur && <Alert type="erreur" onClose={() => setErreur("")} className="mb-4">{erreur}</Alert>}

      <Alert type="info" className="mb-4">
        <span className="inline-flex items-start gap-1">
          <Bot className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Ce registre sert de référence au <b>réseau de neurones d'authentification</b>. Depuis le dossier d'une
            parcelle (ou la page Parcelles pour tous les dossiers en attente), vous lancez l'analyse : le réseau compare
            le dossier du vendeur à ce registre (SU, numéro du titre, titulaire, lotissement, nature, superficie, position,
            photo du titre / scan) et donne une probabilité d'authenticité. Joignez un <b>scan image</b> du document
            authentique pour permettre la comparaison visuelle. Modifier un document rend les analyses de ce SU périmées.
          </span>
        </span>
      </Alert>

      {form && (
        <Card titre={form.id ? `Modifier le document ${form.numero}` : "Ajouter un document au registre"} icon={form.id ? PencilLine : Plus} className="mb-6"
          actions={<button onClick={() => setForm(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Fermer"><X className="size-5" /></button>}>
          <form onSubmit={enregistrer} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field label="Numéro du document" htmlFor="numero" requis aide="Tel qu'inscrit sur le titre ; le vendeur le saisit comme « Titre foncier ».">
                <input id="numero" name="numero" value={form.numero} onChange={maj} required className="champ" placeholder="ex : CE 12345" />
              </Field>
              <Field label="Type de document" htmlFor="type_document" requis>
                <select id="type_document" name="type_document" value={form.type_document} onChange={maj} className="champ">
                  {Object.entries(TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="État du document" htmlFor="statut" requis>
                <select id="statut" name="statut" value={form.statut} onChange={maj} className="champ">
                  {Object.entries(STATUTS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Numéro SU de la parcelle" htmlFor="su" requis>
                <input id="su" name="su" value={form.su} onChange={maj} required className="champ" placeholder="ex : SU:63251" />
              </Field>
              <Field label="Titulaire (propriétaire inscrit)" htmlFor="titulaire" requis aide="Comparé au nom du compte du vendeur.">
                <input id="titulaire" name="titulaire" value={form.titulaire} onChange={maj} required className="champ" />
              </Field>
              <Field label="Lotissement" htmlFor="zone" requis>
                <input id="zone" name="zone" list="zones-registre" value={form.zone} onChange={maj} required className="champ" />
                <datalist id="zones-registre">{zones.map((z) => <option key={z} value={z}>{capitaliser(z)}</option>)}</datalist>
              </Field>
              <Field label="Superficie inscrite (m²)" htmlFor="superficie_m2" requis aide="1 are = 100 m²">
                <input id="superficie_m2" name="superficie_m2" type="number" min="0.01" step="any" value={form.superficie_m2} onChange={maj} required className="champ" />
              </Field>
              <Field label="Volume" htmlFor="volume">
                <input id="volume" name="volume" value={form.volume} onChange={maj} className="champ" />
              </Field>
              <Field label="Folio" htmlFor="folio">
                <input id="folio" name="folio" value={form.folio} onChange={maj} className="champ" />
              </Field>
              <Field label="Date de délivrance" htmlFor="date_delivrance">
                <input id="date_delivrance" name="date_delivrance" type="date" value={form.date_delivrance} onChange={maj} className="champ" />
              </Field>
              <Field label="PV de mesurage et bornage" htmlFor="pv_bornage">
                <input id="pv_bornage" name="pv_bornage" value={form.pv_bornage} onChange={maj} className="champ" placeholder="ex : 6214/2024" />
              </Field>
              <Field label="Scan du document authentique" htmlFor="scan" className="md:col-span-2"
                aide={form.a_scan && !fichierScan ? "Un scan est déjà enregistré ; choisissez un fichier pour le remplacer." : "Photo ou PDF du certificat (avec son croquis), visible par l'administrateur seulement."}>
                <label htmlFor="scan" className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
                  <Upload className="size-4 text-marine-600" aria-hidden />
                  {fichierScan ? fichierScan.name : form.a_scan ? "Remplacer le scan" : "Choisir une photo ou un PDF"}
                </label>
                <input id="scan" type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => setFichierScan(e.target.files[0] || null)} />
              </Field>
              <Field label="Bureau émetteur" htmlFor="bureau" className="md:col-span-3">
                <input id="bureau" name="bureau" value={form.bureau} onChange={maj} className="champ" />
              </Field>
              <Field label="Observations" htmlFor="observations" className="md:col-span-3">
                <textarea id="observations" name="observations" rows={2} value={form.observations} onChange={maj} className="champ" placeholder="Hypothèque, litige en cours, mutation..." />
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1 flex items-center gap-2 text-sm font-semibold text-marine-800">
                <MapPin className="size-4" aria-hidden /> Position de référence (facultative)
              </legend>
              <p className="mb-2 text-xs text-slate-500">Si elle est renseignée, la position déclarée par le vendeur doit se trouver à moins de 150 m.</p>
              <SelecteurPosition valeur={form} avecContour={false}
                onChange={(v) => setForm({ ...form, latitude: v.latitude, longitude: v.longitude })} />
            </fieldset>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variante="secondaire" onClick={() => setForm(null)}>Annuler</Button>
              <Button type="submit" icon={Save} chargement={envoi}>{form.id ? "Enregistrer les modifications" : "Ajouter au registre"}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card padding={false}>
        <div className="border-b border-slate-100 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)} className="champ pl-9"
              placeholder="Rechercher par numéro, SU, titulaire, lotissement..." aria-label="Rechercher un document" />
          </div>
        </div>
        {loading ? (
          <Chargement texte="Chargement du registre..." />
        ) : filtres.length === 0 ? (
          <EmptyState icon={BookMarked} titre={documents.length ? "Aucun résultat" : "Registre vide"}
            texte={documents.length ? "Modifiez la recherche." : "Ajoutez les documents authentiques : les parcelles correspondantes seront vérifiées automatiquement."}
            action={!documents.length && !form && <Button icon={Plus} onClick={() => ouvrir()}>Nouveau document</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Document</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Parcelle</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Titulaire</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Superficie</th>
                  <th scope="col" className="px-4 py-3 font-semibold">État</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Dossiers liés</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtres.map((d) => (
                  <tr key={d.id} className="align-top hover:bg-marine-50/50">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{d.numero}</p>
                      <p className="text-xs text-slate-500">{d.type_document_libelle}{d.volume && ` · Vol. ${d.volume}`}{d.folio && ` · F° ${d.folio}`}</p>
                      {d.date_delivrance && <p className="text-xs text-slate-400">Délivré le {new Date(d.date_delivrance).toLocaleDateString("fr-FR")}</p>}
                      {d.pv_bornage && <p className="text-xs text-slate-400">PV de bornage {d.pv_bornage}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1 font-semibold text-marine-800">
                        {d.su} {d.latitude && <MapPin className="size-3.5 text-emerald-600" aria-label="Position de référence renseignée" />}
                      </p>
                      <p className="text-xs text-slate-500">{capitaliser(d.zone)}</p>
                    </td>
                    <td className="px-4 py-3">{d.titulaire}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">{parseFloat(d.superficie_m2).toLocaleString("fr-FR")} m²</td>
                    <td className="px-4 py-3">
                      <BadgeStatut statut={d.statut} />
                      {d.observations && <p className="mt-1 max-w-48 text-xs text-slate-500" title={d.observations}><Info className="mr-0.5 inline size-3" aria-hidden />{d.observations}</p>}
                    </td>
                    <td className="px-4 py-3">
                      {d.parcelles_liees.length === 0 ? (
                        <span className="text-xs text-slate-400">Aucune parcelle déclarée</span>
                      ) : (
                        <ul className="space-y-1">
                          {d.parcelles_liees.map((p) => (
                            <li key={p.id} className="flex flex-wrap items-center gap-1 text-xs">
                              <span className="font-medium text-slate-700">{p.proprietaire}</span>
                              <StatutBadge statut={p.verification} />
                              {p.verification === "verifiee" && ["ia", "auto"].includes(p.verifie_par) && <Bot className="size-3.5 text-emerald-600" aria-label="authentifiée par le réseau de neurones" />}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {d.a_scan && <Button taille="sm" variante="secondaire" icon={FileImage} onClick={() => voirScan(d)}>Scan</Button>}
                        <Button taille="sm" variante="secondaire" icon={PencilLine} onClick={() => ouvrir(d)}>Modifier</Button>
                        <ConfirmAction label="Supprimer" question="Retirer du registre ?" icon={Trash2} variante="danger" sobre
                          chargement={suppression === d.id} onConfirm={() => supprimer(d)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">{filtres.length} document(s) sur {documents.length}</p>
          </div>
        )}
      </Card>

      {/* Scan du document authentique, affiché en grand */}
      {apercu && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Scan ${apercu.titre}`}>
          <div className="absolute inset-0 bg-marine-950/70" onClick={fermerApercu} />
          <div className="relative flex max-h-[94vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="flex items-center gap-2 font-semibold text-slate-900"><FileImage className="size-5 text-marine-600" aria-hidden /> {apercu.titre}</h2>
              <button onClick={fermerApercu} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer"><X className="size-5" /></button>
            </header>
            <div className="flex-1 overflow-auto bg-slate-50 p-3">
              {apercu.type === "application/pdf"
                ? <iframe src={apercu.url} title={apercu.titre} className="h-[80vh] w-full rounded-lg" />
                : <img src={apercu.url} alt={`Scan du document ${apercu.titre}`} className="mx-auto max-h-[82vh] object-contain" />}
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
