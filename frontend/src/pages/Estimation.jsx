import { useState } from "react"
import { motion } from "framer-motion"
import axios from "axios"

export default function Estimation() {
  const [form, setForm] = useState({
    superficie: "",
    zone: "",
    infrastructure: "1"
  })
  const [resultat, setResultat] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    const token = localStorage.getItem("token")
    try {
      const response = await axios.post(
        "http://127.0.0.1:8000/api/estimer/",
        {
          superficie: parseFloat(form.superficie),
          zone: form.zone,
          infrastructure: parseInt(form.infrastructure)
        },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setResultat(response.data)
    } catch (error) {
      alert(
        error.response?.data
          ? JSON.stringify(error.response.data)
          : "Erreur de connexion avec l'API"
      )
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl mx-auto"
      >
        <h2 className="text-2xl font-bold text-blue-900 mb-6">🤖 Estimation IA du prix</h2>

        <div className="bg-white rounded-2xl shadow p-6 mb-6">
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-gray-700 font-semibold mb-2">Superficie (m²)</label>
              <input
                type="number"
                name="superficie"
                value={form.superficie}
                onChange={handleChange}
                placeholder="Ex: 200"
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-gray-700 font-semibold mb-2">Lotissement</label>
              <select
                name="zone"
                value={form.zone}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
                required
              >
                <option value="">-- Choisir --</option>
                <option value="Mapendo">Mapendo</option>
                <option value="Les Volcans">Les Volcans</option>
                <option value="Katindo">Katindo</option>
                <option value="Lac-Vert">Lac-Vert</option>
              </select>
            </div>

            <div className="mb-6">
              <label className="block text-gray-700 font-semibold mb-2">Infrastructure</label>
              <select
                name="infrastructure"
                value={form.infrastructure}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
              >
                <option value="1">Avec électricité/eau</option>
                <option value="0">Sans infrastructure</option>
              </select>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full bg-blue-700 text-white font-bold py-3 rounded-lg hover:bg-blue-800 transition"
            >
              {loading ? "Calcul en cours..." : "Estimer le prix"}
            </motion.button>
          </form>
        </div>

        {/* Résultats */}
        {resultat && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow p-6"
          >
            <h3 className="text-xl font-bold text-gray-800 mb-4">📊 Résultats</h3>

            <div className="grid grid-cols-1 gap-3">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">Régression Linéaire</p>
                <p className="text-2xl font-bold text-blue-700">
                  ${resultat.estimation.regression_lineaire.toLocaleString()}
                </p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">Random Forest</p>
                <p className="text-2xl font-bold text-purple-700">
                  ${resultat.estimation.random_forest.toLocaleString()}
                </p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-gray-500">Prix moyen estimé</p>
                <p className="text-2xl font-bold text-green-700">
                  ${resultat.estimation.moyenne.toLocaleString()}
                </p>
              </div>
              <div className={`rounded-lg p-4 ${resultat.fraude.est_fraude ? "bg-red-50" : "bg-gray-50"}`}>
                <p className="text-sm text-gray-500">Détection fraude</p>
                <p className={`font-bold ${resultat.fraude.est_fraude ? "text-red-600" : "text-green-600"}`}>
                  {resultat.fraude.message}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}