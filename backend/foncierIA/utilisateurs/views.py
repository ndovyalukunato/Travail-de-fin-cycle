from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import Utilisateur
from .serializers import UtilisateurSerializer
from .permissions import EstAdmin


class UtilisateurViewSet(viewsets.ModelViewSet):
    """
    Toutes les actions (list, create, retrieve, update, delete) sont
    réservées à l'administrateur.
    """
    queryset = Utilisateur.objects.all().order_by('-created_at')
    serializer_class = UtilisateurSerializer
    permission_classes = [IsAuthenticated, EstAdmin]


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mon_profil(request):
    """Tout utilisateur connecté peut consulter SON PROPRE profil."""
    serializer = UtilisateurSerializer(request.user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([AllowAny])
def connexion(request):
    email = request.data.get('email')
    mot_de_passe = request.data.get('mot_de_passe')

    if not email or not mot_de_passe:
        return Response({'erreur': 'Email et mot de passe requis'}, status=400)

    try:
        utilisateur = Utilisateur.objects.get(email=email)
    except Utilisateur.DoesNotExist:
        return Response({'erreur': 'Email ou mot de passe incorrect'}, status=401)

    if not utilisateur.check_password(mot_de_passe):
        return Response({'erreur': 'Email ou mot de passe incorrect'}, status=401)

    refresh = RefreshToken.for_user(utilisateur)
    refresh['role'] = utilisateur.role

    return Response({
        'token': str(refresh.access_token),
        'refresh': str(refresh),
        'role': utilisateur.role,
        'nom': utilisateur.nom,
    })