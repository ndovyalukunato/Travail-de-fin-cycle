from django.db import models
from utilisateurs.models import Utilisateur


class Parcelle(models.Model):
    USAGE_CHOICES = [
        ('residentiel', 'Résidentiel'),
        ('commercial', 'Commercial'),
        ('autre', 'Autre'),
    ]
    STATUT_CHOICES = [
        ('disponible', 'Disponible'),
        ('vendue', 'Vendue'),
        ('en_negociation', 'En négociation'),
    ]

    su = models.CharField(max_length=20, unique=True)
    superficie_ha = models.IntegerField(default=0)
    superficie_ares = models.IntegerField()
    superficie_ca = models.IntegerField()
    superficie_pourcent = models.IntegerField(default=0)
    zone = models.CharField(max_length=100)
    usage = models.CharField(max_length=20, choices=USAGE_CHOICES)
    nature = models.CharField(max_length=50)
    prix_reel = models.DecimalField(max_digits=15, decimal_places=2)
    prix_estime = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    statut = models.CharField(max_length=20, choices=STATUT_CHOICES, default='disponible')
    titre_foncier = models.CharField(max_length=255, blank=True)
    hash_blockchain = models.CharField(max_length=255, blank=True, null=True)
    proprietaire = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='parcelles')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.su} - {self.zone}'