import { useEffect, useRef, useState } from "react" // hooks React : effets, références et état local
// Icônes de la bibliothèque lucide-react
import {
  Camera, Video, Images, FileText, Image as IconeImage, X, Trash2, ShieldCheck, ShieldX, FolderOpen, ExternalLink,
  CircleCheck, CircleX, RefreshCw, BrainCircuit,
} from "lucide-react"
import { Alert, Button, Chargement, ConfirmAction, EmptyState, StatutBadge } from "./ui" // composants d'interface
import api, { messageErreur, capitaliser, urlFichier } from "../api" // client HTTP et fonctions utilitaires

// Taille maximale d'une pièce (doit correspondre à TAILLE_MAX_DOCUMENT dans settings.py)
const TAILLE_MAX_MO = 50

// Icône selon la nature du fichier
const iconeFichier = (type = "") => (type.startsWith("image") || type === "photo" ? IconeImage : type.startsWith("video") ? Video : FileText)

// Affiche une taille lisible : 1536000 -> "1,5 Mo"
const tailleLisible = (octets) =>
  octets >= 1024 * 1024
    ? `${(octets / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`
    : `${Math.max(1, Math.round(octets / 1024))} Ko`

// ----------------------------------------------------------------
// Boutons d'ajout de pièces : appareil photo, caméra ou galerie
// ----------------------------------------------------------------
// Sur téléphone, l'attribut "capture" ouvre directement l'appareil photo ;
// sur ordinateur, les trois boutons ouvrent le sélecteur de fichiers.
export function SelecteurFichiers({ onAjout, desactive = false }) {
  const refPhoto = useRef(null) // champ caché "prendre une photo"
  const refVideo = useRef(null) // champ caché "filmer"
  const refGalerie = useRef(null) // champ caché "galerie / fichiers"
  const [erreur, setErreur] = useState("") // fichier refusé (trop volumineux)

  // Transmet les fichiers choisis, en écartant ceux qui dépassent la taille maximale
  const choisir = (e) => {
    const choisis = Array.from(e.target.files || [])
    e.target.value = "" // permet de re-sélectionner le même fichier ensuite
    const tropGros = choisis.filter((f) => f.size > TAILLE_MAX_MO * 1024 * 1024)
    setErreur(tropGros.length ? `Trop volumineux (max ${TAILLE_MAX_MO} Mo) : ${tropGros.map((f) => f.name).join(", ")}` : "")
    const acceptes = choisis.filter((f) => !tropGros.includes(f))
    if (acceptes.length) onAjout(acceptes)
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variante="secondaire" icon={Camera} disabled={desactive} onClick={() => refPhoto.current.click()}>
          Prendre une photo
        </Button>
        <Button type="button" variante="secondaire" icon={Video} disabled={desactive} onClick={() => refVideo.current.click()}>
          Filmer une vidéo
        </Button>
        <Button type="button" variante="secondaire" icon={Images} disabled={desactive} onClick={() => refGalerie.current.click()}>
          Choisir dans la galerie
        </Button>
      </div>
      {/* Champs de fichier cachés, déclenchés par les boutons ci-dessus */}
      <input ref={refPhoto} type="file" accept="image/*" capture="environment" onChange={choisir} className="hidden" />
      <input ref={refVideo} type="file" accept="video/*" capture="environment" onChange={choisir} className="hidden" />
      <input ref={refGalerie} type="file" accept="image/*,video/*,application/pdf" multiple onChange={choisir} className="hidden" />
      {erreur && <p className="mt-2 text-xs font-medium text-red-600" role="alert">{erreur}</p>}
    </div>
  )
}

