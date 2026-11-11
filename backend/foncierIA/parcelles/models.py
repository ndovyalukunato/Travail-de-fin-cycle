from django.db import models  # outils pour définir les tables de la base de données
from utilisateurs.models import Utilisateur  # chaque parcelle appartient à un utilisateur


# Table des parcelles (terrains) enregistrées au cadastre
class Parcelle(models.Model):
    # Usages possibles du terrain : (valeur en base, libellé affiché)
    USAGE_CHOICES = [
        ('residentiel', 'Résidentiel'),
        ('commercial', 'Commercial'),
        ('autre', 'Autre'),
    ]
    # Statuts possibles de la parcelle
    STATUT_CHOICES = [
        ('disponible', 'Disponible'),  # proposée aux acheteurs
        ('vendue', 'Vendue'),  # vente validée par l'admin (définitif)
        ('en_negociation', 'En négociation'),  # offre acceptée ou retirée temporairement de la vente
    ]

    # Contrôle d'authenticité par l'administrateur, à partir des pièces justificatives
    VERIFICATION_CHOICES = [
        ('en_attente', 'En attente de vérification'),  # pièces déposées, pas encore contrôlées
        ('verifiee', 'Vérifiée'),  # authenticité confirmée : la parcelle est proposée aux acheteurs
        ('rejetee', 'Rejetée'),  # pièces insuffisantes ou douteuses (voir motif_rejet)
    ]

    su = models.CharField(max_length=20, unique=True)  # numéro SU (identifiant cadastral unique)
    # Superficie cadastrale : hectares, ares, centiares et pourcentage de centiare
    superficie_ha = models.IntegerField(default=0)
    superficie_ares = models.IntegerField()
    superficie_ca = models.IntegerField()
    superficie_pourcent = models.IntegerField(default=0)
    zone = models.CharField(max_length=100)  # lotissement de Goma (ex. : mapendo, katindo)
    usage = models.CharField(max_length=20, choices=USAGE_CHOICES)  # usage du terrain
    nature = models.CharField(max_length=50)  # nature du titre (certificat, contrat de location...)
    prix_reel = models.DecimalField(max_digits=15, decimal_places=2)  # prix déclaré par le propriétaire
    # Prix estimé par l'IA (rempli automatiquement, vide si la zone est inconnue du modèle)
    prix_estime = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='disponible')  # état de la parcelle
    titre_foncier = models.CharField(max_length=255, blank=True)  # référence du titre (facultatif)
    # Hash de la transaction blockchain qui a enregistré la vente de cette parcelle
    hash_blockchain = models.CharField(max_length=255, blank=True, null=True)
    # Propriétaire ; related_name permet d'écrire utilisateur.parcelles.all()
    proprietaire = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='parcelles')
    # Résultat du contrôle des pièces par l'admin ; tant qu'il n'est pas "verifiee",
    # la parcelle n'est pas visible par les acheteurs
    verification = models.CharField(max_length=20, choices=VERIFICATION_CHOICES, default='en_attente')
    motif_rejet = models.CharField(max_length=255, blank=True)  # explication donnée par l'admin en cas de rejet
    # Qui a pris la décision de vérification : le réseau de neurones (analyse lancée par l'admin)
    # ou l'admin lui-même ; 'auto' = ancienne vérification par règles (conservé pour l'historique)
    VERIFIE_PAR_CHOICES = [('', '—'), ('ia', "Réseau de neurones (lancé par l'admin)"),
                           ('admin', 'Administrateur'), ('auto', 'Système (ancienne vérification)')]
    verifie_par = models.CharField(max_length=10, choices=VERIFIE_PAR_CHOICES, blank=True, default='')
    # Rapport de la dernière authentification par le réseau de neurones (probabilité, indices, facteurs de doute)
    rapport_verification = models.JSONField(null=True, blank=True)

    # ----- Géolocalisation (saisie par le vendeur sur la carte ou par le GPS du téléphone) -----
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)  # ex. -1.679000
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)  # ex. 29.222000
    precision_gps = models.FloatField(null=True, blank=True)  # précision du GPS en mètres (si capturée sur place)
    # Contour (bornes) de la parcelle : liste de points [[lat, lng], ...] tracés sur la carte
    contour = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)  # date d'enregistrement

    # Texte affiché quand on imprime une parcelle (ex. : "SU:63251 - mapendo")
    def __str__(self):
        return f'{self.su} - {self.zone}'


