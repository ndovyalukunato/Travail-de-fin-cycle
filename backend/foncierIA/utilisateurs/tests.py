# REMARQUE : ce fichier ne contient pas de tests mais une ancienne copie du ViewSet
# des utilisateurs. La version réellement utilisée par l'API est dans utilisateurs/views.py.
from rest_framework import viewsets  # ViewSets : regroupent les actions CRUD d'une ressource
from .models import Utilisateur  # modèle des utilisateurs
from .serializers import UtilisateurSerializer  # conversion Utilisateur <-> JSON

# Ancienne version (non utilisée) du ViewSet : sans restriction au rôle admin
class UtilisateurViewSet(viewsets.ModelViewSet):
    queryset = Utilisateur.objects.all()  # tous les utilisateurs
    serializer_class = UtilisateurSerializer  # serializer utilisé pour le JSON
