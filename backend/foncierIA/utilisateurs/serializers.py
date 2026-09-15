from rest_framework import serializers
from .models import Utilisateur


class UtilisateurSerializer(serializers.ModelSerializer):
    mot_de_passe = serializers.CharField(write_only=True, min_length=4)

    class Meta:
        model = Utilisateur
        fields = ['id', 'nom', 'email', 'mot_de_passe', 'role', 'created_at']
        read_only_fields = ['id', 'created_at']

    def create(self, validated_data):
        mot_de_passe = validated_data.pop('mot_de_passe')
        utilisateur = Utilisateur(**validated_data)
        utilisateur.set_password(mot_de_passe)
        utilisateur.save()
        return utilisateur

    def update(self, instance, validated_data):
        mot_de_passe = validated_data.pop('mot_de_passe', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if mot_de_passe:
            instance.set_password(mot_de_passe)
        instance.save()
        return instance