from django.db import transaction as db_transaction  # regroupe plusieurs écritures en base (tout ou rien)
from rest_framework import viewsets, permissions  # ViewSets et permissions DRF
from rest_framework.decorators import api_view  # transforme une fonction en vue d'API
from rest_framework.exceptions import PermissionDenied, ValidationError, APIException  # erreurs 403, 400 et personnalisées
from rest_framework.response import Response  # réponse JSON
from .models import Transaction  # modèle des transactions
from .serializers import TransactionSerializer  # conversion Transaction <-> JSON
from blockchain.client import get_blockchain_client, etat_blockchain  # accès à Ganache


# Erreur 503 renvoyée quand la blockchain ne répond pas
class BlockchainIndisponible(APIException):
    status_code = 503  # "Service indisponible"
    default_detail = "Blockchain indisponible : vérifiez que Ganache est lancé."


# Changements de statut autorisés, par rôle : {statut actuel: {statuts possibles}}
# (chacun ne voit que ses propres transactions, voir get_queryset)
TRANSITIONS = {
    'acheteur': {
        'en_cours': {'annulée'},             # retirer son offre
        'acceptée': {'annulée'},             # se rétracter avant la validation
    },
    'vendeur': {
        'en_cours': {'acceptée', 'refusée'},  # accepter ou refuser l'offre
        'acceptée': {'annulée'},             # annuler la vente avant la validation
    },
    'admin': {
        'en_cours': {'terminée', 'annulée'},  # valider directement ou annuler
        'acceptée': {'terminée', 'annulée'},  # valider (blockchain) ou annuler
    },
}

# Statuts d'une transaction encore en cours de traitement (pas encore finie)
STATUTS_OUVERTS = ('en_cours', 'acceptée')


