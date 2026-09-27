from rest_framework.permissions import BasePermission  # classe de base des permissions DRF


# Permission personnalisée : réserve une vue aux administrateurs
class EstAdmin(BasePermission):
    """Autorise uniquement les utilisateurs ayant le rôle 'admin'."""
    # Message renvoyé (erreur 403) quand l'accès est refusé
    message = "Seul un administrateur peut effectuer cette action."

    # Appelée par DRF avant chaque requête : True = accès autorisé
    def has_permission(self, request, view):
        # Utilisateur connecté (déterminé par le token JWT), ou None
        user = getattr(request, 'user', None)
        # Autorisé seulement si : un utilisateur existe, il est authentifié, et son rôle est "admin"
        return bool(
            user
            and getattr(user, 'is_authenticated', False)
            and getattr(user, 'role', None) == 'admin'
        )
