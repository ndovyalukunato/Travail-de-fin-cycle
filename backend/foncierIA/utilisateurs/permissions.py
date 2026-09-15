from rest_framework.permissions import BasePermission


class EstAdmin(BasePermission):
    """Autorise uniquement les utilisateurs ayant le rôle 'admin'."""
    message = "Seul un administrateur peut effectuer cette action."

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(
            user
            and getattr(user, 'is_authenticated', False)
            and getattr(user, 'role', None) == 'admin'
        )