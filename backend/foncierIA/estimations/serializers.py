from rest_framework import serializers
from .models import Estimation

class EstimationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Estimation
        fields = [
            'id',
            'parcelle',
            'superficie',
            'zone',
            'prix_predit',
            'created_at'
        ]