import { useState, useEffect } from "react" // hooks React : état local et effets
// Icônes de la bibliothèque lucide-react
import {
  History, Search, ListChecks, Clock, CircleCheck, Wallet, Link2, TriangleAlert,
} from "lucide-react"
import Layout from "../components/Layout" // mise en page commune
import { Alert, Card, Chargement, EmptyState, PageHeader, StatCard, StatutBadge } from "../components/ui" // composants d'interface
import api, { formatMontant, capitaliser } from "../api" // client HTTP et fonctions utilitaires

// Historique des transactions de l'utilisateur connecté.
// Le backend filtre déjà : un acheteur ne reçoit que ses achats,
// un vendeur que ses ventes, un admin toutes les transactions.
export default function Historique() {
  const role = localStorage.getItem("role") // rôle de l'utilisateur connecté

  const [transactions, setTransactions] = useState([]) // transactions reçues du backend
  const [loading, setLoading] = useState(true) // chargement en cours
  const [erreur, setErreur] = useState("") // message d'erreur
  const [filtreStatut, setFiltreStatut] = useState("tous") // filtre choisi dans la liste déroulante
  const [recherche, setRecherche] = useState("") // texte saisi dans la recherche

  // Au chargement de la page : récupère les transactions
  useEffect(() => {
    api
      .get("/transactions/")
      .then((res) => setTransactions(res.data))
      .catch(() => setErreur("Impossible de charger l'historique des transactions."))
      .finally(() => setLoading(false))
  }, [])

  // Titre de la colonne "autre partie" selon le rôle
  const colonneContrepartie =
    role === "acheteur" ? "Vendeur" : role === "vendeur" ? "Acheteur" : "Acheteur → Vendeur"
  // Nom de l'autre partie de la transaction
  const contrepartie = (t) =>
    role === "acheteur" ? t.vendeur_nom : role === "vendeur" ? t.acheteur_nom : `${t.acheteur_nom} → ${t.vendeur_nom}`

  // Applique le filtre de statut et la recherche
  const transactionsFiltrees = transactions.filter((t) => {
    if (filtreStatut !== "tous" && t.statut !== filtreStatut) return false // mauvais statut
    if (recherche) {
      // Recherche dans le SU, la zone et les noms (sans tenir compte des majuscules)
      const texte = `${t.parcelle_su} ${t.parcelle_zone} ${t.acheteur_nom} ${t.vendeur_nom}`.toLowerCase()
      if (!texte.includes(recherche.toLowerCase())) return false
    }
    return true
  })

  // Nombre de transactions ayant l'un des statuts donnés
  const compter = (...statuts) => transactions.filter((t) => statuts.includes(t.statut)).length
  // Somme des montants des ventes validées
  const montantTermine = transactions
    .filter((t) => t.statut === "terminée")
    .reduce((total, t) => total + parseFloat(t.montant), 0)

  // Titre de la page selon le rôle
  const titre =
    role === "acheteur" ? "Historique de mes achats"
    : role === "vendeur" ? "Historique de mes ventes"
    : "Historique des transactions"

  return (
    <Layout titre="Historique">
      <PageHeader icon={History} titre={titre} description="Toutes vos transactions, quel que soit leur statut." />

      {erreur && <Alert type="erreur" className="mb-4">{erreur}</Alert>}

      {/* Les 4 chiffres récapitulatifs */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={ListChecks} label="Total" valeur={transactions.length} ton="marine" />
        <StatCard icon={Clock} label="En cours" valeur={compter("en_cours", "acceptée")} ton="ambre" />
        <StatCard icon={CircleCheck} label="Validées" valeur={compter("terminée")} ton="vert" />
        <StatCard
          icon={Wallet}
          label={role === "acheteur" ? "Montant dépensé" : role === "vendeur" ? "Montant encaissé" : "Volume validé"}
          valeur={formatMontant(montantTermine)}
          ton="violet"
        />
      </div>

      <Card padding={false}>
        {/* Barre de recherche et filtre par statut */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher par SU, lotissement, nom..."
              aria-label="Rechercher une transaction"
              className="champ pl-9"
            />
          </div>
          <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className="champ sm:w-52" aria-label="Filtrer par statut">
            <option value="tous">Tous les statuts</option>
            <option value="en_cours">Offres en attente</option>
            <option value="acceptée">Acceptées par le vendeur</option>
            <option value="terminée">Validées</option>
            <option value="refusée">Refusées</option>
            <option value="annulée">Annulées</option>
          </select>
        </div>

        {/* Chargement, liste vide ou tableau des transactions */}
        {loading ? (
          <Chargement texte="Chargement de l'historique..." />
        ) : transactionsFiltrees.length === 0 ? (
          <EmptyState
            icon={History}
            titre={transactions.length === 0 ? "Historique vide" : "Aucun résultat"}
            texte={transactions.length === 0 ? "Vos transactions apparaîtront ici." : "Modifiez la recherche ou le filtre."}
          />
        ) : (
          // overflow-x-auto : le tableau défile horizontalement sur petit écran
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              {/* En-têtes des colonnes */}
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">N°</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Parcelle</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{colonneContrepartie}</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Montant</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Blockchain</th>
                </tr>
              </thead>
              {/* Une ligne par transaction */}
              <tbody className="divide-y divide-slate-100">
                {transactionsFiltrees.map((t) => (
                  <tr key={t.id} className="transition hover:bg-marine-50/50">
                    <td className="px-4 py-3 font-semibold text-slate-900">#{t.id}</td>
                    <td className="whitespace-nowrap px-4 py-3">{new Date(t.created_at).toLocaleDateString("fr-FR")}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{t.parcelle_su}</p>
                      <p className="text-xs text-slate-500">{capitaliser(t.parcelle_zone)}</p>
                    </td>
                    <td className="px-4 py-3">{contrepartie(t)}</td>
                    {/* Montant, avec la mention "Suspect" si l'IA le juge anormal */}
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900">
                      {formatMontant(t.montant)}
                      {t.analyse_ia?.montant_suspect && (
                        <span className="mt-0.5 flex items-center justify-end gap-1 text-xs font-medium text-red-600">
                          <TriangleAlert className="size-3.5" aria-hidden /> Suspect
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3"><StatutBadge statut={t.statut} /></td>
                    {/* Début du hash blockchain (hash complet au survol) */}
                    <td className="px-4 py-3">
                      {t.hash_blockchain ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-marine-600" title={t.hash_blockchain}>
                          <Link2 className="size-3.5" aria-hidden /> {t.hash_blockchain.slice(0, 12)}…
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Compteur de résultats */}
            <p className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
              {transactionsFiltrees.length} transaction(s) affichée(s) sur {transactions.length}
            </p>
          </div>
        )}
      </Card>
    </Layout>
  )
}
