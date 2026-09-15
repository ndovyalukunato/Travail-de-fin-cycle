import { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

function Utilisateurs() {
  const navigate = useNavigate();
  const [utilisateurs, setUtilisateurs] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [role, setRole] = useState('acheteur');

  const token = localStorage.getItem('token');

  const chargerUtilisateurs = async () => {
    try {
      const res = await axios.get(
        'http://127.0.0.1:8000/api/utilisateurs/',
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setUtilisateurs(res.data);
    } catch (err) {
      setErreur("Impossible de charger la liste des utilisateurs.");
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    chargerUtilisateurs();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur('');
    setSucces('');

    try {
      await axios.post(
        'http://127.0.0.1:8000/api/utilisateurs/',
        { nom, email, mot_de_passe: motDePasse, role },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSucces(`Compte ${role} créé avec succès pour ${nom}.`);
      setNom('');
      setEmail('');
      setMotDePasse('');
      setRole('acheteur');
      chargerUtilisateurs();
    } catch (err) {
      setErreur(
        err.response?.data?.email?.[0] ||
        "Erreur lors de la création du compte. Vérifiez les informations."
      );
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-blue-900 text-white px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold">FoncierAI — Gestion des utilisateurs</h1>
        <button
          onClick={() => navigate('/dashboard')}
          className="text-white underline"
        >
          Retour au tableau de bord
        </button>
      </nav>

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Créer un nouveau compte</h2>

          {erreur && (
            <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
              {erreur}
            </div>
          )}
          {succes && (
            <div className="bg-green-100 text-green-700 p-3 rounded mb-4">
              {succes}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Nom complet</label>
              <input
                type="text"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Mot de passe</label>
              <input
                type="password"
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                required
                className="w-full border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Rôle</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="w-full border rounded px-3 py-2"
              >
                <option value="acheteur">Acheteur</option>
                <option value="vendeur">Vendeur</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <button
              type="submit"
              className="bg-blue-900 text-white px-4 py-2 rounded hover:bg-blue-800"
            >
              Créer le compte
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Comptes existants</h2>

          {chargement ? (
            <p>Chargement...</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Nom</th>
                  <th className="py-2">Email</th>
                  <th className="py-2">Rôle</th>
                </tr>
              </thead>
              <tbody>
                {utilisateurs.map((u) => (
                  <tr key={u.id} className="border-b">
                    <td className="py-2">{u.nom}</td>
                    <td className="py-2">{u.email}</td>
                    <td className="py-2 capitalize">{u.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export default Utilisateurs;