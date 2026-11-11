import { useEffect, useMemo, useState } from "react" // hooks React
// Icônes de la bibliothèque lucide-react
import {
  Blocks, Lock, TrendingUp, TrendingDown, Minus, LandPlot, Link2, Boxes, Wallet, RefreshCw, ListOrdered,
} from "lucide-react"
import Layout from "../components/Layout" // mise en page commune
import { Alert, Card, Chargement, EmptyState, PageHeader, StatCard } from "../components/ui" // composants d'interface
import api, { formatMontant, capitaliser, messageErreur } from "../api" // client HTTP et utilitaires

// ----------------------------------------------------------------
// Registre blockchain (administrateur, LECTURE SEULE)
// Les données sont lues directement dans le contrat FoncierAI : aucune
// action de modification n'existe sur cette page (ni dans l'API).
// ----------------------------------------------------------------

const ACTUALISATION_MS = 15000 // une vente validée apparaît automatiquement en moins de 15 s

const dateHeure = (ts) =>
  new Date(ts * 1000).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
const dateCourte = (ts) => new Date(ts * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })
const court = (h, n = 8) => (h ? `${h.slice(0, n)}…${h.slice(-4)}` : "—")

// Variation en % avec flèche (▲ vert, ▼ rouge), comme une cote boursière
function Variation({ valeur, className = "" }) {
  if (valeur === null || valeur === undefined)
    return <span className={`inline-flex items-center gap-0.5 text-slate-400 ${className}`}><Minus className="size-3.5" aria-hidden />—</span>
  const hausse = valeur >= 0
  const Icon = hausse ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 font-semibold ${hausse ? "text-emerald-600" : "text-red-600"} ${className}`}>
      <Icon className="size-3.5" aria-hidden />
      {hausse ? "+" : ""}{valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %
    </span>
  )
}

// Graphique en courbe façon bourse (SVG, sans bibliothèque) avec info-bulle au survol
function GraphiqueBourse({ points, libelle }) {
  const [survol, setSurvol] = useState(null) // index du point survolé
  const L = 760, H = 300, m = { g: 64, d: 16, h: 16, b: 34 } // dimensions et marges
  if (points.length === 0) return <EmptyState icon={TrendingUp} titre="Aucune donnée" texte="Aucune vente inscrite pour cette sélection." />

  const valeurs = points.map((p) => p.y)
  let min = Math.min(...valeurs), max = Math.max(...valeurs)
  if (min === max) { min = min * 0.9; max = max * 1.1 || 1 } // une seule valeur : on donne de la hauteur
  const marge = (max - min) * 0.1
  min = Math.max(0, min - marge); max = max + marge

  const x = (i) => m.g + (points.length === 1 ? (L - m.g - m.d) / 2 : (i * (L - m.g - m.d)) / (points.length - 1))
  const y = (v) => m.h + (1 - (v - min) / (max - min)) * (H - m.h - m.b)
  const hausse = points[points.length - 1].y >= points[0].y
  const couleur = hausse ? "#059669" : "#dc2626" // vert si hausse, rouge si baisse

  const ligne = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.y)}`).join(" ")
  const aire = `${ligne} L${x(points.length - 1)},${H - m.b} L${x(0)},${H - m.b} Z`
  const graduations = Array.from({ length: 5 }, (_, k) => min + ((max - min) * k) / 4)
  const pas = Math.max(1, Math.ceil(points.length / 8)) // évite de surcharger l'axe des dates
  const p = survol !== null ? points[survol] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${H}`} className="h-auto w-full" role="img" aria-label={`Évolution : ${libelle}`}
        onMouseLeave={() => setSurvol(null)}>
        <defs>
          <linearGradient id="degrade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={couleur} stopOpacity="0.25" />
            <stop offset="100%" stopColor={couleur} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Quadrillage horizontal + montants */}
        {graduations.map((g) => (
          <g key={g}>
            <line x1={m.g} x2={L - m.d} y1={y(g)} y2={y(g)} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={m.g - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="#64748b">
              ${Math.round(g).toLocaleString("fr-FR")}
            </text>
          </g>
        ))}
        {/* Dates sous l'axe */}
        {points.map((pt, i) => (i % pas === 0 || i === points.length - 1) && (
          <text key={i} x={x(i)} y={H - 12} textAnchor="middle" fontSize="11" fill="#64748b">{dateCourte(pt.t)}</text>
        ))}
        <path d={aire} fill="url(#degrade)" />
        <path d={ligne} fill="none" stroke={couleur} strokeWidth="2.5" strokeLinejoin="round" />
        {/* Ligne verticale du point survolé */}
        {p && <line x1={x(survol)} x2={x(survol)} y1={m.h} y2={H - m.b} stroke="#94a3b8" strokeDasharray="4 3" />}
        {points.map((pt, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(pt.y)} r={survol === i ? 6 : 4} fill="white" stroke={couleur} strokeWidth="2.5" />
            {/* Zone de survol plus large que le point */}
            <rect x={x(i) - 14} y={m.h} width="28" height={H - m.h - m.b} fill="transparent"
              onMouseEnter={() => setSurvol(i)} onClick={() => setSurvol(i)} />
          </g>
        ))}
      </svg>
      {/* Info-bulle */}
      {p && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
          style={{ left: `${Math.min(70, (x(survol) / L) * 100)}%` }}>
          <p className="font-semibold text-slate-900">{p.titre}</p>
          <p className="text-slate-500">{dateHeure(p.t)}</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{formatMontant(p.y)}</p>
          {p.detail && <p className="text-slate-500">{p.detail}</p>}
          {p.variation !== undefined && <Variation valeur={p.variation} />}
        </div>
      )}
    </div>
  )
}

export default function Registre() {
  const [donnees, setDonnees] = useState(null) // réponse de /blockchain/registre/
  const [erreur, setErreur] = useState("")
  const [actualisation, setActualisation] = useState(false)
  const [selection, setSelection] = useState("marche") // "marche" = toutes les parcelles, sinon un SU

  // Lecture du registre (les mises à jour d'état se font dans les callbacks de la requête)
  const lire = () =>
    api.get("/blockchain/registre/")
      .then((res) => { setDonnees(res.data); setErreur("") })
      .catch((e) => setErreur(messageErreur(e, "Impossible de lire le registre blockchain.")))
      .finally(() => setActualisation(false))

  // Bouton "Actualiser"
  const charger = () => { setActualisation(true); lire() }

  // Chargement puis actualisation automatique (nouvelles ventes validées)
  useEffect(() => {
    lire()
    const minuterie = setInterval(lire, ACTUALISATION_MS)
    return () => clearInterval(minuterie)
  }, [])

  const parcelle = donnees?.parcelles.find((p) => p.su === selection)

  // Points du graphique : prix de la parcelle choisie, ou volume cumulé du marché (indice)
  const points = useMemo(() => {
    if (!donnees) return []
    if (parcelle)
      return parcelle.historique.map((t) => ({
        t: t.timestamp, y: t.montant, variation: t.variation,
        titre: `${t.parcelle_su} — vente n° ${t.numero_parcelle}`,
        detail: `${t.vendeur_nom || court(t.vendeur)} → ${t.acheteur_nom || court(t.acheteur)}`,
      }))
    let cumul = 0
    return donnees.transactions.map((t) => {
      cumul += t.montant
      return { t: t.timestamp, y: cumul, titre: `Tx #${t.id} — ${t.parcelle_su}`, detail: `+${formatMontant(t.montant)}` }
    })
  }, [donnees, parcelle])

  const transactionsAffichees = donnees ? (parcelle ? [...parcelle.historique] : [...donnees.transactions]).reverse() : []

  return (
    <Layout titre="Registre blockchain">
      <PageHeader
        icon={Blocks}
        titre="Registre blockchain"
        description="Ventes inscrites dans le contrat FoncierAI, lues directement sur la blockchain."
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-200/70 px-3 py-2 text-xs font-semibold text-slate-700">
              <Lock className="size-4" aria-hidden /> Lecture seule
            </span>
            <button onClick={charger}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <RefreshCw className={`size-4 ${actualisation ? "animate-spin" : ""}`} aria-hidden /> Actualiser
            </button>
          </>
        }
      />

      {erreur && <Alert type="erreur" className="mb-4">{erreur}</Alert>}

      {!donnees ? (
        !erreur && <Chargement texte="Lecture de la blockchain..." />
      ) : (
        <>
          <Alert type="info" className="mb-4">
            Les inscriptions sur la blockchain sont <strong>définitives et infalsifiables</strong> : personne,
            pas même l'administrateur, ne peut les modifier ou les supprimer. Contrat :{" "}
            <span className="font-mono text-xs">{donnees.contrat}</span>
          </Alert>

          {/* Bandeau défilant façon bourse : dernière cote de chaque parcelle */}
          {donnees.parcelles.length > 0 && (
            <div className="mb-4 overflow-hidden rounded-xl bg-marine-900 py-2 text-sm text-white" aria-label="Cotes des parcelles">
              <div className="flex w-max animate-[defilement_40s_linear_infinite] gap-8 px-4 hover:[animation-play-state:paused]">
                {[...donnees.parcelles, ...donnees.parcelles].map((p, i) => (
                  <button key={i} onClick={() => setSelection(p.su)} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="font-bold text-rdc-jaune">{p.su}</span>
                    <span>{formatMontant(p.dernier_montant)}</span>
                    <Variation valeur={p.historique[p.historique.length - 1].variation} className="[&]:text-current" />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={ListOrdered} label="Transactions inscrites" valeur={donnees.nombre_transactions} ton="marine" />
            <StatCard icon={LandPlot} label="Parcelles au registre" valeur={donnees.parcelles.length} ton="vert" />
            <StatCard icon={Wallet} label="Volume total" valeur={formatMontant(donnees.volume_total)} ton="violet" />
            <StatCard icon={Boxes} label="Bloc actuel" valeur={`#${donnees.bloc_actuel}`} ton="ambre" />
          </div>

          {donnees.nombre_transactions === 0 ? (
            <Card><EmptyState icon={Blocks} titre="Registre vide" texte="Les ventes validées par l'administrateur apparaîtront ici." /></Card>
          ) : (
            <>
              {/* Graphique */}
              <Card
                className="mb-6"
                titre={parcelle ? `Cours de la parcelle ${parcelle.su}` : "Indice du marché (volume cumulé)"}
                icon={TrendingUp}
                actions={
                  <select value={selection} onChange={(e) => setSelection(e.target.value)} className="champ w-auto! py-1.5!" aria-label="Choisir la parcelle">
                    <option value="marche">Toutes les parcelles</option>
                    {donnees.parcelles.map((p) => <option key={p.su} value={p.su}>{p.su} — {capitaliser(p.zone)}</option>)}
                  </select>
                }
              >
                {parcelle && (
                  <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                    <p className="text-3xl font-bold text-slate-900">{formatMontant(parcelle.dernier_montant)}</p>
                    <Variation valeur={parcelle.variation_totale} className="text-base" />
                    <p className="text-sm text-slate-500">
                      {parcelle.nombre_ventes} vente(s) · propriétaire actuel : <strong>{parcelle.proprietaire_actuel}</strong>
                    </p>
                  </div>
                )}
                <GraphiqueBourse points={points} libelle={parcelle ? parcelle.su : "marché"} />
              </Card>

              {/* Tableau des cotes (une ligne par parcelle) */}
              <Card className="mb-6" titre="Cotes par parcelle" icon={LandPlot} padding={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-3">Parcelle (SU)</th>
                        <th scope="col" className="px-4 py-3">Lotissement</th>
                        <th scope="col" className="px-4 py-3 text-right">Ventes</th>
                        <th scope="col" className="px-4 py-3 text-right">1re vente</th>
                        <th scope="col" className="px-4 py-3 text-right">Dernière vente</th>
                        <th scope="col" className="px-4 py-3 text-right">Variation</th>
                        <th scope="col" className="px-4 py-3">Propriétaire actuel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {donnees.parcelles.map((p) => (
                        <tr key={p.su} onClick={() => setSelection(p.su)}
                          className={`cursor-pointer transition hover:bg-marine-50/50 ${selection === p.su ? "bg-marine-50" : ""}`}>
                          <td className="px-4 py-3 font-bold text-marine-800">{p.su}</td>
                          <td className="px-4 py-3">{capitaliser(p.zone) || "—"}</td>
                          <td className="px-4 py-3 text-right">{p.nombre_ventes}</td>
                          <td className="px-4 py-3 text-right">{formatMontant(p.premier_montant)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMontant(p.dernier_montant)}</td>
                          <td className="px-4 py-3 text-right"><Variation valeur={p.variation_totale} /></td>
                          <td className="px-4 py-3">{p.proprietaire_actuel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              {/* Journal des transactions (plus récente en premier) */}
              <Card titre={parcelle ? `Transactions de la parcelle ${parcelle.su}` : "Journal des transactions"} icon={Link2} padding={false}>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-4 py-3">N° contrat</th>
                        <th scope="col" className="px-4 py-3">Parcelle · n° de vente</th>
                        <th scope="col" className="px-4 py-3">Date</th>
                        <th scope="col" className="px-4 py-3">Vendeur → Acheteur</th>
                        <th scope="col" className="px-4 py-3 text-right">Montant</th>
                        <th scope="col" className="px-4 py-3 text-right">Variation</th>
                        <th scope="col" className="px-4 py-3">Bloc</th>
                        <th scope="col" className="px-4 py-3">Hash de transaction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactionsAffichees.map((t) => (
                        <tr key={t.id} className="hover:bg-marine-50/50">
                          <td className="px-4 py-3 font-semibold text-slate-900">#{t.id}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="font-bold text-marine-800">{t.parcelle_su}</span>
                            <span className="ml-2 rounded-full bg-marine-50 px-2 py-0.5 text-xs font-semibold text-marine-700 ring-1 ring-marine-100">
                              vente n° {t.numero_parcelle}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{dateHeure(t.timestamp)}</td>
                          <td className="px-4 py-3">
                            <span title={t.vendeur}>{t.vendeur_nom || court(t.vendeur)}</span>
                            {" → "}
                            <span title={t.acheteur}>{t.acheteur_nom || court(t.acheteur)}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">{formatMontant(t.montant)}</td>
                          <td className="px-4 py-3 text-right"><Variation valeur={t.variation} /></td>
                          <td className="px-4 py-3 font-mono text-xs">{t.bloc ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 font-mono text-xs text-marine-600" title={t.tx_hash || ""}>
                              <Link2 className="size-3.5" aria-hidden /> {court(t.tx_hash, 10)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}
    </Layout>
  )
}
