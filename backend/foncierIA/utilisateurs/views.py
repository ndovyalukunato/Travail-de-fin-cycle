from rest_framework import viewsets  # ViewSets : regroupent les actions CRUD d'une ressource
from rest_framework.decorators import api_view, permission_classes  # décorateurs pour les vues-fonctions
from rest_framework.permissions import AllowAny, IsAuthenticated  # permissions standard DRF
from rest_framework.response import Response  # réponse JSON
from rest_framework_simplejwt.tokens import RefreshToken  # création des tokens JWT

from .models import Utilisateur  # modèle des utilisateurs
from .serializers import UtilisateurSerializer  # conversion Utilisateur <-> JSON
from .permissions import EstAdmin  # permission : réservé à l'administrateur


# Gestion des comptes : /api/utilisateurs/ (liste, création, détail, modification, suppression)
class UtilisateurViewSet(viewsets.ModelViewSet):
    """
    Toutes les actions (list, create, retrieve, update, delete) sont
    réservées à l'administrateur.
    """
    queryset = Utilisateur.objects.all().order_by('-created_at')  # du plus récent au plus ancien
    serializer_class = UtilisateurSerializer  # serializer utilisé pour le JSON
    permission_classes = [IsAuthenticated, EstAdmin]  # connecté ET administrateur


# GET /api/profil/ : informations de l'utilisateur connecté
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def mon_profil(request):
    """Tout utilisateur connecté peut consulter SON PROPRE profil."""
    serializer = UtilisateurSerializer(request.user)  # request.user = utilisateur du token JWT
    return Response(serializer.data)  # renvoie son profil en JSON


# POST /api/connexion/ : vérifie email + mot de passe et renvoie un token JWT
@api_view(['POST'])
@permission_classes([AllowAny])  # accessible sans être connecté (évidemment)
def connexion(request):
    email = request.data.get('email')  # email envoyé par le formulaire de connexion
    mot_de_passe = request.data.get('mot_de_passe')  # mot de passe envoyé

    # Les deux champs sont obligatoires
    if not email or not mot_de_passe:
        return Response({'erreur': 'Email et mot de passe requis'}, status=400)

    try:
        # Cherche le compte correspondant à l'email
        utilisateur = Utilisateur.objects.get(email=email)
    except Utilisateur.DoesNotExist:
        # Message volontairement identique au cas "mauvais mot de passe" (ne révèle pas si l'email existe)
        return Response({'erreur': 'Email ou mot de passe incorrect'}, status=401)

    # Vérifie le mot de passe par rapport à l'empreinte enregistrée
    if not utilisateur.check_password(mot_de_passe):
        return Response({'erreur': 'Email ou mot de passe incorrect'}, status=401)

    # Crée les tokens JWT pour cet utilisateur
    refresh = RefreshToken.for_user(utilisateur)
    refresh['role'] = utilisateur.role  # ajoute le rôle dans le contenu du token

    # Renvoie le token d'accès et les informations utiles au frontend
    return Response({
        'token': str(refresh.access_token),  # à envoyer dans l'en-tête Authorization
        'refresh': str(refresh),  # permet d'obtenir un nouveau token d'accès
        'role': utilisateur.role,  # sert au frontend pour afficher les bons menus
        'nom': utilisateur.nom,  # affiché dans la barre latérale
    })
