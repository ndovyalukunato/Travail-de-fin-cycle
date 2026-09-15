import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion } from "framer-motion"
import axios from "axios"

export default function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [erreur, setErreur] = useState("")
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErreur("")
    try {
      const response = await axios.post("http://127.0.0.1:8000/api/connexion/", {
        email: email,
        mot_de_passe: password
      })
      // Sauvegarder le token et le rôle
      localStorage.setItem("token", response.data.token)
      localStorage.setItem("role", response.data.role)
      localStorage.setItem("nom", response.data.nom)

      // Rediriger selon le rôle
      if (response.data.role === "admin") {
        navigate("/dashboard")
      } else {
        navigate("/parcelles")
      }
    } catch (error) {
      setErreur("Email ou mot de passe incorrect")
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-600 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md"
      >
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-900">FoncierAI</h1>
          <p className="text-gray-500 mt-2">Gestion Foncière Intelligente</p>
        </div>

        {erreur && (
          <div className="bg-red-100 text-red-600 px-4 py-3 rounded-lg mb-4">
            {erreur}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <label className="block text-gray-700 font-semibold mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="votre@email.com"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-gray-700 font-semibold mb-2">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:outline-none focus:border-blue-500"
              required
            />
          </div>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            disabled={loading}
            className="w-full bg-blue-700 text-white font-bold py-3 rounded-lg hover:bg-blue-800 transition"
          >
            {loading ? "Connexion..." : "Se connecter"}
          </motion.button>
        </form>
      </motion.div>
    </div>
  )
}