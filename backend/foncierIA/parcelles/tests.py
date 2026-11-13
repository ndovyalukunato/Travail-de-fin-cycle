import io
import shutil
import tempfile
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from ia.modele import controler_prix, superficie_en_m2
from parcelles.models import DocumentOfficiel, Parcelle
from utilisateurs.models import Utilisateur

DOSSIER_MEDIA = tempfile.mkdtemp()
PHOTO_CERTIFICAT = Path(settings.BASE_DIR).parent / 'documentFoncier' / 'dc.jpeg'


def autre_image():
    """Photo d'un document différent (motif sans rapport avec le certificat)."""
    img = Image.new('L', (400, 300))
    img.putdata([((x * 7) ^ (y * 13)) % 256 for y in range(300) for x in range(400)])
    tampon = io.BytesIO()
    img.save(tampon, 'JPEG')
    return SimpleUploadedFile('faux_titre.jpg', tampon.getvalue(), content_type='image/jpeg')


def photo_certificat():
    return SimpleUploadedFile('titre.jpeg', PHOTO_CERTIFICAT.read_bytes(), content_type='image/jpeg')


# Authentification des dossiers par le réseau de neurones, lancée par l'administrateur
@override_settings(MEDIA_ROOT=DOSSIER_MEDIA)
class AuthentificationReseauTests(TestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(DOSSIER_MEDIA, ignore_errors=True)

    def setUp(self):
        self.admin = Utilisateur.objects.create(nom='Admin', email='a@test.cd', mot_de_passe='x', role='admin')
        self.vendeur = Utilisateur.objects.create(nom='KASEREKA MUHINDO Jules', email='v@test.cd',
                                                  mot_de_passe='x', role='vendeur')
        self.faussaire = Utilisateur.objects.create(nom='Paluku Bahati', email='f@test.cd',
                                                    mot_de_passe='x', role='vendeur')
        doc = DocumentOfficiel.objects.create(
            numero='Vol. G1/98 Folio 194', type_document='certificat', su='SU 27.598',
            titulaire='KASEREKA MUHINDO Jules', zone='katindo', superficie_m2=Decimal('286.50'),
        )
        doc.scan.save('certificat.jpeg', photo_certificat(), save=True)

    def client_de(self, utilisateur):
        c = APIClient()
        c.force_authenticate(user=utilisateur)
        return c

    def deposer(self, vendeur, piece, ares=2, ca=86, pourcent=50, prix=None, **extra):
        superficie = superficie_en_m2(0, ares, ca, pourcent)
        if prix is None:
            prix = controler_prix(superficie, 'katindo', 1, 1)['prix_estime']  # prix proposé par le système
        donnees = {'su': 'SU 27.598', 'superficie_ha': 0, 'superficie_ares': ares, 'superficie_ca': ca,
                   'superficie_pourcent': pourcent, 'zone': 'katindo', 'usage': 'residentiel',
                   'nature': "certificat d'enregistrement", 'prix_reel': prix, 'documents': [piece], **extra}
        r = self.client_de(vendeur).post('/api/parcelles/', donnees, format='multipart')
        self.assertEqual(r.status_code, 201, r.content)
        return Parcelle.objects.get(pk=r.data['id'])

    def test_le_vendeur_fixe_librement_son_prix(self):
        # Prix très éloigné du prix proposé par l'IA : accepté au dépôt comme en modification
        estime = controler_prix(superficie_en_m2(0, 2, 86, 50), 'katindo', 1, 1)['prix_estime']
        p = self.deposer(self.vendeur, photo_certificat(), prix=round(estime * 3))
        self.assertEqual(float(p.prix_reel), round(estime * 3))
        r = self.client_de(self.vendeur).patch(f'/api/parcelles/{p.id}/', {'prix_reel': round(estime * 0.4)}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(float(r.data['prix_reel']), round(estime * 0.4))
        self.assertIsNotNone(r.data['prix_estime'])  # le prix proposé par l'IA reste calculé

    def test_aucune_verification_automatique_au_depot(self):
        p = self.deposer(self.vendeur, photo_certificat(), titre_foncier='Vol. G1/98 Folio 194')
        self.assertEqual(p.verification, 'en_attente')
        self.assertIsNone(p.rapport_verification)

    def test_seul_l_admin_lance_l_authentification(self):
        p = self.deposer(self.vendeur, photo_certificat())
        r = self.client_de(self.vendeur).post(f'/api/parcelles/{p.id}/authentifier/')
        self.assertEqual(r.status_code, 403)

    def test_dossier_authentique(self):
        p = self.deposer(self.vendeur, photo_certificat(), titre_foncier='Vol. G1/98 Folio 194')
        r = self.client_de(self.admin).post(f'/api/parcelles/{p.id}/authentifier/')
        self.assertEqual(r.status_code, 200, r.content)
        rapport = r.data['rapport_verification']
        self.assertEqual(rapport['resultat'], 'authentique', rapport)
        self.assertGreaterEqual(rapport['probabilite'], 0.8)
        self.assertEqual(r.data['verification'], 'verifiee')
        self.assertEqual(r.data['verifie_par'], 'ia')

    def test_dossier_falsifie_reste_en_attente(self):
        # Autre titulaire, superficie gonflée, photo d'un autre document
        p = self.deposer(self.faussaire, autre_image(), ares=6, ca=0, pourcent=0)
        r = self.client_de(self.admin).post(f'/api/parcelles/{p.id}/authentifier/')
        rapport = r.data['rapport_verification']
        self.assertIn(rapport['resultat'], ('falsifie', 'douteux'), rapport)
        self.assertLess(rapport['probabilite'], 0.8)
        self.assertEqual(r.data['verification'], 'en_attente')  # l'admin décide

    def test_parcelle_inscrite_sur_la_blockchain_figee_meme_pour_l_admin(self):
        from transactions.models import Transaction
        acheteur = Utilisateur.objects.create(nom='Acheteur', email='b@test.cd', mot_de_passe='x', role='acheteur',
                                              adresse_ethereum='0x' + '1' * 40)
        self.vendeur.adresse_ethereum = '0x' + '2' * 40
        self.vendeur.save()
        p = self.deposer(self.vendeur, photo_certificat())
        Transaction.objects.create(parcelle=p, acheteur=acheteur, vendeur=self.vendeur, montant=1000,
                                   statut='terminée', hash_blockchain='0xabc')
        Parcelle.objects.filter(pk=p.pk).update(statut='vendue', hash_blockchain='0xabc')
        admin = self.client_de(self.admin)
        self.assertEqual(admin.patch(f'/api/parcelles/{p.id}/', {'su': 'SU 1'}, format='json').status_code, 403)
        self.assertEqual(admin.post(f'/api/parcelles/{p.id}/documents/', {'documents': [autre_image()]},
                                    format='multipart').status_code, 403)
        piece = p.documents.first()
        self.assertEqual(admin.delete(f'/api/documents/{piece.id}/').status_code, 403)
        # adresse Ethereum utilisée dans le smart contract : non modifiable, compte non supprimable
        r = admin.patch(f'/api/utilisateurs/{acheteur.id}/', {'adresse_ethereum': '0x' + '3' * 40}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(admin.delete(f'/api/utilisateurs/{acheteur.id}/').status_code, 400)
        self.assertTrue(admin.get(f'/api/utilisateurs/{acheteur.id}/').data['adresse_verrouillee'])

    def test_authentification_de_tous_les_dossiers_en_attente(self):
        self.deposer(self.vendeur, photo_certificat(), titre_foncier='Vol. G1/98 Folio 194')
        r = self.client_de(self.admin).post('/api/parcelles/authentifier_en_attente/')
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['analyses'], 1)
        self.assertEqual(r.data['authentique'], 1)
