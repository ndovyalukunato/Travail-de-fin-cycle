from rest_framework_simplejwt.authentication import JWTAuthentication  # authentification JWT standard
from rest_framework_simplejwt.exceptions import InvalidToken  # erreur renvoyée si le token est invalide
from .models import Utilisateur  # notre propre modèle d'utilisateur


# Authentification par token JWT, adaptée à notre table "Utilisateur"
class UtilisateurJWTAuthentication(JWTAuthentication):
    """
    Authentification JWT adaptée au modèle Utilisateur maison
    (au lieu du modèle Django auth.User par défaut).
    """
    # Retrouve l'utilisateur correspondant au token reçu dans l'en-tête "Authorization: Bearer ..."
    def get_user(self, validated_token):
        try:
            # Le token contient l'identifiant de l'utilisateur (ajouté à la connexion)
            user_id = validated_token['user_id']
        except KeyError:
            # Token sans identifiant : refusé
            raise InvalidToken('Le token ne contient pas d\'identifiant utilisateur.')

        try:
            # Cherche l'utilisateur dans notre table ; il devient request.user dans les vues
            return Utilisateur.objects.get(id=user_id)
        except Utilisateur.DoesNotExist:
            # L'utilisateur a été supprimé depuis la création du token
            raise InvalidToken('Utilisateur introuvable pour ce token.')
