# ==========================================================
# ROUTES DE L'API : associe chaque adresse (URL) à une vue
# ==========================================================
from django.contrib import admin  # interface d'administration intégrée de Django
from django.urls import path, include  # outils pour déclarer les routes
from rest_framework.routers import DefaultRouter  # génère automatiquement les routes CRUD des ViewSets
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView  # vues JWT standard

# Vues de chaque application du projet
from utilisateurs.views import UtilisateurViewSet, connexion, mon_profil
from parcelles.views import ParcelleViewSet
from transactions.views import TransactionViewSet, statut_blockchain
from estimations.views import EstimationViewSet, estimer, zones, statistiques

# Le routeur crée pour chaque ressource les routes : liste (GET), création (POST),
# détail (GET /id/), modification (PUT/PATCH /id/) et suppression (DELETE /id/)
router = DefaultRouter()
router.register(r'utilisateurs', UtilisateurViewSet)  # /api/utilisateurs/
router.register(r'parcelles', ParcelleViewSet)  # /api/parcelles/
router.register(r'transactions', TransactionViewSet)  # /api/transactions/
router.register(r'estimations', EstimationViewSet)  # /api/estimations/

# Liste de toutes les routes de l'application
urlpatterns = [
    path('admin/', admin.site.urls),  # interface d'administration Django
    path('api/', include(router.urls)),  # toutes les routes générées par le routeur
    path('api/estimer/', estimer, name='estimer'),  # estimation IA du prix + détection de fraude
    path('api/zones/', zones, name='zones'),  # lotissements connus par le modèle IA
    path('api/statistiques/', statistiques, name='statistiques'),  # chiffres du tableau de bord
    path('api/blockchain/statut/', statut_blockchain, name='statut_blockchain'),  # Ganache est-il lancé ?
    path('api/connexion/', connexion, name='connexion'),  # connexion (email + mot de passe -> token JWT)
    path('api/profil/', mon_profil, name='mon_profil'),  # profil de l'utilisateur connecté
    path('api/token/', TokenObtainPairView.as_view()),  # obtention d'un token JWT (vue standard)
    path('api/token/refresh/', TokenRefreshView.as_view()),  # renouvellement d'un token expiré
]
