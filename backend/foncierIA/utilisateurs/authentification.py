from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken
from .models import Utilisateur


class UtilisateurJWTAuthentication(JWTAuthentication):
    """
    Authentification JWT adaptée au modèle Utilisateur maison
    (au lieu du modèle Django auth.User par défaut).
    """
    def get_user(self, validated_token):
        try:
            user_id = validated_token['user_id']
        except KeyError:
            raise InvalidToken('Le token ne contient pas d\'identifiant utilisateur.')

        try:
            return Utilisateur.objects.get(id=user_id)
        except Utilisateur.DoesNotExist:
            raise InvalidToken('Utilisateur introuvable pour ce token.')