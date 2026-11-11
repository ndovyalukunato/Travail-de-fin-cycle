import { useEffect, useState } from "react"
// Leaflet : bibliothèque libre de cartes ; react-leaflet : composants React pour Leaflet
import { MapContainer, TileLayer, LayersControl, Marker, Polygon, Polyline, CircleMarker, Circle, Tooltip, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Crosshair, Search, Undo2, Trash2, Pentagon, MapPin, X, ExternalLink } from "lucide-react"
import { Button } from "./ui"
import { GOMA, couleurParcelle, aireContour, aPosition } from "../geo" // calculs géographiques

// ----------------------------------------------------------------
// Services cartographiques GRATUITS utilisés (aucune clé d'API) :
//  - OpenStreetMap        : plan des rues (fond "Plan")
//  - Esri World Imagery   : images satellite (fond "Satellite")
//  - Esri Reference       : noms des lieux superposés (fond "Hybride")
//  - Nominatim (OSM)      : recherche d'une adresse / d'un quartier
//  - API Geolocation du navigateur : position GPS réelle du téléphone
// ----------------------------------------------------------------

const ATTRIBUTION_OSM = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const ATTRIBUTION_ESRI = "Images &copy; Esri, Maxar, Earthstar Geographics"
const URL_SATELLITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
const URL_NOMS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"

// Marqueur en forme d'épingle (évite le problème des images d'icône Leaflet avec Vite)
const epingle = (couleur = "#134595") =>
  L.divIcon({
    className: "",
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    html: `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.3 0 0 6.2 0 13.9 0 24.3 14 40 14 40s14-15.7 14-26.1C28 6.2 21.7 0 14 0z" fill="${couleur}" stroke="white" stroke-width="2"/>
      <circle cx="14" cy="14" r="5" fill="white"/></svg>`,
  })




// Zoom maximal où Esri possède de vraies images sur Goma : au-delà (19, 20...), le serveur
// renvoie une tuile grise « Map data not yet available ». maxNativeZoom = 18 : quand
// l'utilisateur zoome plus, Leaflet agrandit les images du niveau 18 au lieu de les redemander.
const ZOOM_MAX_SATELLITE = 18

// Fonds de carte communs : Satellite (par défaut) ou Plan, + noms des lieux superposables
function FondsDeCarte({ defaut = "satellite" }) {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked={defaut === "satellite"} name="Satellite">
        <TileLayer url={URL_SATELLITE} attribution={ATTRIBUTION_ESRI} maxNativeZoom={ZOOM_MAX_SATELLITE} maxZoom={21} />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer checked={defaut === "plan"} name="Plan (OpenStreetMap)">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution={ATTRIBUTION_OSM} maxNativeZoom={19} maxZoom={21} />
      </LayersControl.BaseLayer>
      <LayersControl.Overlay checked name="Noms des lieux">
        <TileLayer url={URL_NOMS} maxNativeZoom={ZOOM_MAX_SATELLITE} maxZoom={21} />
      </LayersControl.Overlay>
    </LayersControl>
  )
}

// Recentre la carte quand la cible change
// (la clé texte évite de recentrer à chaque nouveau rendu : seulement si la cible change vraiment)
function Recentrer({ centre, zoom, limites }) {
  const map = useMap()
  const cle = JSON.stringify([centre, zoom, limites])
  useEffect(() => {
    const [c, z, l] = JSON.parse(cle)
    if (l && l.length >= 2) map.fitBounds(l, { padding: [30, 30], maxZoom: 19 })
    else if (c) map.setView(c, z ?? map.getZoom())
  }, [map, cle])
  return null
}

// Contour + épingle d'une parcelle (affichage)
function DessinParcelle({ parcelle, etiquette = true, onClick }) {
  const couleur = couleurParcelle(parcelle)
  const evenements = onClick ? { click: () => onClick(parcelle) } : undefined
  const pos = [parseFloat(parcelle.latitude), parseFloat(parcelle.longitude)]
  return (
    <>
      {parcelle.contour?.length >= 3 && (
        <Polygon positions={parcelle.contour} pathOptions={{ color: couleur, weight: 3, fillOpacity: 0.25 }} eventHandlers={evenements}>
          {etiquette && <Tooltip permanent direction="center" className="etiquette-su">{parcelle.su}</Tooltip>}
        </Polygon>
      )}
      <Marker position={pos} icon={epingle(couleur)} eventHandlers={evenements}>
        {!(parcelle.contour?.length >= 3) && etiquette && <Tooltip permanent direction="top" offset={[0, -38]}>{parcelle.su}</Tooltip>}
      </Marker>
      {parcelle.precision_gps && <Circle center={pos} radius={parcelle.precision_gps} pathOptions={{ color: couleur, weight: 1, fillOpacity: 0.05, dashArray: "4 4" }} />}
    </>
  )
}

