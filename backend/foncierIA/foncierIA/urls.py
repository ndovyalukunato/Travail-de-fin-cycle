from django.contrib import admin
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from utilisateurs.views import UtilisateurViewSet, connexion
from parcelles.views import ParcelleViewSet
from transactions.views import TransactionViewSet
from estimations.views import EstimationViewSet, estimer

router = DefaultRouter()
router.register(r'utilisateurs', UtilisateurViewSet)
router.register(r'parcelles', ParcelleViewSet)
router.register(r'transactions', TransactionViewSet)
router.register(r'estimations', EstimationViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
    path('api/estimer/', estimer, name='estimer'),
    path('api/connexion/', connexion, name='connexion'),
    path('api/token/', TokenObtainPairView.as_view()),
    path('api/token/refresh/', TokenRefreshView.as_view()),
]