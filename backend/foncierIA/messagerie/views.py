from django.db.models import Q  # combinaison de conditions (OU) dans les requêtes
from django.utils import timezone  # date et heure actuelles
from rest_framework import viewsets, permissions, mixins  # ViewSets et permissions DRF
from rest_framework.decorators import action  # routes supplémentaires sur un ViewSet
from rest_framework.exceptions import PermissionDenied, ValidationError  # erreurs 403 et 400
from rest_framework.response import Response  # réponse JSON

from parcelles.models import Parcelle  # parcelle sur laquelle porte la discussion
from .models import Conversation, Message  # modèles de la messagerie
from .serializers import ConversationSerializer, MessageSerializer  # conversion <-> JSON


# Routes /api/conversations/ : liste, ouverture, détail, messages
class ConversationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    - acheteur : ouvre une discussion sur une parcelle et voit SES discussions
    - vendeur  : voit les discussions ouvertes sur SES parcelles et y répond
    - admin    : n'a pas accès aux discussions (elles restent privées entre acheteur et vendeur)
    """
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer
    permission_classes = [permissions.IsAuthenticated]  # il faut être connecté

    # Les discussions sont privées : l'administrateur ne peut ni les lire ni y écrire
    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)  # authentification JWT
        if request.user.role == 'admin':
            raise PermissionDenied("Les discussions entre acheteurs et vendeurs sont privées.")

    # Détermine les discussions visibles par l'utilisateur connecté
    def get_queryset(self):
        user = self.request.user
        # select_related charge parcelle, acheteur et vendeur en une seule requête SQL
        qs = Conversation.objects.select_related('parcelle', 'acheteur', 'vendeur').order_by('-updated_at')
        return qs.filter(Q(acheteur=user) | Q(vendeur=user))  # seulement celles où il participe

    # POST /api/conversations/ { "parcelle": 12 } : l'acheteur ouvre (ou retrouve) la discussion
    def create(self, request):
        user = request.user
        if user.role != 'acheteur':
            raise PermissionDenied("Seul un acheteur peut ouvrir une discussion sur une parcelle.")

        try:
            parcelle = Parcelle.objects.get(id=request.data.get('parcelle'))
        except (Parcelle.DoesNotExist, ValueError, TypeError):
            raise ValidationError({'erreur': "Parcelle introuvable."})

        # Si la discussion existe déjà, on la renvoie telle quelle
        conversation = Conversation.objects.filter(parcelle=parcelle, acheteur=user).first()
        if conversation is None:
            # On ne peut entamer une discussion que sur une parcelle proposée à la vente
            if parcelle.statut != 'disponible' or parcelle.verification != 'verifiee':
                raise PermissionDenied("Cette parcelle n'est pas disponible à la vente.")
            conversation = Conversation.objects.create(
                parcelle=parcelle, acheteur=user, vendeur=parcelle.proprietaire,
            )
        return Response(self.get_serializer(conversation).data, status=201)

    # GET  /api/conversations/<id>/messages/ : messages de la discussion (et les marque comme lus)
    # POST /api/conversations/<id>/messages/ { "contenu": "...", "prix_propose": 9000 } : envoi
    @action(detail=True, methods=['get', 'post'])
    def messages(self, request, pk=None):
        conversation = self.get_object()  # refuse (404) une discussion qui n'est pas visible
        user = request.user
        participant = user.id in (conversation.acheteur_id, conversation.vendeur_id)

        if request.method == 'POST':
            if not participant:
                raise PermissionDenied("Seuls l'acheteur et le vendeur peuvent écrire dans cette discussion.")
            serializer = MessageSerializer(data=request.data, context={'request': request})
            serializer.is_valid(raise_exception=True)
            serializer.save(conversation=conversation, auteur=user)
            # Remonte la discussion en tête de liste
            conversation.updated_at = timezone.now()
            conversation.save(update_fields=['updated_at'])
            return Response(serializer.data, status=201)

        # Lecture : les messages reçus sont marqués comme lus
        conversation.messages.filter(lu=False).exclude(auteur=user).update(lu=True)
        liste = conversation.messages.select_related('auteur').order_by('id')
        return Response(MessageSerializer(liste, many=True, context={'request': request}).data)

    # GET /api/conversations/non_lus/ : nombre de messages non lus (pastille du menu)
    @action(detail=False, methods=['get'])
    def non_lus(self, request):
        user = request.user
        total = Message.objects.filter(
            Q(conversation__acheteur=user) | Q(conversation__vendeur=user), lu=False,
        ).exclude(auteur=user).count()
        return Response({'non_lus': total})
