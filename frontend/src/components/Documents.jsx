import { useEffect, useRef, useState } from "react" // hooks React : effets, références et état local
// Icônes de la bibliothèque lucide-react
import {
  Camera, Video, Images, FileText, Image as IconeImage, X, Trash2, ShieldCheck, ShieldX, FolderOpen, ExternalLink,
} from "lucide-react"
import { Alert, Button, Chargement, ConfirmAction, EmptyState, StatutBadge } from "./ui" // composants d'interface
import api, { messageErreur, capitaliser } from "../api" // client HTTP et fonctions utilitaires

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
      setRejetOuvert(false)
      setMotif("")
      onChange()
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de l'enregistrement de la décision."))
    }
    setDecision(false)
  }

  // Le vendeur ne peut plus retirer de pièce une fois la parcelle vérifiée ; il en faut toujours au moins une
  const peutSupprimer = admin || (verification !== "verifiee" && pieces.length > 1)
  const peutAjouter = parcelle.statut !== "vendue" || admin

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
            <div className="mt-2"><StatutBadge statut={verification} /></div>
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

        {/* Pied : décision de l'administrateur */}
        {admin && (
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
                <p className="text-xs text-slate-500">Comparez les pièces aux informations déclarées avant de décider.</p>
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
