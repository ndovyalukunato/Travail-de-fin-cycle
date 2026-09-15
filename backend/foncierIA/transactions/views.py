from rest_framework import viewsets, permissions
from rest_framework.response import Response
from .models import Transaction
from .serializers import TransactionSerializer
from blockchain.client import blockchain_client


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all()
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_update(self, serializer):
        ancien_statut = serializer.instance.statut
        transaction = serializer.save()

        # On enregistre sur la blockchain uniquement quand la transaction
        # passe à 'terminée' pour la première fois (pas déjà enregistrée).
        if transaction.statut == 'terminée' and ancien_statut != 'terminée' and not transaction.hash_blockchain:
            acheteur_adresse = transaction.acheteur.adresse_ethereum
            vendeur_adresse = transaction.vendeur.adresse_ethereum

            if not acheteur_adresse or not vendeur_adresse:
                raise Exception(
                    "Impossible d'enregistrer sur la blockchain : "
                    "l'acheteur ou le vendeur n'a pas d'adresse Ethereum configurée."
                )

            # Conversion du montant (USD) en wei pour le smart contract.
            # Conversion simplifiée pour un environnement de test/démo.
            montant_wei = int(transaction.montant * 10**18)

            resultat = blockchain_client.enregistrer_transaction(
                parcelle_su=transaction.parcelle.su,
                acheteur_address=acheteur_adresse,
                vendeur_address=vendeur_adresse,
                montant_wei=montant_wei,
            )

            transaction.hash_blockchain = resultat['tx_hash']
            transaction.save()