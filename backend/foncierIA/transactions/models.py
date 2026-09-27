from django.db import models  # outils pour définir les tables de la base de données
from utilisateurs.models import Utilisateur  # acheteur et vendeur sont des utilisateurs
from parcelles.models import Parcelle  # une transaction porte sur une parcelle

# Table des transactions (offres d'achat et ventes de parcelles)
class Transaction(models.Model):
    # Circuit : en_cours (offre de l'acheteur) -> acceptée (par le vendeur)
    #           -> terminée (validée par l'admin et enregistrée sur la blockchain)
    # Fins possibles : refusée (par le vendeur) ou annulée (acheteur, vendeur ou admin).
    STATUT_CHOICES = [
        ('en_cours', 'En cours'),
        ('acceptée', 'Acceptée par le vendeur'),
        ('terminée', 'Terminée'),
        ('refusée', 'Refusée'),
        ('annulée', 'Annulée'),
    ]
    parcelle = models.ForeignKey(Parcelle, on_delete=models.CASCADE)  # parcelle concernée
    # Acheteur ; related_name permet d'écrire utilisateur.achats.all()
    acheteur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='achats')
    # Vendeur (= propriétaire de la parcelle) ; utilisateur.ventes.all()
    vendeur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='ventes')
    montant = models.DecimalField(max_digits=15, decimal_places=2)  # montant proposé en dollars
    statut = models.CharField(max_length=10, choices=STATUT_CHOICES, default='en_cours')  # étape du circuit
    # Hash de la transaction Ethereum, rempli quand l'admin valide la vente
    hash_blockchain = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)  # date de l'offre

    # Texte affiché quand on imprime une transaction
    def __str__(self):
        return f"Transaction {self.id} - {self.statut}"
