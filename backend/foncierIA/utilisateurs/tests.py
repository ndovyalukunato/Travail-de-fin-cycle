from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient

from parcelles.models import Parcelle
from transactions.models import Transaction

from .models import Utilisateur

ADR_A = '0x' + 'a' * 40
ADR_B = '0x' + 'b' * 40


# Gestion des comptes par l'administrateur : suppression, adresse proposée, unicité des adresses
class GestionComptesTests(TestCase):
    def setUp(self):
        self.admin = Utilisateur.objects.create(nom='Admin', email='admin@t.cd', mot_de_passe='x', role='admin')
        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def creer(self, email, **extra):
        return Utilisateur.objects.create(nom=email, email=email, mot_de_passe='x', role='vendeur', **extra)

    # ---------------------------------------------------------------- suppression
    def test_supprime_un_compte_sans_parcelle_ni_vente(self):
        u = self.creer('neuf@t.cd')
        self.assertTrue(self.client.get(f'/api/utilisateurs/{u.id}/').data['supprimable'])
        self.assertEqual(self.client.delete(f'/api/utilisateurs/{u.id}/').status_code, 204)
        self.assertFalse(Utilisateur.objects.filter(pk=u.id).exists())

    def test_refuse_si_le_compte_a_une_parcelle(self):
        u = self.creer('vendeur@t.cd')
        Parcelle.objects.create(su='SU 1', superficie_ares=3, superficie_ca=0, zone='katindo', usage='residentiel',
                                nature='certificat', prix_reel=1000, proprietaire=u)
        self.assertFalse(self.client.get(f'/api/utilisateurs/{u.id}/').data['supprimable'])
        self.assertEqual(self.client.delete(f'/api/utilisateurs/{u.id}/').status_code, 400)
        self.assertTrue(Utilisateur.objects.filter(pk=u.id).exists())

    def test_refuse_si_le_compte_a_une_vente(self):
        vendeur, acheteur = self.creer('v@t.cd'), self.creer('a@t.cd')
        p = Parcelle.objects.create(su='SU 2', superficie_ares=3, superficie_ca=0, zone='katindo', usage='residentiel',
                                    nature='certificat', prix_reel=1000, proprietaire=vendeur)
        Transaction.objects.create(parcelle=p, acheteur=acheteur, vendeur=vendeur, montant=1000)
        self.assertEqual(self.client.delete(f'/api/utilisateurs/{acheteur.id}/').status_code, 400)

    def test_l_admin_ne_peut_pas_supprimer_son_propre_compte(self):
        self.assertEqual(self.client.delete(f'/api/utilisateurs/{self.admin.id}/').status_code, 400)

    # ---------------------------------------------------------------- adresse proposée
    def test_adresse_proposee_est_le_premier_compte_ganache_libre(self):
        self.creer('x@t.cd', adresse_ethereum=ADR_A)
        with mock.patch('utilisateurs.adresses.comptes_ganache', return_value=[ADR_A.upper().replace('0X', '0x'), ADR_B]):
            r = self.client.get('/api/utilisateurs/adresse_proposee/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data, {'adresse': ADR_B, 'origine': 'ganache'})

    def test_adresse_generee_si_ganache_indisponible(self):
        with mock.patch('utilisateurs.adresses.comptes_ganache', return_value=[]):
            r = self.client.get('/api/utilisateurs/adresse_proposee/')
        self.assertEqual(r.data['origine'], 'generee')
        self.assertRegex(r.data['adresse'], r'^0x[0-9a-fA-F]{40}$')

    def test_adresse_proposee_reservee_a_l_admin(self):
        c = APIClient()
        c.force_authenticate(user=self.creer('v2@t.cd'))
        self.assertEqual(c.get('/api/utilisateurs/adresse_proposee/').status_code, 403)

    # ---------------------------------------------------------------- unicité
    def test_adresse_unique_a_la_creation(self):
        self.creer('x@t.cd', adresse_ethereum=ADR_A)
        r = self.client.post('/api/utilisateurs/', {'nom': 'Y', 'email': 'y@t.cd', 'mot_de_passe': 'abcd',
                                                    'role': 'acheteur', 'adresse_ethereum': ADR_A.upper().replace('0X', '0x')},
                             format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('adresse_ethereum', r.data)

    def test_adresse_unique_a_la_modification(self):
        self.creer('x@t.cd', adresse_ethereum=ADR_A)
        u = self.creer('y@t.cd', adresse_ethereum=ADR_B)
        r = self.client.patch(f'/api/utilisateurs/{u.id}/', {'adresse_ethereum': ADR_A}, format='json')
        self.assertEqual(r.status_code, 400)
        # garder sa propre adresse reste possible
        r = self.client.patch(f'/api/utilisateurs/{u.id}/', {'adresse_ethereum': ADR_B}, format='json')
        self.assertEqual(r.status_code, 200)

    def test_plusieurs_comptes_sans_adresse(self):
        for email in ('p@t.cd', 'q@t.cd'):
            r = self.client.post('/api/utilisateurs/', {'nom': email, 'email': email, 'mot_de_passe': 'abcd',
                                                        'role': 'acheteur', 'adresse_ethereum': ''}, format='json')
            self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(Utilisateur.objects.filter(adresse_ethereum__isnull=True).count(), 3)  # admin compris
