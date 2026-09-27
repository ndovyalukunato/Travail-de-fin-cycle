import { useState, useEffect } from "react" // hooks React : état local et effets
import { motion } from "framer-motion" // animations
// Icônes de la bibliothèque lucide-react
import {
  BrainCircuit, Calculator, LandPlot, SlidersHorizontal, TrendingUp, Trees, ShieldCheck, ShieldAlert, Sparkles,
} from "lucide-react"
import Layout from "../components/Layout" // mise en page commune
import { Alert, Button, Card, EmptyState, Field, PageHeader } from "../components/ui" // composants d'interface
import api, { messageErreur, formatMontant, capitaliser } from "../api" // client HTTP et fonctions utilitaires

// Page "Estimation IA" : prédiction du prix et détection de prix anormal
export default function Estimation() {
  // "parcelle" : estimer une parcelle enregistrée ; "libre" : simulation
  const [mode, setMode] = useState("parcelle")
  const [zones, setZones] = useState([]) // lotissements connus par le modèle
  const [parcelles, setParcelles] = useState([]) // parcelles visibles par l'utilisateur

  const [parcelleId, setParcelleId] = useState("") // parcelle choisie (mode "parcelle")
  const [form, setForm] = useState({ superficie: "", zone: "", infrastructure: "1" }) // champs du mode "libre"
  const [prix, setPrix] = useState("") // prix à contrôler (facultatif)

  const [resultat, setResultat] = useState(null) // réponse du modèle IA
  const [erreur, setErreur] = useState("") // message d'erreur
  const [loading, setLoading] = useState(false) // calcul en cours

  // Au chargement de la page : récupère les zones et les parcelles
  useEffect(() => {
    api.get("/zones/").then((res) => setZones(res.data)).catch(() => {})
    api.get("/parcelles/").then((res) => setParcelles(res.data)).catch(() => {})
  }, [])

  // Met à jour le champ modifié du formulaire "libre" (grâce à son attribut name)
  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  // Changement d'onglet : on efface l'ancien résultat
  const changerMode = (m) => {
    setMode(m)
    setResultat(null)
    setErreur("")
  }

  // Envoi du formulaire : demande l'estimation au backend
  const handleSubmit = async (e) => {
    e.preventDefault() // empêche le rechargement de la page
    setLoading(true)
    setErreur("")
    setResultat(null)

    // Données envoyées selon le mode choisi
    const donnees =
      mode === "parcelle"
        ? { parcelle_id: parseInt(parcelleId) }
        : {
            superficie: parseFloat(form.superficie),
            zone: form.zone,
            infrastructure: parseInt(form.infrastructure),
          }
    if (prix !== "") donnees.prix = parseFloat(prix) // prix à contrôler, seulement s'il est saisi

    try {
      const res = await api.post("/estimer/", donnees)
      setResultat(res.data) // affiche le résultat
      // la parcelle a maintenant un prix_estime à jour
      if (mode === "parcelle") api.get("/parcelles/").then((r) => setParcelles(r.data))
    } catch (error) {
      setErreur(messageErreur(error, "Erreur de connexion avec l'API"))
    }
    setLoading(false)
  }

  // Parcelle sélectionnée (pour afficher son prix réel et sa nature)
  const parcelleChoisie = parcelles.find((p) => p.id === parseInt(parcelleId))
  // Écart en % entre le prix contrôlé et le prix estimé
  const ecart =
    resultat && resultat.prix_controle
      ? ((resultat.prix_controle - resultat.estimation.moyenne) / resultat.estimation.moyenne) * 100
      : null

  // Les deux onglets : [valeur, libellé, icône]
  const onglets = [
    ["parcelle", "Parcelle enregistrée", LandPlot],
    ["libre", "Simulation libre", SlidersHorizontal],
  ]

  return (
    <Layout titre="Estimation IA">
      <PageHeader
        icon={BrainCircuit}
        titre="Estimation IA du prix"
        description="Régression linéaire et Random Forest pour le prix ; Isolation Forest pour détecter un prix anormal."
      />

      {/* Deux colonnes sur grand écran : formulaire (2/5) et résultats (3/5) */}
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          {/* Onglets "Parcelle enregistrée" / "Simulation libre" */}
          <div role="tablist" aria-label="Mode d'estimation" className="mb-4 flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {onglets.map(([m, label, Icon]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                type="button"
                onClick={() => changerMode(m)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
                  mode === m ? "bg-marine-700 text-white shadow-sm" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "parcelle" ? (
                // Mode 1 : choix d'une parcelle enregistrée
                <Field label="Parcelle" htmlFor="parcelle" requis>
                  <select id="parcelle" value={parcelleId} onChange={(e) => setParcelleId(e.target.value)} className="champ" required>
                    <option value="">— Choisir une parcelle —</option>
                    {parcelles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.su} — {capitaliser(p.zone)} — {p.superficie_m2} m²
                      </option>
                    ))}
                  </select>
                  {/* Rappel du prix réel et de la nature du titre de la parcelle choisie */}
                  {parcelleChoisie && (
                    <dl className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
                      <dt className="text-slate-500">Prix réel déclaré</dt>
                      <dd className="text-right font-semibold">{formatMontant(parcelleChoisie.prix_reel)}</dd>
                      <dt className="text-slate-500">Nature du titre</dt>
                      <dd className="text-right font-semibold">{parcelleChoisie.nature}</dd>
                    </dl>
                  )}
                </Field>
              ) : (
                // Mode 2 : saisie libre des caractéristiques
                <>
                  <Field label="Superficie (m²)" htmlFor="superficie" requis aide="1 are = 100 m²">
                    <input id="superficie" type="number" name="superficie" min="1" step="any" value={form.superficie} onChange={handleChange} placeholder="ex : 400" className="champ" required />
                  </Field>
                  {/* Liste des lotissements fournie par le modèle IA */}
                  <Field label="Lotissement" htmlFor="zone" requis>
                    <select id="zone" name="zone" value={form.zone} onChange={handleChange} className="champ" required>
                      <option value="">— Choisir —</option>
                      {zones.map((z) => <option key={z} value={z}>{capitaliser(z)}</option>)}
                    </select>
                  </Field>
                  {/* Variable "infrastructure" : 1 = certificat, 0 = autre document */}
                  <Field label="Type de document" htmlFor="infra">
                    <select id="infra" name="infrastructure" value={form.infrastructure} onChange={handleChange} className="champ">
                      <option value="1">Certificat d'enregistrement (zone équipée)</option>
                      <option value="0">Autre document (contrat, fiche parcellaire...)</option>
                    </select>
                  </Field>
                </>
              )}

              {/* Prix à contrôler par l'Isolation Forest (facultatif) */}
              <Field
                label="Prix à contrôler ($)"
                htmlFor="prix"
                aide={mode === "parcelle" ? "Optionnel — par défaut : prix réel de la parcelle." : "Optionnel — par défaut : prix estimé."}
              >
                <input id="prix" type="number" min="0" step="any" value={prix} onChange={(e) => setPrix(e.target.value)} className="champ" />
              </Field>

              <Button type="submit" icon={Calculator} chargement={loading} className="w-full">
                {loading ? "Calcul en cours..." : "Estimer le prix"}
              </Button>
            </form>
          </Card>
        </div>

        {/* Colonne des résultats */}
        <div className="lg:col-span-3">
          {erreur && <Alert type="erreur" onClose={() => setErreur("")} className="mb-4">{erreur}</Alert>}

          {!resultat ? (
            // Aucun résultat pour l'instant
            <Card>
              <EmptyState
                icon={Sparkles}
                titre="Aucune estimation pour l'instant"
                texte="Choisissez une parcelle ou saisissez ses caractéristiques, puis lancez l'estimation."
              />
            </Card>
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card titre="Résultats" icon={TrendingUp}>
                <p className="mb-4 text-sm text-slate-500">
                  {resultat.superficie_m2?.toLocaleString("fr-FR")} m² — {resultat.infrastructure ? "avec" : "sans"} certificat
                  {resultat.parcelle_id && " — estimation enregistrée sur la parcelle"}
                </p>

                {/* Prix retenu : moyenne des deux modèles */}
                <div className="mb-4 rounded-xl bg-gradient-to-br from-marine-700 to-marine-900 p-5 text-white">
                  <p className="text-sm text-marine-100">Prix moyen estimé</p>
                  <p className="text-3xl font-bold">{formatMontant(resultat.estimation.moyenne)}</p>
                </div>

                {/* Détail des deux modèles */}
                <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="flex items-center gap-1.5 text-sm text-slate-500">
                      <TrendingUp className="size-4 text-marine-600" aria-hidden /> Régression linéaire
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatMontant(resultat.estimation.regression_lineaire)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 p-4">
                    <p className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Trees className="size-4 text-emerald-600" aria-hidden /> Random Forest
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{formatMontant(resultat.estimation.random_forest)}</p>
                  </div>
                </div>

                {/* Avis de l'Isolation Forest : rouge si suspect, vert si normal */}
                <div className={`flex items-start gap-3 rounded-xl border p-4 ${
                  resultat.fraude.est_fraude ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"
                }`}>
                  {resultat.fraude.est_fraude
                    ? <ShieldAlert className="size-6 shrink-0 text-red-600" aria-hidden />
                    : <ShieldCheck className="size-6 shrink-0 text-emerald-600" aria-hidden />}
                  <div>
                    <p className={`font-semibold ${resultat.fraude.est_fraude ? "text-red-700" : "text-emerald-700"}`}>
                      {resultat.fraude.message}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      Prix contrôlé : <b>{formatMontant(resultat.prix_controle)}</b>
                      {ecart !== null && Math.abs(ecart) >= 0.5 && (
                        <> ({ecart > 0 ? "+" : ""}{ecart.toFixed(0)} % par rapport à l'estimation)</>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Score d'anomalie : {resultat.fraude.score} (négatif = anormal)</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </Layout>
  )
}
