from django.db import models  # outils pour définir les tables de la base de données
from utilisateurs.models import Utilisateur  # acheteur et vendeur sont des utilisateurs
from parcelles.models import Parcelle  # une discussion porte sur une parcelle


# Discussion entre un acheteur et le vendeur (propriétaire) d'une parcelle
class Conversation(models.Model):
    parcelle = models.ForeignKey(Parcelle, on_delete=models.CASCADE, related_name='conversations')
    # Acheteur qui a ouvert la discussion ; utilisateur.conversations_acheteur.all()
    acheteur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='conversations_acheteur')
    # Vendeur (= propriétaire de la parcelle) ; utilisateur.conversations_vendeur.all()
    vendeur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='conversations_vendeur')
    created_at = models.DateTimeField(auto_now_add=True)  # ouverture de la discussion
    updated_at = models.DateTimeField(auto_now_add=True)  # date du dernier message (sert au tri)

    class Meta:
        # Une seule discussion par acheteur et par parcelle
        constraints = [
            models.UniqueConstraint(fields=['parcelle', 'acheteur'], name='conversation_unique_parcelle_acheteur'),
        ]

    def __str__(self):
        return f'Conversation {self.id} - {self.parcelle.su}'


# Message d'une discussion ; il peut porter une proposition de prix (marchandage)
class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    auteur = models.ForeignKey(Utilisateur, on_delete=models.CASCADE, related_name='messages')
    contenu = models.TextField(blank=True)  # texte du message (peut être vide si un prix est proposé)
    # Prix proposé en dollars (facultatif) : l'acheteur peut ensuite en faire une offre officielle
    prix_propose = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    lu = models.BooleanField(default=False)  # lu par le destinataire ?
    created_at = models.DateTimeField(auto_now_add=True)  # date d'envoi

    def __str__(self):
        return f'Message {self.id} de {self.auteur.nom}'