# Routes /api/transactions/ : liste, création, détail, modification, suppression
class TransactionViewSet(viewsets.ModelViewSet):
    """
    - admin    : voit toutes les transactions, valide (blockchain) ou annule
    - acheteur : ne voit que SES achats, propose une offre ou la retire
    - vendeur  : ne voit que SES ventes, accepte / refuse une offre ou annule la vente
    """
    queryset = Transaction.objects.all().order_by('-created_at')
    serializer_class = TransactionSerializer  # serializer utilisé pour le JSON
    permission_classes = [permissions.IsAuthenticated]  # il faut être connecté

    # Détermine les transactions visibles selon le rôle de l'utilisateur connecté
    def get_queryset(self):
        user = self.request.user
        # select_related charge parcelle, acheteur et vendeur en une seule requête SQL
        qs = Transaction.objects.select_related('parcelle', 'acheteur', 'vendeur').order_by('-created_at')

        if user.role == 'admin':
            return qs  # l'admin voit tout
        if user.role == 'vendeur':
            return qs.filter(vendeur=user)  # uniquement ses ventes
        return qs.filter(acheteur=user)  # acheteur : uniquement ses achats

    # POST /api/transactions/ : l'acheteur fait une offre sur une parcelle
    def perform_create(self, serializer):
        user = self.request.user
        if user.role != 'acheteur':
            raise PermissionDenied("Seul un acheteur peut initier une transaction.")

        parcelle = serializer.validated_data['parcelle']  # parcelle choisie
        # On ne peut faire une offre que sur une parcelle disponible
        if parcelle.statut != 'disponible':
            raise PermissionDenied("Cette parcelle n'est pas disponible.")
        # Un acheteur ne peut pas avoir deux offres ouvertes sur la même parcelle
        if Transaction.objects.filter(parcelle=parcelle, acheteur=user, statut__in=STATUTS_OUVERTS).exists():
            raise ValidationError({'erreur': "Vous avez déjà une offre en cours sur cette parcelle."})

        # L'acheteur est l'utilisateur connecté ; le vendeur est le propriétaire de la parcelle
        serializer.save(acheteur=user, vendeur=parcelle.proprietaire, statut='en_cours')

    # DELETE /api/transactions/<id>/ : suppression (réservée à l'admin)
    def perform_destroy(self, instance):
        if self.request.user.role != 'admin':
            raise PermissionDenied("Seul un administrateur peut supprimer une transaction.")
        instance.delete()

    # PATCH /api/transactions/<id>/ : changement de statut (accepter, refuser, annuler, valider)
    def perform_update(self, serializer):
        user = self.request.user
        transaction = serializer.instance  # transaction avant modification
        ancien = transaction.statut  # statut actuel
        nouveau = serializer.validated_data.get('statut', ancien)  # statut demandé

        # Hors admin, seule la modification du statut est permise
        autres_champs = set(serializer.validated_data) - {'statut'}
        if user.role != 'admin' and autres_champs:
            raise PermissionDenied("Vous ne pouvez modifier que le statut de la transaction.")

        # Pas de changement de statut : simple enregistrement
        if nouveau == ancien:
            serializer.save()
            return

        # Vérifie que ce changement est autorisé pour ce rôle (voir TRANSITIONS)
        permis = TRANSITIONS.get(user.role, {}).get(ancien, set())
        if nouveau not in permis:
            raise PermissionDenied(
                f"Action impossible : une transaction « {ancien} » ne peut pas passer à « {nouveau} » "
                f"pour un {user.role}."
            )

        parcelle = transaction.parcelle  # parcelle concernée

        # ----- Le vendeur accepte l'offre -----
        if nouveau == 'acceptée':
            # Une seule offre acceptée à la fois par parcelle
            if Transaction.objects.filter(parcelle=parcelle, statut='acceptée').exclude(id=transaction.id).exists():
                raise ValidationError({'erreur': "Une autre offre est déjà acceptée pour cette parcelle."})
            with db_transaction.atomic():  # les deux enregistrements réussissent ou échouent ensemble
                serializer.save()
                parcelle.statut = 'en_negociation'  # la parcelle n'est plus proposée aux autres acheteurs
                parcelle.save(update_fields=['statut'])
            return

        # ----- L'admin valide la vente -----
        if nouveau == 'terminée':
            self._valider_sur_blockchain(serializer)
            return

        # refusée / annulée : la parcelle redevient disponible si plus rien n'est accepté
        with db_transaction.atomic():
            serializer.save()
            if parcelle.statut == 'en_negociation' and not Transaction.objects.filter(
                parcelle=parcelle, statut='acceptée'
            ).exists():
                parcelle.statut = 'disponible'  # remise en vente
                parcelle.save(update_fields=['statut'])

    def _valider_sur_blockchain(self, serializer):
        """On enregistre d'abord sur la blockchain, puis en base.
        Si la blockchain échoue, la transaction garde son statut."""
        transaction = serializer.instance
        acheteur, vendeur = transaction.acheteur, transaction.vendeur
        # Le contrat exige une adresse Ethereum pour l'acheteur et pour le vendeur
        manquants = [u.nom for u in (acheteur, vendeur) if not u.adresse_ethereum]
        if manquants:
            raise ValidationError({
                'erreur': "Adresse Ethereum manquante pour : " + ", ".join(manquants)
                          + ". Renseignez-la dans la page Utilisateurs."
            })

        # Vérifie que Ganache est lancé et que le contrat est déployé
        etat = etat_blockchain()
        if not etat['disponible']:
            raise BlockchainIndisponible(etat['message'])

        try:
            # Envoie la vente au contrat intelligent
            resultat = get_blockchain_client().enregistrer_transaction(
                parcelle_su=transaction.parcelle.su,
                acheteur_address=acheteur.adresse_ethereum,
                vendeur_address=vendeur.adresse_ethereum,
                montant_wei=int(transaction.montant * 10**18),  # conversion en wei
            )
        except Exception as e:
            # Toute erreur de la blockchain devient une erreur 503 lisible par l'utilisateur
            raise BlockchainIndisponible(f"Échec de l'enregistrement sur la blockchain : {e}")

        # La blockchain a accepté : on met à jour la base de données (tout ou rien)
        with db_transaction.atomic():
            # Statut "terminée" + hash de la transaction blockchain
            transaction = serializer.save(hash_blockchain=resultat['tx_hash'])

            parcelle = transaction.parcelle
            parcelle.statut = 'vendue'  # la parcelle est définitivement vendue
            parcelle.hash_blockchain = resultat['tx_hash']  # preuve de la vente
            parcelle.save(update_fields=['statut', 'hash_blockchain'])

            # Les autres offres encore ouvertes sur cette parcelle sont annulées
            Transaction.objects.filter(parcelle=parcelle, statut__in=STATUTS_OUVERTS) \
                .exclude(id=transaction.id).update(statut='annulée')


# GET /api/blockchain/statut/ : permet au frontend de savoir si Ganache est prêt
@api_view(['GET'])
def statut_blockchain(request):
    """État de Ganache et du contrat (affiché à l'admin sur la page Transactions)."""
    return Response(etat_blockchain())
