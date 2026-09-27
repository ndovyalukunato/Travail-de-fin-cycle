from rest_framework import serializers  # conversion objets Python <-> JSON
from .models import Utilisateur  # modèle à convertir


# Transforme un Utilisateur en JSON pour l'API (et valide les données reçues)
class UtilisateurSerializer(serializers.ModelSerializer):
    # Mot de passe : accepté en entrée mais JAMAIS renvoyé dans les réponses (write_only)
    mot_de_passe = serializers.CharField(write_only=True, min_length=4, required=False)
    # Adresse Ethereum : doit respecter le format 0x + 40 caractères hexadécimaux
    adresse_ethereum = serializers.RegexField(
        r'^0x[a-fA-F0-9]{40}$', required=False, allow_blank=True, allow_null=True,
        error_messages={'invalid': "Adresse Ethereum invalide (format 0x suivi de 40 caractères hexadécimaux)."},
    )

    # Validation globale des données reçues
    def validate(self, data):
        # À la création (pas d'instance existante), le mot de passe est obligatoire
        if self.instance is None and not data.get('mot_de_passe'):
            raise serializers.ValidationError({'mot_de_passe': 'Ce champ est obligatoire.'})
        return data

    class Meta:
        model = Utilisateur  # modèle concerné
        # Champs inclus dans le JSON
        fields = ['id', 'nom', 'email', 'mot_de_passe', 'role', 'adresse_ethereum', 'created_at']
        read_only_fields = ['id', 'created_at']  # attribués automatiquement

    # Création d'un compte (POST /api/utilisateurs/)
    def create(self, validated_data):
        mot_de_passe = validated_data.pop('mot_de_passe')  # retire le mot de passe en clair des données
        utilisateur = Utilisateur(**validated_data)  # crée l'objet avec les autres champs
        utilisateur.set_password(mot_de_passe)  # enregistre le mot de passe sous forme hachée
        utilisateur.save()  # insère la ligne en base
        return utilisateur

    # Modification d'un compte (PUT/PATCH /api/utilisateurs/<id>/)
    def update(self, instance, validated_data):
        mot_de_passe = validated_data.pop('mot_de_passe', None)  # nouveau mot de passe éventuel
        # Copie chaque champ modifié sur l'utilisateur existant
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        # Le mot de passe n'est changé que s'il a été fourni
        if mot_de_passe:
            instance.set_password(mot_de_passe)
        instance.save()  # enregistre les modifications
        return instance
