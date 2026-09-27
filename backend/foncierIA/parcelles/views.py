from decimal import Decimal  # nombres décimaux exacts (pour les prix en base)

from django.db.models import Q  # combinaison de conditions (OU) dans les requêtes
from rest_framework import viewsets, permissions  # ViewSets et permissions DRF
from rest_framework.exceptions import PermissionDenied, ValidationError  # erreurs 403 et 400
from .models import Parcelle  # modèle des parcelles
from .serializers import ParcelleSerializer  # conversion Parcelle <-> JSON
from ia.modele import analyser_parcelle  # analyse IA (estimation + détection de fraude)


def mettre_a_jour_prix_estime(parcelle):
    """Calcule le prix estimé par l'IA et l'enregistre sur la parcelle."""
    from estimations.models import Estimation  # import local pour éviter une importation circulaire

    try:
        analyse = analyser_parcelle(parcelle)  # prédiction du prix par l'IA
    except ValueError:
        return  # zone inconnue du modèle : pas d'estimation possible

    moyenne = Decimal(str(analyse['estimation']['moyenne']))  # moyenne LR + RF en Decimal
    parcelle.prix_estime = moyenne  # met à jour le prix estimé
    parcelle.save(update_fields=['prix_estime'])  # n'enregistre que ce champ
    # Garde une trace de l'estimation dans l'historique
    Estimation.objects.create(
        parcelle=parcelle,
        superficie=analyse['superficie_m2'],
        zone=parcelle.zone,
        prix_predit=moyenne,
    )


# Routes /api/parcelles/ : liste, création, détail, modification, suppression
class ParcelleViewSet(viewsets.ModelViewSet):
    """
    - admin    : voit toutes les parcelles
    - vendeur  : ne voit que SES propres parcelles
    - acheteur : voit les parcelles disponibles + celles pour lesquelles
                 il a une transaction (pour son historique)
    """
    queryset = Parcelle.objects.all()
    serializer_class = ParcelleSerializer  # serializer utilisé pour le JSON
    permission_classes = [permissions.IsAuthenticated]  # il faut être connecté

    # Détermine les parcelles visibles selon le rôle de l'utilisateur connecté
    def get_queryset(self):
        user = self.request.user
        qs = Parcelle.objects.all().order_by('-created_at')  # plus récentes d'abord

        if user.role == 'admin':
            return qs  # l'admin voit tout
        if user.role == 'vendeur':
            return qs.filter(proprietaire=user)  # uniquement ses propres parcelles
        # acheteur
        # Parcelles disponibles OU pour lesquelles il a fait une offre ; distinct() évite les doublons
        return qs.filter(
            Q(statut='disponible') | Q(transaction__acheteur=user)
        ).distinct()

    # POST /api/parcelles/ : enregistrement d'une nouvelle parcelle
    def perform_create(self, serializer):
        # Seuls les vendeurs et l'admin peuvent ajouter une parcelle
        if self.request.user.role not in ('vendeur', 'admin'):
            raise PermissionDenied("Seul un vendeur ou un administrateur peut ajouter une parcelle.")
        # Le propriétaire est l'utilisateur connecté (il ne peut pas le choisir)
        parcelle = serializer.save(proprietaire=self.request.user)
        mettre_a_jour_prix_estime(parcelle)  # l'IA calcule aussitôt le prix estimé

    # Refuse l'action si l'utilisateur n'est ni l'admin ni le propriétaire
    def _verifier_proprietaire(self, parcelle):
        user = self.request.user
        if user.role != 'admin' and parcelle.proprietaire_id != user.id:
            raise PermissionDenied("Vous ne pouvez modifier que vos propres parcelles.")

    # PUT/PATCH /api/parcelles/<id>/ : modification (statut, prix, etc.)
    def perform_update(self, serializer):
        from transactions.models import Transaction  # import local pour éviter une importation circulaire

        parcelle = serializer.instance  # parcelle avant modification
        self._verifier_proprietaire(parcelle)
        admin = self.request.user.role == 'admin'
        donnees = serializer.validated_data  # champs envoyés par le client

        # Une vente validée est définitive
        if parcelle.statut == 'vendue' and not admin:
            raise PermissionDenied("Une parcelle vendue ne peut plus être modifiée.")

        # Contrôles sur le changement de statut
        nouveau_statut = donnees.get('statut', parcelle.statut)
        if nouveau_statut != parcelle.statut:
            # "vendue" ne s'obtient que par la validation d'une transaction par l'admin
            if nouveau_statut == 'vendue' and not admin:
                raise PermissionDenied(
                    "Une parcelle devient « vendue » uniquement quand l'administrateur valide la transaction."
                )
            # Impossible de remettre en vente une parcelle dont une offre est déjà acceptée
            if nouveau_statut == 'disponible' and Transaction.objects.filter(
                parcelle=parcelle, statut='acceptée'
            ).exists():
                raise ValidationError({
                    'erreur': "Une offre acceptée est en attente de validation : "
                              "annulez d'abord la vente depuis la page Transactions."
                })

        parcelle = serializer.save()  # enregistre les modifications

        # Nouvelle estimation IA seulement si une caractéristique utile au modèle a changé
        champs_ia = {'superficie_ha', 'superficie_ares', 'superficie_ca', 'superficie_pourcent',
                     'zone', 'nature', 'prix_reel'}
        if champs_ia & set(donnees):  # "&" = intersection : au moins un de ces champs a été modifié
            mettre_a_jour_prix_estime(parcelle)

    # DELETE /api/parcelles/<id>/ : suppression
    def perform_destroy(self, instance):
        from transactions.models import Transaction  # import local pour éviter une importation circulaire

        self._verifier_proprietaire(instance)
        # Supprimer la parcelle effacerait aussi ses transactions (CASCADE) : on l'interdit
        if Transaction.objects.filter(parcelle=instance).exists():
            raise ValidationError({
                'erreur': "Impossible de supprimer une parcelle qui a des transactions "
                          "(leur historique serait perdu). Mettez-la plutôt en négociation."
            })
        instance.delete()  # suppression définitive
