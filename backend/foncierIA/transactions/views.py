from rest_framework import viewsets, permissions
from rest_framework.exceptions import PermissionDenied
from .models import Transaction
from .serializers import TransactionSerializer
from blockchain.client import blockchain_client


class TransactionViewSet(viewsets.ModelViewSet):
    queryset = Transaction.objects.all().order_by('-created_at')
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(acheteur=self.request.user)

    def perform_update(self, serializer):
        ancien_statut = serializer.instance.statut
        nouveau_statut = serializer.validated_data.get('statut', ancien_statut)

        if nouveau_statut != ancien_statut and self.request.user.role != 'admin':
            raise PermissionDenied("Seul un administrateur peut valider ou annuler une transaction.")

        transaction = serializer.save()

        if transaction.statut == 'terminée' and ancien_statut != 'terminée' and not transaction.hash_blockchain:
            montant_wei = int(transaction.montant * 10**18)
            resultat = blockchain_client.enregistrer_transaction(
                parcelle_su=transaction.parcelle.su,
                acheteur_address=transaction.acheteur.adresse_ethereum,
                vendeur_address=transaction.vendeur.adresse_ethereum,
                montant_wei=montant_wei,
            )
            transaction.hash_blockchain = resultat['tx_hash']
            transaction.save()