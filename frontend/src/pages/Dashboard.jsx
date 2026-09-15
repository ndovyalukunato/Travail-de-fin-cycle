import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"

export default function Dashboard() {
  const navigate = useNavigate()

  const stats = [
    { titre: "Parcelles", valeur: "124", couleur: "bg-blue-500", icone: "🏞️" },
    { titre: "Transactions", valeur: "38", couleur: "bg-green-500", icone: "💰" },
    { titre: "Estimations IA", valeur: "56", couleur: "bg-purple-500", icone: "🤖" },
    { titre: "Fraudes détectées", valeur: "3", couleur: "bg-red-500", icone: "🔍" },
  ]

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Navbar */}
      <nav className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">🏛️ FoncierAI — Goma</h1>
        <div className="flex gap-4">
          <button onClick={() => navigate("/parcelles")} className="hover:underline">Parcelles</button>
          <button onClick={() => navigate("/estimation")} className="hover:underline">Estimation IA</button>
          <button onClick={() => navigate("/utilisateurs")} className="hover:underline">Utilisateurs</button>
          <button onClick={() => navigate("/")} className="bg-red-500 px-3 py-1 rounded-lg">Déconnexion</button>
        </div>
      </nav>

      {/* Contenu */}
      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Tableau de bord</h2>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-8">
          {stats.map((stat, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`${stat.couleur} text-white rounded-xl p-4 shadow-lg`}
            >
              <div className="text-3xl mb-2">{stat.icone}</div>
              <div className="text-3xl font-bold">{stat.valeur}</div>
              <div className="text-sm opacity-80">{stat.titre}</div>
            </motion.div>
          ))}
        </div>

        {/* Boutons rapides */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={() => navigate("/parcelles")}
            className="bg-white rounded-xl p-6 shadow text-left"
          >
            <div className="text-2xl mb-2">🏞️</div>
            <h3 className="font-bold text-gray-800">Gérer les parcelles</h3>
            <p className="text-gray-500 text-sm">Voir et ajouter des parcelles</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={() => navigate("/estimation")}
            className="bg-white rounded-xl p-6 shadow text-left"
          >
            <div className="text-2xl mb-2">🤖</div>
            <h3 className="font-bold text-gray-800">Estimation IA</h3>
            <p className="text-gray-500 text-sm">Prédire le prix d'une parcelle</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            onClick={() => navigate("/utilisateurs")}
            className="bg-white rounded-xl p-6 shadow text-left"
          >
            <div className="text-2xl mb-2">👥</div>
            <h3 className="font-bold text-gray-800">Gérer les utilisateurs</h3>
            <p className="text-gray-500 text-sm">Créer des comptes acheteur/vendeur</p>
          </motion.button>
        </div>
      </div>
    </div>
  )
}