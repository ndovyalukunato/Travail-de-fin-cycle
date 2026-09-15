from rest_framework import viewsets, permissions
from .models import Parcelle
from .serializers import ParcelleSerializer


class ParcelleViewSet(viewsets.ModelViewSet):
    queryset = Parcelle.objects.all()
    serializer_class = ParcelleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(proprietaire=self.request.user)