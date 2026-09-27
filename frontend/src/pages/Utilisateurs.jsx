import { useState, useEffect } from 'react'; // hooks React : état local et effets
import { Users, UserPlus, Wallet, Pencil, Check, X, TriangleAlert, Eye, EyeOff } from 'lucide-react'; // icônes
import Layout from '../components/Layout'; // mise en page commune
import { Alert, Button, Card, Chargement, EmptyState, Field, PageHeader } from '../components/ui'; // composants d'interface
import api, { messageErreur } from '../api'; // client HTTP et fonction de message d'erreur

// Libellé et couleurs du badge de chaque rôle
const ROLES = {
  acheteur: { label: 'Acheteur', cls: 'bg-marine-50 text-marine-700 ring-marine-100' },
  vendeur: { label: 'Vendeur', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  admin: { label: 'Admin', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
};

// Page "Gestion des utilisateurs" (administrateur uniquement)
function Utilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState([]); // comptes reçus du backend
  const [chargement, setChargement] = useState(true); // chargement de la liste en cours
  const [version, setVersion] = useState(0); // incrémenté pour recharger
  const [erreur, setErreur] = useState(''); // message d'erreur
  const [succes, setSucces] = useState(''); // message de succès
  const [envoi, setEnvoi] = useState(false); // création du compte en cours

  // Champs du formulaire de création
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [voirMotDePasse, setVoirMotDePasse] = useState(false); // afficher le mot de passe en clair ?
  const [role, setRole] = useState('acheteur');
  const [adresseEth, setAdresseEth] = useState('');
  const [edition, setEdition] = useState({}); // { idUtilisateur: adresse en cours de saisie }

  // Charge la liste des comptes (au début et après chaque modification)
  useEffect(() => {
    api.get('/utilisateurs/')
      .then((res) => setUtilisateurs(res.data))
      .catch(() => setErreur("Impossible de charger la liste des utilisateurs."))
      .finally(() => setChargement(false));
  }, [version]);

  // Création d'un compte
  const handleSubmit = async (e) => {
    e.preventDefault(); // empêche le rechargement de la page
    setErreur('');
    setSucces('');
    setEnvoi(true);
    try {
      await api.post('/utilisateurs/', {
        nom, email, mot_de_passe: motDePasse, role,
        adresse_ethereum: adresseEth || null, // null si le champ est vide
      });
      setSucces(`Compte ${ROLES[role].label.toLowerCase()} créé avec succès pour ${nom}.`);
      // Vide le formulaire
      setNom('');
      setEmail('');
      setMotDePasse('');
      setRole('acheteur');
      setAdresseEth('');
      setVersion((v) => v + 1); // recharge la liste
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de la création du compte. Vérifiez les informations."));
    }
    setEnvoi(false);
  };

  // Quitte le mode édition de l'adresse Ethereum d'un utilisateur
  const annulerEdition = (id) =>
    setEdition((e) => { const copie = { ...e }; delete copie[id]; return copie; });

  // Enregistre la nouvelle adresse Ethereum d'un utilisateur
  const enregistrerAdresse = async (u) => {
    setErreur('');
    setSucces('');
    try {
      await api.patch(`/utilisateurs/${u.id}/`, { adresse_ethereum: edition[u.id] || null });
      setSucces(`Adresse Ethereum de ${u.nom} mise à jour.`);
      annulerEdition(u.id);
      setVersion((v) => v + 1); // recharge la liste
    } catch (err) {
      setErreur(messageErreur(err, "Erreur lors de la mise à jour de l'adresse."));
    }
  };

  // Nombre d'acheteurs/vendeurs sans adresse Ethereum (leurs ventes ne pourront pas être validées)
  const sansAdresse = utilisateurs.filter((u) => u.role !== 'admin' && !u.adresse_ethereum).length;

  return (
    <Layout titre="Utilisateurs">
      <PageHeader
        icon={Users}
        titre="Gestion des utilisateurs"
        description="Créez les comptes et renseignez les adresses Ethereum nécessaires à la validation des ventes."
      />

      {/* Messages de succès et d'erreur */}
      {succes && <Alert type="succes" onClose={() => setSucces('')} className="mb-4">{succes}</Alert>}
      {erreur && <Alert type="erreur" onClose={() => setErreur('')} className="mb-4">{erreur}</Alert>}

      {/* Deux colonnes : formulaire (2/5) et liste des comptes (3/5) */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Formulaire de création de compte */}
        <Card titre="Nouveau compte" icon={UserPlus} className="h-fit lg:col-span-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nom complet" htmlFor="nom" requis>
              <input id="nom" type="text" autoComplete="off" value={nom} onChange={(e) => setNom(e.target.value)} required className="champ" />
            </Field>
            <Field label="Email" htmlFor="email" requis>
              <input id="email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required className="champ" />
            </Field>
            {/* Mot de passe avec bouton "œil" pour l'afficher ou le masquer */}
            <Field label="Mot de passe" htmlFor="mdp" requis aide="4 caractères minimum.">
              <div className="relative">
                <input
                  id="mdp"
                  type={voirMotDePasse ? 'text' : 'password'}
                  autoComplete="new-password"
                  minLength={4}
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                  className="champ pr-10"
                />
                <button
                  type="button"
                  onClick={() => setVoirMotDePasse(!voirMotDePasse)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
                  aria-label={voirMotDePasse ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {voirMotDePasse ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            <Field label="Rôle" htmlFor="role" requis>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className="champ">
                <option value="acheteur">Acheteur</option>
                <option value="vendeur">Vendeur</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label="Adresse Ethereum" htmlFor="eth" aide="Nécessaire pour valider une vente sur la blockchain (compte Ganache).">
              <input
                id="eth"
                type="text"
                value={adresseEth}
                onChange={(e) => setAdresseEth(e.target.value)}
                placeholder="0x..."
                className="champ font-mono"
              />
            </Field>
            <Button type="submit" icon={UserPlus} chargement={envoi} className="w-full">Créer le compte</Button>
          </form>
        </Card>

        {/* Liste des comptes existants */}
        <Card titre={`Comptes existants (${utilisateurs.length})`} icon={Users} padding={false} className="lg:col-span-3">
          {/* Avertissement si des comptes n'ont pas d'adresse Ethereum */}
          {sansAdresse > 0 && (
            <Alert type="attention" className="m-4 mb-0">
              {sansAdresse} compte(s) sans adresse Ethereum : leurs ventes ne pourront pas être validées.
            </Alert>
          )}
          {chargement ? (
            <Chargement texte="Chargement des comptes..." />
          ) : utilisateurs.length === 0 ? (
            <EmptyState icon={Users} titre="Aucun compte" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Utilisateur</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Rôle</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Adresse Ethereum</th>
                  </tr>
                </thead>
                {/* Une ligne par utilisateur */}
                <tbody className="divide-y divide-slate-100">
                  {utilisateurs.map((u) => (
                    <tr key={u.id} className="transition hover:bg-marine-50/50">
                      {/* Nom et email */}
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{u.nom}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      {/* Badge du rôle */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${ROLES[u.role]?.cls}`}>
                          {ROLES[u.role]?.label || u.role}
                        </span>
                      </td>
                      {/* Adresse Ethereum : affichage, ou champ de saisie en mode édition */}
                      <td className="px-4 py-3">
                        {u.id in edition ? (
                          // Mode édition : Entrée pour enregistrer, Échap pour annuler
                          <div className="flex items-center gap-1">
                            <input
                              value={edition[u.id]}
                              onChange={(e) => setEdition({ ...edition, [u.id]: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') enregistrerAdresse(u);
                                if (e.key === 'Escape') annulerEdition(u.id);
                              }}
                              placeholder="0x..."
                              aria-label={`Adresse Ethereum de ${u.nom}`}
                              autoFocus
                              className="champ py-1.5 font-mono text-xs"
                            />
                            <button onClick={() => enregistrerAdresse(u)} className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50" aria-label="Enregistrer">
                              <Check className="size-4" />
                            </button>
                            <button onClick={() => annulerEdition(u.id)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Annuler">
                              <X className="size-4" />
                            </button>
                          </div>
                        ) : (
                          // Mode affichage : un clic ouvre l'édition
                          <button
                            onClick={() => setEdition({ ...edition, [u.id]: u.adresse_ethereum || '' })}
                            className={`group inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs hover:bg-slate-100 ${
                              u.adresse_ethereum ? 'font-mono text-slate-600' : 'font-medium text-amber-700'
                            }`}
                            title={u.adresse_ethereum || 'Ajouter une adresse'}
                          >
                            {/* Adresse abrégée, "Non requise" (admin) ou "À renseigner" */}
                            {u.adresse_ethereum ? (
                              <><Wallet className="size-3.5" aria-hidden /> {u.adresse_ethereum.slice(0, 8)}…{u.adresse_ethereum.slice(-4)}</>
                            ) : u.role === 'admin' ? (
                              <span className="font-normal text-slate-400">Non requise</span>
                            ) : (
                              <><TriangleAlert className="size-3.5" aria-hidden /> À renseigner</>
                            )}
                            <Pencil className="size-3 opacity-0 transition group-hover:opacity-60" aria-hidden />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}

export default Utilisateurs;