# Dossier de stockage d'une pièce : media/parcelles/<id de la parcelle>/<nom du fichier>
def chemin_document(instance, nom_fichier):
    return f'parcelles/{instance.parcelle_id}/{nom_fichier}'


# Pièces justificatives d'une parcelle (titre foncier, photos, vidéo du terrain...)
# Elles ne sont consultables que par le propriétaire et l'administrateur.
class DocumentParcelle(models.Model):
    TYPE_CHOICES = [
        ('photo', 'Photo'),
        ('video', 'Vidéo'),
        ('document', 'Document'),  # PDF
    ]

    # Parcelle concernée ; related_name permet d'écrire parcelle.documents.all()
    parcelle = models.ForeignKey(Parcelle, on_delete=models.CASCADE, related_name='documents')
    fichier = models.FileField(upload_to=chemin_document, max_length=255)  # fichier enregistré dans MEDIA_ROOT
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)  # déduit de l'extension du fichier
    nom = models.CharField(max_length=255)  # nom d'origine du fichier (affiché dans l'interface)
    created_at = models.DateTimeField(auto_now_add=True)  # date du dépôt

    def __str__(self):
        return f'{self.nom} ({self.parcelle.su})'


# ==========================================================
# Table "documents" : REGISTRE OFFICIEL des titres fonciers
# Tenu par l'administrateur à partir des livres de la Conservation des
# titres immobiliers. Sert de référence pour vérifier automatiquement les
# déclarations des vendeurs (voir parcelles/verification.py).
# ==========================================================
class DocumentOfficiel(models.Model):
    TYPE_CHOICES = [
        ('certificat', "Certificat d'enregistrement"),
        ('contrat_location', 'Contrat de location'),
        ('fiche_parcellaire', 'Fiche parcellaire'),
        ('autre', 'Autre'),
    ]
    STATUT_CHOICES = [
        ('valide', 'Valide'),  # document en vigueur
        ('litige', 'En litige'),  # contestation en cours : la parcelle ne doit pas être vendue
        ('annule', 'Annulé'),  # document retiré / remplacé
    ]

    numero = models.CharField(max_length=100, unique=True)  # numéro du document (ex. : CE 12345)
    type_document = models.CharField(max_length=20, choices=TYPE_CHOICES)
    su = models.CharField(max_length=20)  # numéro SU de la parcelle concernée
    titulaire = models.CharField(max_length=150)  # nom du propriétaire inscrit sur le document
    zone = models.CharField(max_length=100)  # lotissement
    superficie_m2 = models.DecimalField(max_digits=12, decimal_places=2)  # superficie inscrite
    volume = models.CharField(max_length=30, blank=True)  # références du livre d'enregistrement
    folio = models.CharField(max_length=30, blank=True)
    date_delivrance = models.DateField(null=True, blank=True)
    bureau = models.CharField(max_length=150, blank=True, default="Conservation des titres immobiliers de Goma")
    # Coordonnées de référence (facultatives) : permettent de contrôler la position déclarée
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    # Procès-verbal de mesurage et bornage (ex. : 6214/2024)
    pv_bornage = models.CharField(max_length=50, blank=True)
    # Photo / scan du document authentique (avec son croquis), consultable par l'admin seulement
    scan = models.FileField(upload_to='registre/', max_length=255, blank=True)
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default='valide')
    observations = models.TextField(blank=True)
    enregistre_par = models.ForeignKey(Utilisateur, on_delete=models.SET_NULL, null=True, related_name='documents_officiels')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'documents'  # nom de la table dans la base de données
        ordering = ['su']

    def __str__(self):
        return f'{self.numero} ({self.su})'
