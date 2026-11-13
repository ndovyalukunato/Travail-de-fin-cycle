import shutil
import tempfile
from pathlib import Path

from django.test import TestCase
from rest_framework.test import APIClient

from ia import apprentissage_continu as ac
from parcelles.models import Parcelle
from transactions.models import Transaction
from utilisateurs.models import Utilisateur


# Apprentissage continu : les modèles réapprennent avec les données réelles de l'application.
# Tout est écrit dans un dossier temporaire : les vrais modèles (ia/*.pkl) ne sont jamais modifiés.
class ApprentissageContinuTests(TestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        for f in ac.DOSSIER_IA.glob('*.pkl'):
            shutil.copy2(f, self.dossier / f.name)
        for f in ac.DOSSIER_IA.glob('metriques*.json'):
            shutil.copy2(f, self.dossier / f.name)
        self.admin = Utilisateur.objects.create(nom='Admin', email='a@t.cd', mot_de_passe='x', role='admin')
        vendeur = Utilisateur.objects.create(nom='V', email='v@t.cd', mot_de_passe='x', role='vendeur')
        acheteur = Utilisateur.objects.create(nom='B', email='b@t.cd', mot_de_passe='x', role='acheteur')
        # 3 ventes validées dans un lotissement inconnu de la mercuriale -> il doit être appris
        for i in range(3):
            p = Parcelle.objects.create(su=f'SU {i}', superficie_ares=4, superficie_ca=0, zone='birere', usage='residentiel',
                                        nature="certificat d'enregistrement", prix_reel=60000, proprietaire=vendeur,
                                        statut='vendue', verification='verifiee', verifie_par='admin')
            Transaction.objects.create(parcelle=p, acheteur=acheteur, vendeur=vendeur, montant=60000 + i * 1000,
                                       statut='terminée', hash_blockchain=f'0x{i}')

    def tearDown(self):
        shutil.rmtree(self.dossier, ignore_errors=True)

    def test_donnees_reelles_comptees(self):
        self.assertEqual(ac.compter_donnees_reelles(), {'ventes': 3, 'dossiers': 3})
        self.assertEqual(len(ac.donnees_reelles_prix()), 3)

    def test_reentrainement_apprend_un_nouveau_lotissement(self):
        entree = ac.reentrainer('test', force=True, dossier=self.dossier, nb_simules=2000)
        self.assertEqual(entree['prix']['statut'], 'adopte', entree)
        self.assertIn('birere', entree['prix']['zones_ajoutees'])
        import joblib
        self.assertIn('birere', list(joblib.load(self.dossier / 'label_encoder.pkl').classes_))
        self.assertIn(entree['authentification']['statut'], ('adopte', 'rejete', 'ignore'))
        self.assertTrue((self.dossier / 'journal_apprentissage.json').exists())
        self.assertTrue(any((self.dossier / 'historique').iterdir()))  # anciens modèles archivés
        self.assertEqual(ac.nouvelles_donnees(self.dossier), {'ventes': 0, 'dossiers': 0})

    def test_apprentissage_invisible_depuis_l_api(self):
        # L'apprentissage continu tourne seul en arrière-plan : aucune route ne l'expose, même à l'admin
        from django.urls import Resolver404, resolve
        with self.assertRaises(Resolver404):
            resolve('/api/ia/apprentissage/')
