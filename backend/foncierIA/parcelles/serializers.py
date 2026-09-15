from rest_framework import serializers
from .models import Parcelle


class ParcelleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parcelle
        fields = [
            'id',
            'su',
            'superficie_ha',
            'superficie_ares',
            'superficie_ca',
            'superficie_pourcent',
            'zone',
            'usage',
            'nature',
            'prix_reel',
            'prix_estime',
            'statut',
            'titre_foncier',
            'hash_blockchain',
            'proprietaire',
            'created_at',
        ]
        read_only_fields = ['id', 'hash_blockchain', 'proprietaire', 'created_at', 'prix_estime']