// ----------------------------------------------------------------
// Carte en lecture seule d'une parcelle (acheteur, admin, vendeur)
// ----------------------------------------------------------------
export function CarteParcelle({ parcelle, hauteur = "h-96" }) {
  const pos = [parseFloat(parcelle.latitude), parseFloat(parcelle.longitude)]
  const limites = parcelle.contour?.length >= 3 ? parcelle.contour : null
  return (
    <MapContainer center={pos} zoom={18} maxZoom={21} className={`${hauteur} w-full rounded-xl`} scrollWheelZoom>
      <FondsDeCarte />
      <Recentrer centre={pos} zoom={18} limites={limites} />
      <DessinParcelle parcelle={parcelle} />
    </MapContainer>
  )
}

// ----------------------------------------------------------------
// Carte de toutes les parcelles (vue d'ensemble sur la page Parcelles)
// ----------------------------------------------------------------
export function CarteParcelles({ parcelles, onChoisir }) {
  const localisees = parcelles.filter(aPosition)
  const limites = localisees.flatMap((p) => (p.contour?.length >= 3 ? p.contour : [[parseFloat(p.latitude), parseFloat(p.longitude)]]))
  return (
    <MapContainer center={GOMA} zoom={13} maxZoom={21} className="h-[32rem] w-full" scrollWheelZoom>
      <FondsDeCarte />
      {limites.length >= 2 && <Recentrer limites={limites} />}
      {limites.length === 1 && <Recentrer centre={limites[0]} zoom={17} />}
      {localisees.map((p) => (
        <DessinParcelle key={p.id} parcelle={p} onClick={onChoisir} />
      ))}
    </MapContainer>
  )
}

// Clics sur la carte (placement de l'épingle ou ajout d'un point du contour)
function Clics({ onClic }) {
  useMapEvents({ click: (e) => onClic([e.latlng.lat, e.latlng.lng]) })
  return null
}

const arrondi = (v) => Math.round(v * 1e6) / 1e6 // 6 décimales ≈ 11 cm

