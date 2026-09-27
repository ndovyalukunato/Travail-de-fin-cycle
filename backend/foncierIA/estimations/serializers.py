from rest_framework import serializers  # conversion objets Python <-> JSON
from .models import Estimation  # modèle à convertir


# Transforme une Estimation en JSON pour l'API (et inversement)
class EstimationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Estimation  # modèle concerné
        # Champs inclus dans le JSON
        fields = [
            'id',
            'parcelle',
            'superficie',
            'zone',
            'prix_predit',
            'created_at'
        ]
