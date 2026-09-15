from django.db import models
from utilisateurs.models import Utilisateur
from parcelles.models import Parcelle

class Transaction(models.Model):
    STATUT_CHOICES = [
        ('en_cours', 'En cours'),
        ('terminée', 'Terminée'),
        ('annulée', 'Annulée'),
    ]
    parcelle = models.ForeignKey(Parcelle, on_delete=models.CASCADE)
    acheteur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='achats')
    vendeur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='ventes')
    montant = models.DecimalField(max_digits=15, decimal_places=2)
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default='en_cours')
    hash_blockchain = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Transaction {self.id} - {self.statut}"