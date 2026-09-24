import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import axios from "axios"

export default function Transactions() {
  const navigate = useNavigate()
  const role = localStorage.getItem("role")
  const token = localStorage.getItem("token")

  const [transactions, setTransactions] = useState([])
  const [parcelles, setParcelles] = useState([])
  const [utilisateurs, setUtilisateurs] = useState([])
  const [loading, setLoading] = useState(true)
  const [erreur, setErreur] = useState("")
  const [succes, setSucces] = useState("")
  const [actionEnCours, setActionEnCours] = useState(null)

  const [afficherFormulaire, setAfficherFormulaire] = useState(false)
  const [parcelleId, setParcelleId] = useState("")
  const [montant, setMontant] = useState("")

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } }

  const chargerDonnees = async () => {
    setLoading(true)
    try {
      const [resTransactions, resParcelles, resUtilisateurs] = await Promise.all([
        axios.get("http://127.0.0.1:8000/api/transactions/", authHeaders),
        axios.get("http://127.0.0.1:8000/api/parcelles/", authHeaders),
        role === "admin"
          ? axios.get("http://127.0.0.1:8000/api/utilisateurs/", authHeaders)
          : Promise.resolve({ data: [] }),
      ])
      setTransactions(resTransactions.data)
      setParcelles(resParcelles.data)
      setUtilisateurs(resUtilisateurs.data)
    } catch (err) {
      setErreur("Erreur lors du chargement des données.")
    }
    setLoading(false)
  }

  useEffect(() => {
    chargerDonnees()
  }, [])

  const trouverParcelle = (id) => parcelles.find((p) => p.id === id)
  const trouverUtilisateur = (id) => utilisateurs.find((u) => u.id === id)

  const nomParcelle = (id) => {
    const parc = trouverParcelle(id)
    return parc ? `${parc.su} — ${parc.zone}` : `Parcelle #${id}`
  }

  const nomUtilisateur = (id) => {
    const u = trouverUtilisateur(id)
    return u ? u.nom : `Utilisateur #${id}`
  }

  const parcellesDisponibles = parcelles.filter((p) => p.statut === "disponible")

  const handleCreerTransaction = async (e) => {
    e.preventDefault()
    setErreur("")
    setSucces("")
    const parcelle = trouverParcelle(parseInt(parcelleId))
    if (!parcelle) {
      setErreur("Veuillez choisir une parcelle valide.")
      return
    }
    try {
      await axios.post(
        "http://127.0.0.1:8000/api/transactions/",
        {
          parcelle: parcelle.id,
          vendeur: parcelle.proprietaire,
          montant: parseFloat(montant) || parcelle.prix_reel,
          statut: "en_cours",
        },
        authHeaders
      )
      setSucces("Transaction initiée avec succès.")
      setParcelleId("")
      setMontant("")
      setAfficherFormulaire(false)
      chargerDonnees()
    } catch (err) {
      setErreur(
        err.response?.data ? JSON.stringify(err.response.data) : "Erreur lors de la création de la transaction."
      )
    }
  }

  const changerStatut = async (id, nouveauStatut) => {
    setErreur("")
    setSucces("")
    setActionEnCours(id)
    try {
      await axios.patch(
        `http://127.0.0.1:8000/api/transactions/${id}/`,
        { statut: nouveauStatut },
        authHeaders
      )
      setSucces(
        nouveauStatut === "terminée"
          ? "Transaction validée et enregistrée sur la blockchain."
          : "Transaction annulée."
      )
      chargerDonnees()
    } catch (err) {
      setErreur(
        err.response?.data ? JSON.stringify(err.response.data) : "Erreur lors de la mise à jour du statut."
      )
    }
    setActionEnCours(null)
  }

  const badgeCouleur = (statut) => {
    if (statut === "terminée") return "bg-green-100 text-green-700"
    if (statut === "annulée") return "bg-red-100 text-red-700"
    return "bg-yellow-100 text-yellow-700"
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">🏛️ FoncierAI — Goma</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate("/parcelles")} className="hover:underline">Parcelles</button>
          <button onClick={() => navigate("/estimation")} className="hover:underline">Estimation IA</button>
          <button onClick={() => navigate("/transactions")} className="hover:underline">Transactions</button>
          {role === "admin" && (
            <button onClick={() => navigate("/utilisateurs")} className="hover:underline">Utilisateurs</button>
          )}
          <button onClick={() => navigate("/")} className="bg-red-500 px-3 py-1 rounded-lg">Déconnexion</button>
        </div>
      </nav>

      <div className="p-6">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-blue-900">💰 Historique des transactions</h2>

            {role === "acheteur" && (
              <button
                onClick={() => setAfficherFormulaire(!afficherFormulaire)}
                className="bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-800"
              >
                {afficherFormulaire ? "Annuler" : "+ Initier une transaction"}
              </button>
            )}
          </div>

          {erreur && (
            <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm break-words">{erreur}</div>
          )}
          {succes && (
            <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm">{succes}</div>
          )}

          {afficherFormulaire && role === "acheteur" && (
            <div className="bg-white rounded-2xl shadow p-6 mb-6">
              <form onSubmit={handleCreerTransaction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Parcelle</label>
                  <select
                    value={parcelleId}
                    onChange={(e) => {
                      setParcelleId(e.target.value)
                      const parc = trouverParcelle(parseInt(e.target.value))
                      if (parc) setMontant(parc.prix_reel)
                    }}
                    required
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">-- Choisir une parcelle disponible --</option>
                    {parcellesDisponibles.map((parc) => (
                      <option key={parc.id} value={parc.id}>
                        {parc.su} — {parc.zone} — ${parc.prix_reel}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Montant proposé ($)</label>
                  <input
                    type="number"
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                    required
                    className="w-full border rounded px-3 py-2"
                  />
                </div>
                <button
                  type="submit"
                  className="bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-800 md:col-span-2"
                >
                  Initier la transaction
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-500 py-10">Chargement...</div>
          ) : transactions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center">
              <div className="text-5xl mb-4">💰</div>
              <p className="text-gray-500">Aucune transaction enregistrée pour le moment.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {transactions.map((t, index) => (
                <motion.div
                  key={t.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-xl shadow p-4"
                >
                  <div className="flex justify-between items-start flex-wrap gap-2">
                    <div>
                      <p className="font-bold text-gray-800">
                        Transaction #{t.id} — {nomParcelle(t.parcelle)}
                      </p>
                      <p className="text-gray-500 text-sm">
                        Acheteur : {nomUtilisateur(t.acheteur)} — Vendeur : {nomUtilisateur(t.vendeur)}
                      </p>
                      <p className="text-gray-500 text-sm">
                        Montant : ${t.montant} — Créée le {new Date(t.created_at).toLocaleDateString()}
                      </p>
                      {t.hash_blockchain && (
                        <p className="text-xs text-blue-600 break-all mt-1">
                          🔗 Hash blockchain : {t.hash_blockchain}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${badgeCouleur(t.statut)}`}>
                        {t.statut}
                      </span>

                      {role === "admin" && t.statut === "en_cours" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => changerStatut(t.id, "terminée")}
                            disabled={actionEnCours === t.id}
                            className="bg-green-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {actionEnCours === t.id ? "..." : "Valider"}
                          </button>
                          <button
                            onClick={() => changerStatut(t.id, "annulée")}
                            disabled={actionEnCours === t.id}
                            className="bg-red-500 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-red-600 disabled:opacity-50"
                          >
                            {actionEnCours === t.id ? "..." : "Annuler"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}