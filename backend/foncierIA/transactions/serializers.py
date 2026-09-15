from rest_framework import serializers
from .models import Transaction

class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            'id',
            'parcelle',
            'acheteur',
            'vendeur',
            'montant',
            'statut',
            'hash_blockchain',
            'created_at'
        ]
        read_only_fields = ['id', 'hash_blockchain', 'created_at']