// Liste des fichiers choisis mais pas encore envoyés (formulaire d'ajout de parcelle)
export function FichiersChoisis({ fichiers, onRetirer }) {
  if (fichiers.length === 0) return null
  return (
    <ul className="mt-3 space-y-1.5">
      {fichiers.map((f, i) => {
        const Icone = iconeFichier(f.type)
        return (
          <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <Icone className="size-4 shrink-0 text-marine-600" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-slate-700">{f.name}</span>
            <span className="shrink-0 text-xs text-slate-500">{tailleLisible(f.size)}</span>
            <button type="button" onClick={() => onRetirer(i)} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label={`Retirer ${f.name}`}>
              <X className="size-4" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ----------------------------------------------------------------
// Aperçu d'une pièce enregistrée
// ----------------------------------------------------------------
// Le fichier est protégé : on le télécharge avec le token JWT, puis on l'affiche
// à partir d'une adresse locale temporaire (URL.createObjectURL).
function Piece({ document: piece, peutSupprimer, onSupprimer, suppression }) {
  const [url, setUrl] = useState(null) // adresse locale du fichier téléchargé
  const [erreur, setErreur] = useState(false)

  useEffect(() => {
    let adresse = null
    let actif = true // évite de modifier l'état si le composant a disparu entre-temps
    api.get(`/documents/${piece.id}/fichier/`, { responseType: "blob" })
      .then((res) => {
        if (!actif) return
        adresse = URL.createObjectURL(res.data)
        setUrl(adresse)
      })
      .catch(() => actif && setErreur(true))
    // Nettoyage : libère la mémoire occupée par le fichier
    return () => {
      actif = false
      if (adresse) URL.revokeObjectURL(adresse)
    }
  }, [piece.id])

  return (
    <li className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* Zone d'aperçu : image, lecteur vidéo ou lien vers le PDF */}
      <div className="flex min-h-40 items-center justify-center bg-slate-100">
        {erreur ? (
          <p className="p-4 text-sm text-red-600">Fichier introuvable sur le serveur.</p>
        ) : !url ? (
          <Chargement texte="Chargement de la pièce..." />
        ) : piece.type === "photo" ? (
          <a href={url} target="_blank" rel="noreferrer" title="Ouvrir en grand">
            <img src={url} alt={piece.nom} className="max-h-80 w-full object-contain" />
          </a>
        ) : piece.type === "video" ? (
          <video src={url} controls className="max-h-80 w-full" />
        ) : (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 p-6 text-sm font-semibold text-marine-700 hover:underline">
            <FileText className="size-6" aria-hidden /> Ouvrir le document PDF <ExternalLink className="size-4" aria-hidden />
          </a>
        )}
      </div>
      {/* Nom, date de dépôt et suppression */}
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-800" title={piece.nom}>{piece.nom}</p>
          <p className="text-xs text-slate-500">Déposée le {new Date(piece.created_at).toLocaleDateString("fr-FR")}</p>
        </div>
        {peutSupprimer && (
          <ConfirmAction label="Retirer" question="Retirer ?" icon={Trash2} variante="danger" sobre chargement={suppression} onConfirm={onSupprimer} />
        )}
      </div>
    </li>
  )
}

// ----------------------------------------------------------------
// Dossier d'une parcelle : pièces justificatives + décision de l'admin
// ----------------------------------------------------------------
// - vendeur (propriétaire) : consulte ses pièces, en ajoute, en retire
// Rapport de l'authentification par le réseau de neurones (lancée par l'admin)
// admin : probabilité, valeurs déclarées / registre et influence de chaque indice ; vendeur : résultat seulement
function RapportVerification({ rapport, admin, onRelancer, relance }) {
  const [scan, setScan] = useState(null) // adresse locale de l'image du document officiel
  const [erreurScan, setErreurScan] = useState("")
  // Admin : affiche le scan du document du registre pour le comparer aux pièces du vendeur
  const basculerScan = async () => {
    if (scan) { URL.revokeObjectURL(scan); setScan(null); return }
    try {
      setScan(await urlFichier(`/documents-officiels/${rapport.document.id}/scan/`))
    } catch {
      setErreurScan("Scan du registre indisponible.")
    }
  }
  const styles = {
    authentique: { cls: "border-emerald-200 bg-emerald-50", titre: "Dossier authentique", ton: "text-emerald-700", barre: "bg-emerald-500" },
    douteux: { cls: "border-amber-200 bg-amber-50", titre: "Dossier douteux", ton: "text-amber-700", barre: "bg-amber-500" },
    falsifie: { cls: "border-red-200 bg-red-50", titre: "Dossier probablement falsifié", ton: "text-red-700", barre: "bg-red-500" },
    introuvable: { cls: "border-slate-200 bg-slate-50", titre: "Absent du registre officiel", ton: "text-slate-600", barre: "bg-slate-400" },
    // anciens rapports (vérification par règles, avant le réseau de neurones)
    conforme: { cls: "border-emerald-200 bg-emerald-50", titre: "Conforme (ancienne vérification)", ton: "text-emerald-700", barre: "bg-emerald-500" },
    non_conforme: { cls: "border-amber-200 bg-amber-50", titre: "Écarts (ancienne vérification)", ton: "text-amber-700", barre: "bg-amber-500" },
  }
  const st = rapport ? styles[rapport.resultat] || styles.introuvable : styles.introuvable
  const probabilite = rapport?.probabilite
  return (
    <section className={`rounded-xl border p-4 ${st.cls}`} aria-label="Authentification par réseau de neurones">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className={`flex flex-wrap items-center gap-2 text-sm font-semibold ${st.ton}`}>
            <BrainCircuit className="size-4" aria-hidden /> Authentification par réseau de neurones — {rapport ? st.titre : "pas encore lancée"}
          </p>
          {probabilite != null && (
            <div className="mt-2 max-w-sm">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Probabilité d'authenticité</span><b>{(probabilite * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %</b>
              </div>
              <div className="mt-1 h-2 rounded-full bg-white ring-1 ring-inset ring-slate-200" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(probabilite * 100)} aria-label="Probabilité d'authenticité">
                <div className={`h-2 rounded-full ${st.barre}`} style={{ width: `${Math.max(2, probabilite * 100)}%` }} />
              </div>
              {admin && rapport.seuils && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Authentique ≥ {rapport.seuils.authentique * 100} % · douteux entre {rapport.seuils.falsifie * 100} et {rapport.seuils.authentique * 100} % · falsifié &lt; {rapport.seuils.falsifie * 100} %
                </p>
              )}
            </div>
          )}
          {rapport && <p className="mt-2 text-xs text-slate-600">{rapport.message}</p>}
          {!rapport && admin && (
            <p className="mt-1 text-xs text-slate-600">
              Lancez l'analyse : le réseau compare le dossier au registre officiel et à la photo du titre authentique, puis donne une probabilité d'authenticité.
            </p>
          )}
          {rapport?.document && admin && <p className="mt-0.5 text-xs text-slate-500">Document du registre : <b>{rapport.document.numero}</b></p>}
        </div>
        {admin && (
          <div className="flex flex-wrap gap-1.5">
            {rapport?.document?.a_scan && (
              <Button taille="sm" variante="secondaire" icon={FileText} onClick={basculerScan}>
                {scan ? "Masquer le document officiel" : "Voir le document officiel"}
              </Button>
            )}
            <Button taille="sm" variante={rapport ? "secondaire" : "primaire"} icon={rapport ? RefreshCw : BrainCircuit} chargement={relance} onClick={onRelancer}>
              {rapport ? "Relancer l'analyse" : "Lancer l'authentification IA"}
            </Button>
          </div>
        )}
      </div>
      {rapport?.controles?.length > 0 && (
        <div className="mt-3 overflow-x-auto rounded-lg bg-white ring-1 ring-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">Contrôle</th>
                {admin && <th scope="col" className="px-3 py-2 font-semibold">Déclaré par le vendeur</th>}
                {admin && <th scope="col" className="px-3 py-2 font-semibold">Registre officiel</th>}
                <th scope="col" className="px-3 py-2 font-semibold">Résultat</th>
                {admin && probabilite != null && <th scope="col" className="px-3 py-2 font-semibold" title="Gain de probabilité si cet indice était parfait">Poids dans le doute</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rapport.controles.map((c) => (
                <tr key={c.critere}>
                  <td className="px-3 py-2 font-medium text-slate-800">{c.critere}{!c.bloquant && <span className="ml-1 text-slate-400">(indicatif)</span>}</td>
                  {admin && <td className="px-3 py-2 text-slate-600">{c.declare}</td>}
                  {admin && <td className="px-3 py-2 text-slate-600">{c.attendu}</td>}
                  <td className="px-3 py-2">
                    {c.ok ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><CircleCheck className="size-3.5" aria-hidden /> Concorde</span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 font-semibold ${c.bloquant ? "text-red-700" : "text-amber-700"}`}>
                        <CircleX className="size-3.5" aria-hidden /> {c.bloquant ? "Écart" : "À compléter"}
                      </span>
                    )}
                  </td>
                  {admin && probabilite != null && (
                    <td className="px-3 py-2 text-slate-600">{c.impact >= 1 ? <b className="text-red-700">−{c.impact} pts</b> : "—"}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {erreurScan && <p className="mt-2 text-xs text-red-700">{erreurScan}</p>}
      {scan && (
        <figure className="mt-3 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          <a href={scan} target="_blank" rel="noreferrer" title="Ouvrir en grand">
            <img src={scan} alt={`Document officiel ${rapport.document.numero}`} className="max-h-[32rem] w-full object-contain" />
          </a>
          <figcaption className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-500">
            Document authentique du registre ({rapport.document.numero}) — comparez-le aux pièces déposées par le vendeur ci-dessous.
          </figcaption>
        </figure>
      )}
      {rapport && (
        <p className="mt-2 text-[11px] text-slate-500">
          Dernière analyse : {new Date(rapport.date).toLocaleString("fr-FR")}{admin && rapport.lance_par && ` — lancée par ${rapport.lance_par}`}
        </p>
      )}
    </section>
  )
}

// - admin : consulte les pièces puis déclare la parcelle vérifiée ou la rejette
export default function DossierParcelle({ parcelle, onClose, onChange }) {
  const role = localStorage.getItem("role") // rôle de l'utilisateur connecté
  const admin = role === "admin"

  const [pieces, setPieces] = useState([]) // pièces reçues du backend
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState("")
  const [envoi, setEnvoi] = useState(false) // ajout de pièces en cours
  const [suppression, setSuppression] = useState(null) // id de la pièce en cours de retrait
  const [verification, setVerification] = useState(parcelle.verification) // état du contrôle
  const [motifRejet, setMotifRejet] = useState(parcelle.motif_rejet || "") // motif affiché au vendeur
  const [rejetOuvert, setRejetOuvert] = useState(false) // champ "motif du rejet" affiché ?
  const [motif, setMotif] = useState("") // motif en cours de saisie
  const [decision, setDecision] = useState(false) // décision de l'admin en cours d'envoi
  const [rapport, setRapport] = useState(parcelle.rapport_verification) // rapport du réseau de neurones
  const [verifiePar, setVerifiePar] = useState(parcelle.verifie_par) // "ia" (réseau de neurones) ou "admin"
  const [relance, setRelance] = useState(false) // analyse par le réseau en cours

  // Charge les pièces à l'ouverture
  useEffect(() => {
    api.get(`/parcelles/${parcelle.id}/documents/`)
      .then((res) => setPieces(res.data))
      .catch((err) => setErreur(messageErreur(err, "Impossible de charger les pièces.")))
      .finally(() => setLoading(false))
  }, [parcelle.id])

  // La touche Échap ferme la fenêtre
  useEffect(() => {
    const surTouche = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", surTouche)
    return () => window.removeEventListener("keydown", surTouche)
  }, [onClose])

  // Envoi de nouvelles pièces (formulaire "multipart" : plusieurs fichiers dans le champ "documents")
  const ajouter = async (fichiers) => {
    setErreur("")
    setEnvoi(true)
    try {
      const donnees = new FormData()
      fichiers.forEach((f) => donnees.append("documents", f))
      const res = await api.post(`/parcelles/${parcelle.id}/documents/`, donnees)
      setPieces(res.data)
      // Le dossier a changé : l'ancien rapport du réseau est effacé, on relit la parcelle
      api.get(`/parcelles/${parcelle.id}/`).then((r) => {
        setRapport(r.data.rapport_verification)
        setVerification(r.data.verification)
        setVerifiePar(r.data.verifie_par)
      }).catch(() => {})
      // Après un rejet, de nouvelles pièces renvoient le dossier devant l'admin
      if (verification === "rejetee") {
        setVerification("en_attente")
        setMotifRejet("")
      }
      onChange()
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de l'envoi des pièces."))
    }
    setEnvoi(false)
  }

  // Retrait d'une pièce
  const retirer = async (piece) => {
    setErreur("")
    setSuppression(piece.id)
    try {
      await api.delete(`/documents/${piece.id}/`)
      setPieces((liste) => liste.filter((p) => p.id !== piece.id))
      onChange()
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors du retrait de la pièce."))
    }
    setSuppression(null)
  }

  // Décision de l'admin : "verifiee" ou "rejetee" (avec motif)
  const decider = async (choix) => {
    setErreur("")
    setDecision(true)
    try {
      const res = await api.post(`/parcelles/${parcelle.id}/verifier/`, { decision: choix, motif })
      setVerification(res.data.verification)
      setMotifRejet(res.data.motif_rejet)
      setVerifiePar(res.data.verifie_par)
      setRejetOuvert(false)
      setMotif("")
      onChange()
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de l'enregistrement de la décision."))
    }
    setDecision(false)
  }

  // Admin : lance le réseau de neurones sur ce dossier
  const relancer = async () => {
    setErreur("")
    setRelance(true)
    try {
      const res = await api.post(`/parcelles/${parcelle.id}/authentifier/`)
      setRapport(res.data.rapport_verification)
      setVerification(res.data.verification)
      setVerifiePar(res.data.verifie_par)
      onChange()
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de l'authentification par l'IA."))
    }
    setRelance(false)
  }

  // Le vendeur ne peut plus retirer de pièce une fois la parcelle vérifiée ; il en faut toujours au moins une
  // Parcelle inscrite sur la blockchain : dossier figé pour tous, administrateur compris
  const figee = parcelle.statut === "vendue" || Boolean(parcelle.hash_blockchain)
  const peutSupprimer = !figee && (admin || (verification !== "verifiee" && pieces.length > 1))
  const peutAjouter = !figee

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Dossier de la parcelle ${parcelle.su}`}>
      {/* Fond sombre : un clic dessus ferme la fenêtre */}
      <div className="absolute inset-0 bg-marine-950/60" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        {/* En-tête */}
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <FolderOpen className="size-5 text-marine-600" aria-hidden /> Dossier de la parcelle {parcelle.su}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {capitaliser(parcelle.zone)} · {parcelle.nature}
              {parcelle.titre_foncier && ` · Titre : ${parcelle.titre_foncier}`}
              {admin && ` · Propriétaire : ${parcelle.proprietaire_nom}`}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <StatutBadge statut={verification} />
              {verification !== "en_attente" && verifiePar && (
                <span className="text-xs text-slate-500">{verifiePar === "admin" ? "par l'administrateur" : "par le réseau de neurones"}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer">
            <X className="size-5" />
          </button>
        </header>

        {/* Corps (défile si le contenu est long) */}
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {erreur && <Alert type="erreur" onClose={() => setErreur("")}>{erreur}</Alert>}
          {verification === "rejetee" && (
            <Alert type="attention">
              <b>Dossier rejeté par l'administrateur.</b> Motif : {motifRejet || "non précisé"}.
              {!admin && " Ajoutez les pièces demandées : le dossier sera réexaminé."}
            </Alert>
          )}
          {(admin || rapport) && <RapportVerification rapport={rapport} admin={admin} onRelancer={relancer} relance={relance} />}
          {verification === "en_attente" && !admin && (
            <Alert type="info">
              En attente de vérification par l'administrateur. La parcelle sera proposée aux acheteurs une fois vérifiée.
            </Alert>
          )}

          {/* Pièces enregistrées */}
          {loading ? (
            <Chargement texte="Chargement des pièces..." />
          ) : pieces.length === 0 ? (
            <EmptyState icon={FolderOpen} titre="Aucune pièce justificative" texte="Aucun document n'a été déposé pour cette parcelle." />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {pieces.map((piece) => (
                <Piece
                  key={piece.id}
                  document={piece}
                  peutSupprimer={peutSupprimer}
                  suppression={suppression === piece.id}
                  onSupprimer={() => retirer(piece)}
                />
              ))}
            </ul>
          )}

          {/* Ajout de pièces */}
          {peutAjouter && (
            <div className="rounded-xl border border-dashed border-slate-300 p-4">
              <p className="mb-2 text-sm font-medium text-slate-700">Ajouter des pièces</p>
              <SelecteurFichiers onAjout={ajouter} desactive={envoi} />
              {envoi && <p className="mt-2 text-xs text-slate-500" role="status">Envoi en cours...</p>}
            </div>
          )}
        </div>

        {/* Pied : décision de l'administrateur (impossible sur une parcelle inscrite sur la blockchain) */}
        {admin && !figee && (
          <footer className="border-t border-slate-100 px-5 py-4">
            {rejetOuvert ? (
              <div className="space-y-2">
                <label htmlFor="motif" className="block text-sm font-medium text-slate-700">Motif du rejet (affiché au vendeur)</label>
                <input id="motif" value={motif} onChange={(e) => setMotif(e.target.value)} maxLength={255} autoFocus placeholder="ex : titre foncier illisible, nom différent du propriétaire..." className="champ" />
                <div className="flex justify-end gap-2">
                  <Button variante="secondaire" onClick={() => setRejetOuvert(false)}>Annuler</Button>
                  <Button variante="danger" icon={ShieldX} chargement={decision} disabled={decision || !motif.trim()} onClick={() => decider("rejetee")}>
                    Confirmer le rejet
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  {!rapport
                    ? "Lancez d'abord l'authentification IA, puis confirmez ou corrigez sa décision."
                    : rapport.resultat === "authentique"
                      ? "Le réseau de neurones a jugé le dossier authentique ; vous pouvez tout de même contrôler les pièces."
                      : rapport.resultat === "falsifie"
                        ? "Le réseau de neurones recommande le rejet : vérifiez les facteurs de doute avant de décider."
                        : "Décision manuelle : comparez les pièces aux informations déclarées avant de décider."}
                </p>
                <div className="flex gap-2">
                  {verification !== "rejetee" && (
                    <Button variante="secondaire" icon={ShieldX} className="text-red-700!" onClick={() => setRejetOuvert(true)}>Rejeter</Button>
                  )}
                  {verification !== "verifiee" && (
                    <Button variante="succes" icon={ShieldCheck} chargement={decision} disabled={decision || pieces.length === 0} onClick={() => decider("verifiee")}>
                      Déclarer authentique
                    </Button>
                  )}
                </div>
              </div>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
