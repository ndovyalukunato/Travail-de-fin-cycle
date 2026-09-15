from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import Estimation
from .serializers import EstimationSerializer
from ia.modele import estimer_prix, detecter_fraude

class EstimationViewSet(viewsets.ModelViewSet):
    queryset = Estimation.objects.all()
    serializer_class = EstimationSerializer

@api_view(['POST'])
def estimer(request):
    superficie = request.data.get('superficie')
    zone = request.data.get('zone')
    infrastructure = request.data.get('infrastructure')

    if not all([superficie, zone, infrastructure is not None]):
        return Response({'erreur': 'Données manquantes'}, status=400)

    try:
        resultat = estimer_prix(float(superficie), zone, int(infrastructure))
        # On utilise le prix moyen estimé pour la détection de fraude,
        # car le modèle de fraude a été entraîné avec le prix comme variable.
        fraude = detecter_fraude(
            float(superficie), zone, int(infrastructure), resultat['moyenne']
        )
    except ValueError as e:
        return Response({'erreur': str(e)}, status=400)

    return Response({
        'estimation': resultat,
        'fraude': fraude
    })