// ----------------------------------------------------------------
// Saisie de la position réelle d'une parcelle (vendeur, admin)
// valeur = { latitude, longitude, precision_gps, contour }
// ----------------------------------------------------------------
export function SelecteurPosition({ valeur, onChange, avecContour = true, superficieDeclaree }) {
  const [mode, setMode] = useState("epingle") // "epingle" ou "contour"
  const [recherche, setRecherche] = useState("")
  const [resultats, setResultats] = useState([])
  const [chargement, setChargement] = useState("") // "gps" | "recherche" | ""
  const [message, setMessage] = useState("")
  const [vue, setVue] = useState(null) // { centre, zoom } pour recentrer la carte

  const pos = aPosition(valeur) ? [parseFloat(valeur.latitude), parseFloat(valeur.longitude)] : null
  const contour = valeur.contour || []

  const placer = ([lat, lng], precision = null) =>
    onChange({ ...valeur, latitude: arrondi(lat), longitude: arrondi(lng), precision_gps: precision })

  const clic = (point) => {
    if (mode === "contour") {
      const nouveau = [...contour, point.map(arrondi)]
      // Premier point du contour sans épingle : l'épingle suit le centre du contour
      onChange({ ...valeur, contour: nouveau, ...(pos ? {} : { latitude: arrondi(point[0]), longitude: arrondi(point[1]) }) })
    } else placer(point)
  }

  // Position GPS réelle (le vendeur se tient sur sa parcelle avec son téléphone)
  const maPosition = () => {
    if (!navigator.geolocation) return setMessage("Ce navigateur ne permet pas la géolocalisation.")
    setChargement("gps")
    setMessage("")
    navigator.geolocation.getCurrentPosition(
      (p) => {
        placer([p.coords.latitude, p.coords.longitude], Math.round(p.coords.accuracy))
        setVue({ centre: [p.coords.latitude, p.coords.longitude], zoom: 19 })
        setMessage(p.coords.accuracy > 100
          ? `Position approximative (± ${Math.round(p.coords.accuracy)} m) : sur ordinateur, ajustez l'épingle en cliquant sur l'image satellite.`
          : `Position de l'appareil enregistrée (précision ± ${Math.round(p.coords.accuracy)} m).`)
        setChargement("")
      },
      (e) => {
        setMessage(e.code === 1 ? "Autorisez l'accès à la position dans le navigateur." : "Position GPS indisponible : placez l'épingle à la main.")
        setChargement("")
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }

  // Recherche d'un lieu avec Nominatim (OpenStreetMap), priorité à la région de Goma
  const chercher = async (e) => {
    e.preventDefault()
    if (!recherche.trim()) return
    setChargement("recherche")
    setMessage("")
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=fr&countrycodes=cd&viewbox=29.10,-1.58,29.32,-1.76&q=${encodeURIComponent(recherche)}`
      const res = await fetch(url, { headers: { Accept: "application/json" } })
      const donnees = await res.json()
      setResultats(donnees)
      if (donnees.length === 0) setMessage("Aucun lieu trouvé. Essayez « Katindo, Goma » ou placez l'épingle à la main.")
    } catch {
      setMessage("Recherche impossible (connexion Internet ?).")
    }
    setChargement("")
  }

  const aire = aireContour(contour)

  return (
    <div className="space-y-2">
      {/* Outils : recherche, GPS, mode de saisie */}
      <div className="flex flex-col gap-2 lg:flex-row">
        <form onSubmit={chercher} className="relative flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un quartier, une avenue... (ex. Katindo, Goma)" className="champ pl-9" aria-label="Rechercher un lieu" />
          </div>
          <Button type="submit" variante="secondaire" chargement={chargement === "recherche"}>Chercher</Button>
          {resultats.length > 0 && (
            <ul className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-lg">
              {resultats.map((r) => (
                <li key={r.place_id}>
                  <button type="button" className="w-full px-3 py-2 text-left hover:bg-marine-50"
                    onClick={() => { setVue({ centre: [parseFloat(r.lat), parseFloat(r.lon)], zoom: 17 }); setResultats([]) }}>
                    {r.display_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variante="secondaire" icon={Crosshair} chargement={chargement === "gps"} onClick={maPosition}
            title="Utile seulement si vous êtes sur le terrain avec un téléphone ; sur ordinateur la position est approximative">
            Position de l'appareil
          </Button>
          {avecContour && (
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm" role="group" aria-label="Mode de saisie">
              <button type="button" onClick={() => setMode("epingle")} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium ${mode === "epingle" ? "bg-marine-700 text-white" : "text-slate-600"}`}>
                <MapPin className="size-4" aria-hidden /> Épingle
              </button>
              <button type="button" onClick={() => setMode("contour")} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 font-medium ${mode === "contour" ? "bg-marine-700 text-white" : "text-slate-600"}`}>
                <Pentagon className="size-4" aria-hidden /> Contour
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        {mode === "contour"
          ? "Cliquez sur chaque borne de la parcelle, dans l'ordre, sur l'image satellite."
          : "Cherchez le quartier, zoomez avec la molette de la souris sur l'image satellite, puis cliquez au centre de la parcelle."}
      </p>

      <div className={`overflow-hidden rounded-xl border border-slate-200 ${mode === "contour" ? "cursor-crosshair" : ""}`}>
        <MapContainer center={pos || GOMA} zoom={pos ? 18 : 14} maxZoom={21} className="h-[28rem] w-full" scrollWheelZoom>
          <FondsDeCarte />
          {vue && <Recentrer centre={vue.centre} zoom={vue.zoom} />}
          <Clics onClic={clic} />
          {pos && <Marker position={pos} icon={epingle()} />}
          {pos && valeur.precision_gps && <Circle center={pos} radius={valeur.precision_gps} pathOptions={{ weight: 1, fillOpacity: 0.08 }} />}
          {contour.length >= 3 && <Polygon positions={contour} pathOptions={{ color: "#f7d618", weight: 3, fillOpacity: 0.2 }} />}
          {contour.length === 2 && <Polyline positions={contour} pathOptions={{ color: "#f7d618", weight: 3 }} />}
          {contour.map((p, i) => <CircleMarker key={i} center={p} radius={5} pathOptions={{ color: "#f7d618", fillColor: "#0a2554", fillOpacity: 1 }} />)}
        </MapContainer>
      </div>

      {/* Récapitulatif + corrections */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-slate-600">
          {pos ? <>Position : <b className="font-mono">{valeur.latitude}, {valeur.longitude}</b></> : <span className="text-amber-700">Parcelle non localisée</span>}
          {contour.length > 0 && <> · Contour : <b>{contour.length} borne(s)</b>{contour.length >= 3 && <> ≈ <b>{Math.round(aire).toLocaleString("fr-FR")} m²</b></>}</>}
          {contour.length >= 3 && superficieDeclaree > 0 && Math.abs(aire - superficieDeclaree) / superficieDeclaree > 0.15 && (
            <span className="ml-1 text-amber-700">(écart important avec la superficie déclarée de {superficieDeclaree.toLocaleString("fr-FR")} m²)</span>
          )}
        </p>
        <div className="flex gap-1.5">
          {contour.length > 0 && (
            <Button type="button" taille="sm" variante="secondaire" icon={Undo2} onClick={() => onChange({ ...valeur, contour: contour.slice(0, -1) })}>Annuler la borne</Button>
          )}
          {(pos || contour.length > 0) && (
            <Button type="button" taille="sm" variante="discret" icon={Trash2} onClick={() => onChange({ latitude: null, longitude: null, precision_gps: null, contour: [] })}>Effacer</Button>
          )}
        </div>
      </div>
      {message && <p className="text-xs text-marine-700" role="status">{message}</p>}
    </div>
  )
}

// ----------------------------------------------------------------
// Fenêtre "Localisation" d'une parcelle : consultation (tous) et
// modification par le propriétaire (ou l'admin) si la parcelle n'est pas vendue
// ----------------------------------------------------------------
export function FenetreCarte({ parcelle, peutModifier, onEnregistrer, onClose }) {
  const [edition, setEdition] = useState(!aPosition(parcelle) && peutModifier)
  const [valeur, setValeur] = useState({
    latitude: parcelle.latitude, longitude: parcelle.longitude, precision_gps: parcelle.precision_gps, contour: parcelle.contour || [],
  })
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState("")

  useEffect(() => {
    const surTouche = (e) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", surTouche)
    return () => window.removeEventListener("keydown", surTouche)
  }, [onClose])

  const enregistrer = async () => {
    setEnvoi(true)
    setErreur("")
    try {
      await onEnregistrer({ ...valeur, contour: valeur.contour?.length >= 3 ? valeur.contour : null })
      setEdition(false)
    } catch (e) {
      setErreur(e.message || "Erreur lors de l'enregistrement.")
    }
    setEnvoi(false)
  }

  const lat = parseFloat(parcelle.latitude), lng = parseFloat(parcelle.longitude)

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`Localisation de la parcelle ${parcelle.su}`}>
      <div className="absolute inset-0 bg-marine-950/60" onClick={onClose} />
      <div className="relative flex max-h-[94vh] w-full max-w-4xl flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900">
              <MapPin className="size-5 text-marine-600" aria-hidden /> Localisation de la parcelle {parcelle.su}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">Vue satellite ou plan — changez de fond avec le bouton en haut à droite de la carte.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer"><X className="size-5" /></button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {erreur && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{erreur}</p>}
          {edition ? (
            <SelecteurPosition valeur={valeur} onChange={setValeur} superficieDeclaree={parcelle.superficie_m2} />
          ) : aPosition(parcelle) ? (
            <>
              <CarteParcelle parcelle={parcelle} hauteur="h-[26rem]" />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-600">
                <span>Coordonnées : <b className="font-mono">{parcelle.latitude}, {parcelle.longitude}</b></span>
                {parcelle.precision_gps && <span>Précision GPS : ± {parcelle.precision_gps} m</span>}
                {parcelle.contour?.length >= 3 && <span>Contour : {parcelle.contour.length} bornes ≈ {Math.round(aireContour(parcelle.contour)).toLocaleString("fr-FR")} m²</span>}
                <a className="inline-flex items-center gap-1 font-medium text-marine-700 hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=19/${lat}/${lng}`}>
                  OpenStreetMap <ExternalLink className="size-3.5" aria-hidden />
                </a>
                <a className="inline-flex items-center gap-1 font-medium text-marine-700 hover:underline" target="_blank" rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`}>
                  Itinéraire <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-sm text-slate-500">Le vendeur n'a pas encore indiqué la position de cette parcelle.</p>
          )}
        </div>
        {peutModifier && (
          <footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
            {edition ? (
              <>
                {aPosition(parcelle) && <Button variante="secondaire" onClick={() => setEdition(false)}>Annuler</Button>}
                <Button variante="primaire" icon={MapPin} chargement={envoi} disabled={!aPosition(valeur)} onClick={enregistrer}>
                  Enregistrer la position
                </Button>
              </>
            ) : (
              <Button variante="secondaire" icon={MapPin} onClick={() => setEdition(true)}>Modifier la position</Button>
            )}
          </footer>
        )}
      </div>
    </div>
  )
}
