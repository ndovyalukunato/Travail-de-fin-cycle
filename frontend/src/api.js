import axios from "axios" // bibliothèque pour envoyer des requêtes HTTP au backend

// Adresse du backend Django (modifiable via frontend/.env : VITE_API_URL=http://...)
export const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api"

// Client HTTP commun : toutes les pages l'utilisent (api.get("/parcelles/"), api.post(...))
const api = axios.create({ baseURL: API_URL })

// Ajoute automatiquement le token JWT à chaque requête
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token") // token enregistré à la connexion
  if (token) config.headers.Authorization = `Bearer ${token}` // en-tête attendu par Django
  return config // la requête continue avec l'en-tête ajouté
})

// Token expiré ou invalide -> retour à la page de connexion
api.interceptors.response.use(
  (response) => response, // réponse normale : rien à faire
  (error) => {
    // 401 = non authentifié : le token n'est plus valable
    if (error.response?.status === 401 && localStorage.getItem("token")) {
      localStorage.clear() // oublie le token, le rôle et le nom
      window.location.href = "/" // renvoie à la page de connexion
    }
    return Promise.reject(error) // transmet l'erreur à la page qui a fait la requête
  }
)

// Transforme une erreur DRF ({champ: ["message"]}) en texte lisible
export function messageErreur(error, defaut = "Erreur de connexion avec le serveur.") {
  const data = error.response?.data // contenu de la réponse d'erreur du backend
  if (!data) return defaut // pas de réponse (serveur éteint, réseau...)
  if (typeof data === "string") return defaut // page d'erreur HTML : message générique
  if (data.erreur) return data.erreur // format {erreur: "..."} utilisé par nos vues
  if (data.detail) return data.detail // format {detail: "..."} utilisé par DRF (403, 503...)
  // Erreurs de validation : {"email": ["déjà utilisé"]} -> "email : déjà utilisé"
  return Object.entries(data)
    .map(([champ, msg]) => `${champ} : ${Array.isArray(msg) ? msg.join(" ") : msg}`)
    .join(" — ")
}

// Affiche un montant au format français : 125000 -> "$125 000" (ou "—" si vide)
export const formatMontant = (m) =>
  m === null || m === undefined || m === ""
    ? "—"
    : `$${parseFloat(m).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}`

// Met une majuscule au début de chaque mot : "lac-vert" -> "Lac-Vert"
export const capitaliser = (z = "") => z.replace(/(^|[\s-])\S/g, (c) => c.toUpperCase())

export default api
