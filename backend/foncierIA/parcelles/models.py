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
