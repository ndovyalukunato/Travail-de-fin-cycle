import shutil  # suppression du dossier temporaire des fichiers envoyés
import tempfile  # dossier temporaire pour les fichiers envoyés pendant les tests

from django.core.files.uploadedfile import SimpleUploadedFile  # faux fichier envoyé
from django.test import TestCase, override_settings  # tests avec une base de données temporaire
from rest_framework.test import APIClient  # client HTTP de test pour l'API

from parcelles.models import Parcelle
from utilisateurs.models import Utilisateur

DOSSIER_MEDIA = tempfile.mkdtemp()  # les pièces des tests ne vont pas dans le vrai dossier media/


# Circuit complet : dépôt des pièces -> vérification par l'admin -> discussion -> offre
@override_settings(MEDIA_ROOT=DOSSIER_MEDIA)
class CircuitParcelleTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(DOSSIER_MEDIA, ignore_errors=True)

    def setUp(self):
        # Un utilisateur de chaque rôle, plus un second acheteur
        self.admin = Utilisateur.objects.create(nom='Admin', email='a@test.cd', mot_de_passe='x', role='admin')
        self.vendeur = Utilisateur.objects.create(nom='Vendeur', email='v@test.cd', mot_de_passe='x', role='vendeur')
        self.acheteur = Utilisateur.objects.create(nom='Acheteur', email='b@test.cd', mot_de_passe='x', role='acheteur')
        self.autre = Utilisateur.objects.create(nom='Autre', email='c@test.cd', mot_de_passe='x', role='acheteur')

    def client_de(self, utilisateur):
        """Client HTTP connecté en tant que l'utilisateur donné."""
        client = APIClient()
        client.force_authenticate(user=utilisateur)
        return client

    def donnees_parcelle(self, **extra):
        return {
            'su': 'SU:1', 'superficie_ha': 0, 'superficie_ares': 4, 'superficie_ca': 0, 'superficie_pourcent': 0,
            'zone': 'mapendo', 'usage': 'residentiel', 'nature': "certificat d'enregistrement",
            'prix_reel': 20000, 'statut': 'disponible', **extra,
        }

    def creer_parcelle(self):
        """Le vendeur enregistre une parcelle avec une photo de son titre."""
        photo = SimpleUploadedFile('titre.jpg', b'contenu-image', content_type='image/jpeg')
        reponse = self.client_de(self.vendeur).post(
            '/api/parcelles/', self.donnees_parcelle(documents=[photo]), format='multipart',
        )
        self.assertEqual(reponse.status_code, 201, reponse.data)
        return reponse.data

    def test_piece_justificative_obligatoire(self):
        reponse = self.client_de(self.vendeur).post('/api/parcelles/', self.donnees_parcelle(), format='multipart')
        self.assertEqual(reponse.status_code, 400)
        self.assertFalse(Parcelle.objects.exists())

    def test_format_de_fichier_refuse(self):
        programme = SimpleUploadedFile('virus.exe', b'x', content_type='application/octet-stream')
        reponse = self.client_de(self.vendeur).post(
            '/api/parcelles/', self.donnees_parcelle(documents=[programme]), format='multipart',
        )
        self.assertEqual(reponse.status_code, 400)
        self.assertFalse(Parcelle.objects.exists())

    def test_verification_par_l_admin(self):
        parcelle = self.creer_parcelle()
        self.assertEqual(parcelle['verification'], 'en_attente')
        self.assertEqual(parcelle['nb_documents'], 1)
        url = f"/api/parcelles/{parcelle['id']}/"

        # Tant qu'elle n'est pas vérifiée, l'acheteur ne la voit pas et ne peut pas faire d'offre
        acheteur = self.client_de(self.acheteur)
        self.assertEqual(acheteur.get('/api/parcelles/').data, [])
        offre = acheteur.post('/api/transactions/', {'parcelle': parcelle['id'], 'montant': 20000}, format='json')
        self.assertEqual(offre.status_code, 403)

        # Les pièces sont réservées au propriétaire et à l'admin
        pieces = self.client_de(self.vendeur).get(url + 'documents/').data
        self.assertEqual(len(pieces), 1)
        fichier = f"/api/documents/{pieces[0]['id']}/fichier/"
        self.assertEqual(acheteur.get(fichier).status_code, 404)
        reponse = self.client_de(self.admin).get(fichier)
        self.assertEqual(reponse.status_code, 200)
        self.assertEqual(b''.join(reponse.streaming_content), b'contenu-image')

        # Seul l'admin décide ; un rejet exige un motif
        self.assertEqual(self.client_de(self.vendeur).post(url + 'verifier/', {'decision': 'verifiee'}, format='json').status_code, 403)
        admin = self.client_de(self.admin)
        self.assertEqual(admin.post(url + 'verifier/', {'decision': 'rejetee'}, format='json').status_code, 400)
        rejet = admin.post(url + 'verifier/', {'decision': 'rejetee', 'motif': 'Titre illisible'}, format='json')
        self.assertEqual(rejet.data['verification'], 'rejetee')

        # Le vendeur ajoute une pièce : le dossier repasse en attente
        pdf = SimpleUploadedFile('titre.pdf', b'%PDF', content_type='application/pdf')
        ajout = self.client_de(self.vendeur).post(url + 'documents/', {'documents': [pdf]}, format='multipart')
        self.assertEqual(len(ajout.data), 2)
        self.assertEqual(Parcelle.objects.get(id=parcelle['id']).verification, 'en_attente')

        # Une fois vérifiée, la parcelle est proposée aux acheteurs
        self.assertEqual(admin.post(url + 'verifier/', {'decision': 'verifiee'}, format='json').data['verification'], 'verifiee')
        self.assertEqual(len(acheteur.get('/api/parcelles/').data), 1)
        # ... et le vendeur ne peut plus retirer les pièces
        self.assertEqual(self.client_de(self.vendeur).delete(f"/api/documents/{pieces[0]['id']}/").status_code, 403)

    def test_discussion_et_marchandage(self):
        parcelle = self.creer_parcelle()
        acheteur, vendeur = self.client_de(self.acheteur), self.client_de(self.vendeur)

        # Pas de discussion sur une parcelle non vérifiée
        self.assertEqual(acheteur.post('/api/conversations/', {'parcelle': parcelle['id']}, format='json').status_code, 403)
        Parcelle.objects.filter(id=parcelle['id']).update(verification='verifiee')

        # Seul un acheteur ouvre une discussion ; la rouvrir renvoie la même
        self.assertEqual(vendeur.post('/api/conversations/', {'parcelle': parcelle['id']}, format='json').status_code, 403)
        conversation = acheteur.post('/api/conversations/', {'parcelle': parcelle['id']}, format='json').data
        encore = acheteur.post('/api/conversations/', {'parcelle': parcelle['id']}, format='json').data
        self.assertEqual(conversation['id'], encore['id'])
        url = f"/api/conversations/{conversation['id']}/messages/"

        # Un message vide est refusé ; une proposition de prix seule est acceptée
        self.assertEqual(acheteur.post(url, {'contenu': '  '}, format='json').status_code, 400)
        self.assertEqual(acheteur.post(url, {'contenu': 'Bonjour', 'prix_propose': 15000}, format='json').status_code, 201)

        # Le vendeur a un message non lu, qui est marqué lu quand il ouvre la discussion
        self.assertEqual(vendeur.get('/api/conversations/non_lus/').data['non_lus'], 1)
        messages = vendeur.get(url).data
        self.assertEqual(len(messages), 1)
        self.assertFalse(messages[0]['de_moi'])
        self.assertEqual(vendeur.get('/api/conversations/non_lus/').data['non_lus'], 0)
        self.assertEqual(vendeur.post(url, {'prix_propose': 18000}, format='json').status_code, 201)

        # Un tiers n'y a pas accès ; l'admin non plus (discussions privées)
        self.assertEqual(self.client_de(self.autre).get(url).status_code, 404)
        admin = self.client_de(self.admin)
        self.assertEqual(admin.get(url).status_code, 403)
        self.assertEqual(admin.get('/api/conversations/').status_code, 403)
        self.assertEqual(admin.post(url, {'contenu': 'x'}, format='json').status_code, 403)
        self.assertEqual(acheteur.get('/api/conversations/non_lus/').data['non_lus'], 1)
