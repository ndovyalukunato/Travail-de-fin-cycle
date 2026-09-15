import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import axios from "axios"

export default function Parcelles() {
  const navigate = useNavigate()

  const [parcelles, setParcelles] = useState([])
  const [loading, setLoading] = useState(true)
  const [afficherFormulaire, setAfficherFormulaire] = useState(false)
  const [erreur, setErreur] = useState("")
  const [succes, setSucces] = useState("")

  const [su, setSu] = useState("")
  const [superficieHa, setSuperficieHa] = useState(0)
  const [superficieAres, setSuperficieAres] = useState("")
  const [superficieCa, setSuperficieCa] = useState("")
  const [superficiePourcent, setSuperficiePourcent] = useState(0)
  const [zone, setZone] = useState("")
  const [usage, setUsage] = useState("residentiel")
  const [nature, setNature] = useState("")
  const [prixReel, setPrixReel] = useState("")
  const [titreFoncier, setTitreFoncier] = useState("")

  const role = localStorage.getItem("role")
  const token = localStorage.getItem("token")
  const peutAjouter = role === "vendeur" || role === "admin"

  const chargerParcelles = () => {
    setLoading(true)
    axios.get("http://127.0.0.1:8000/api/parcelles/", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        setParcelles(res.data)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    chargerParcelles()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErreur("")
    setSucces("")

    try {
      await axios.post(
        "http://127.0.0.1:8000/api/parcelles/",
        {
          su,
          superficie_ha: parseInt(superficieHa) || 0,
          superficie_ares: parseInt(superficieAres),
          superficie_ca: parseInt(superficieCa),
          superficie_pourcent: parseInt(superficiePourcent) || 0,
          zone,
          usage,
          nature,
          prix_reel: parseFloat(prixReel),
          titre_foncier: titreFoncier,
          statut: "disponible",
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setSucces("Parcelle enregistrée avec succès.")
      setSu(""); setSuperficieHa(0); setSuperficieAres(""); setSuperficieCa("")
      setSuperficiePourcent(0); setZone(""); setUsage("residentiel")
      setNature(""); setPrixReel(""); setTitreFoncier("")
      setAfficherFormulaire(false)
      chargerParcelles()
    } catch (err) {
      setErreur(
        err.response?.data
          ? JSON.stringify(err.response.data)
          : "Erreur lors de l'enregistrement de la parcelle."
      )
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">🏛️ FoncierAI — Goma</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate("/parcelles")} className="hover:underline">Parcelles</button>
          <button onClick={() => navigate("/estimation")} className="hover:underline">Estimation IA</button>
          {role === "admin" && (
            <button onClick={() => navigate("/utilisateurs")} className="hover:underline">Utilisateurs</button>
          )}
          <button onClick={() => navigate("/")} className="bg-red-500 px-3 py-1 rounded-lg">Déconnexion</button>
        </div>
      </nav>

      <div className="p-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="max-w-4xl mx-auto"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-blue-900">🏞️ Liste des Parcelles</h2>

            {peutAjouter && (
              <button
                onClick={() => setAfficherFormulaire(!afficherFormulaire)}
                className="bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-800"
              >
                {afficherFormulaire ? "Annuler" : "+ Ajouter une parcelle"}
              </button>
            )}
          </div>

          {afficherFormulaire && (
            <div className="bg-white rounded-2xl shadow p-6 mb-6">
              {erreur && (
                <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm break-words">
                  {erreur}
                </div>
              )}
              {succes && (
                <div className="bg-green-100 text-green-700 p-3 rounded mb-4 text-sm">
                  {succes}
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Numéro SU</label>
                  <input
                    type="text"
                    value={su}
                    onChange={(e) => setSu(e.target.value)}
                    required
                    placeholder="ex: SU:63251"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Zone (lotissement)</label>
                  <select
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    required
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">-- Choisir --</option>
                    <option value="mapendo">Mapendo</option>
                    <option value="keshero">Keshero</option>
                    <option value="katindo">Katindo</option>
                    <option value="lac-vert">Lac-vert</option>
                    <option value="les volcans">Les volcans</option>
                    <option value="mikeno">Mikeno</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Superficie — Hectares (Ha)</label>
                  <input
                    type="number"
                    value={superficieHa}
                    onChange={(e) => setSuperficieHa(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Superficie — Ares</label>
                  <input
                    type="number"
                    value={superficieAres}
                    onChange={(e) => setSuperficieAres(e.target.value)}
                    required
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Superficie — Centiares (Ca)</label>
                  <input
                    type="number"
                    value={superficieCa}
                    onChange={(e) => setSuperficieCa(e.target.value)}
                    required
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Pourcentage de centiare (%)</label>
                  <input
                    type="number"
                    value={superficiePourcent}
                    onChange={(e) => setSuperficiePourcent(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Usage</label>
                  <select
                    value={usage}
                    onChange={(e) => setUsage(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="residentiel">Résidentiel</option>
                    <option value="commercial">Commercial</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Nature du titre</label>
                  <input
                    type="text"
                    value={nature}
                    onChange={(e) => setNature(e.target.value)}
                    required
                    placeholder="ex: contrat_location"
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Prix réel</label>
                  <input
                    type="number"
                    value={prixReel}
                    onChange={(e) => setPrixReel(e.target.value)}
                    required
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Titre foncier</label>
                  <input
                    type="text"
                    value={titreFoncier}
                    onChange={(e) => setTitreFoncier(e.target.value)}
                    className="w-full border rounded px-3 py-2"
                  />
                </div>

                <button
                  type="submit"
                  className="bg-blue-900 text-white px-4 py-2 rounded-lg hover:bg-blue-800 md:col-span-2"
                >
                  Enregistrer la parcelle
                </button>
              </form>
            </div>
          )}

          {loading ? (
            <div className="text-center text-gray-500 py-10">Chargement...</div>
          ) : parcelles.length === 0 ? (
            <div className="bg-white rounded-2xl shadow p-8 text-center">
              <div className="text-5xl mb-4">🏞️</div>
              <p className="text-gray-500">Aucune parcelle enregistrée pour le moment.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {parcelles.map((parcelle, index) => (
                <motion.div
                  key={parcelle.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-xl shadow p-4 flex justify-between items-center"
                >
                  <div>
                    <p className="font-bold text-gray-800">{parcelle.su}</p>
                    <p className="text-gray-500 text-sm">
                      {parcelle.zone} — {parcelle.superficie_ares} ares {parcelle.superficie_ca} ca — {parcelle.usage}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-blue-700">${parcelle.prix_reel}</p>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      parcelle.statut === "disponible"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}>
                      {parcelle.statut}
                    </span>
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