from rest_framework import serializers  # conversion objets Python <-> JSON
from .models import Utilisateur  # modèle à convertir


def raison_non_supprimable(utilisateur):
    """Un compte ne peut être supprimé que s'il n'a encore ajouté aucune parcelle ni participé à aucune vente."""
    from transactions.models import Transaction  # import local : évite une importation circulaire
    from django.db.models import Q
    if utilisateur.parcelles.exists():
        return "Ce compte a déjà ajouté une parcelle : il ne peut pas être supprimé."
    if Transaction.objects.filter(Q(acheteur=utilisateur) | Q(vendeur=utilisateur)).exists():
        return "Ce compte a déjà participé à une vente : il ne peut pas être supprimé."
    return None


def a_vente_blockchain(utilisateur):
    """L'utilisateur est acheteur ou vendeur d'une vente enregistrée dans le smart contract."""
    from transactions.models import Transaction  # import local : évite une importation circulaire
    from django.db.models import Q
    return Transaction.objects.filter(Q(acheteur=utilisateur) | Q(vendeur=utilisateur)) \
        .exclude(hash_blockchain__isnull=True).exclude(hash_blockchain='').exists()


# Transforme un Utilisateur en JSON pour l'API (et valide les données reçues)
class UtilisateurSerializer(serializers.ModelSerializer):
    # Mot de passe : accepté en entrée mais JAMAIS renvoyé dans les réponses (write_only)
    mot_de_passe = serializers.CharField(write_only=True, min_length=4, required=False)
    # Adresse Ethereum : doit respecter le format 0x + 40 caractères hexadécimaux
    adresse_ethereum = serializers.RegexField(
        r'^0x[a-fA-F0-9]{40}$', required=False, allow_blank=True, allow_null=True,
        error_messages={'invalid': "Adresse Ethereum invalide (format 0x suivi de 40 caractères hexadécimaux)."},
    )

    # True si l'utilisateur a une vente inscrite sur la blockchain : son adresse est alors figée
    adresse_verrouillee = serializers.SerializerMethodField()

    def get_adresse_verrouillee(self, obj):
        return a_vente_blockchain(obj)

    # Suppression possible seulement si le compte n'a ni parcelle ni vente (affiché dans la liste)
    supprimable = serializers.SerializerMethodField()

    def get_supprimable(self, obj):
        return raison_non_supprimable(obj) is None

    def validate_adresse_ethereum(self, valeur):
        """Champ vide -> NULL ; sinon l'adresse doit être unique (insensible à la casse)."""
        from .adresses import adresse_deja_utilisee
        if not valeur:
            return None
        if adresse_deja_utilisee(valeur, sauf_id=self.instance.pk if self.instance else None):
            raise serializers.ValidationError("Cette adresse Ethereum est déjà attribuée à un autre utilisateur.")
        return valeur

    # Validation globale des données reçues
    def validate(self, data):
        # À la création (pas d'instance existante), le mot de passe est obligatoire
        if self.instance is None and not data.get('mot_de_passe'):
            raise serializers.ValidationError({'mot_de_passe': 'Ce champ est obligatoire.'})
        # L'adresse Ethereum figure dans le smart contract pour chaque vente validée : on ne peut plus la changer
        if (self.instance is not None and 'adresse_ethereum' in data
                and (data['adresse_ethereum'] or None) != (self.instance.adresse_ethereum or None)
                and a_vente_blockchain(self.instance)):
            raise serializers.ValidationError({'erreur': (
                "Cet utilisateur a une vente inscrite sur la blockchain avec cette adresse Ethereum : "
                "elle ne peut plus être modifiée.")})
        return data

    class Meta:
        model = Utilisateur  # modèle concerné
        # Champs inclus dans le JSON
        fields = ['id', 'nom', 'email', 'mot_de_passe', 'role', 'adresse_ethereum', 'adresse_verrouillee', 'supprimable',
                  'created_at']
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
