from rest_framework import serializers  # conversion objets Python <-> JSON
from .models import Conversation, Message  # modèles à convertir


# Transforme un Message en JSON pour l'API (et valide les données reçues)
class MessageSerializer(serializers.ModelSerializer):
    auteur_nom = serializers.CharField(source='auteur.nom', read_only=True)  # nom de l'expéditeur
    # True si le message a été écrit par l'utilisateur connecté (bulle à droite dans l'interface)
    de_moi = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'conversation', 'auteur', 'auteur_nom', 'de_moi', 'contenu', 'prix_propose', 'lu', 'created_at']
        # la conversation et l'auteur sont attribués par le serveur
        read_only_fields = ['id', 'conversation', 'auteur', 'lu', 'created_at']

    def get_de_moi(self, obj):
        return obj.auteur_id == self.context['request'].user.id

    # Le texte est nettoyé de ses espaces inutiles
    def validate_contenu(self, value):
        return value.strip()

    def validate_prix_propose(self, value):
        if value is not None and value <= 0:
            raise serializers.ValidationError("Le prix proposé doit être positif.")
        return value

    # Un message doit contenir un texte ou une proposition de prix
    def validate(self, data):
        if not data.get('contenu') and data.get('prix_propose') is None:
            raise serializers.ValidationError({'erreur': "Écrivez un message ou proposez un prix."})
        return data


# Transforme une Conversation en JSON pour l'API
class ConversationSerializer(serializers.ModelSerializer):
    # Informations lisibles sur la parcelle et les deux interlocuteurs
    parcelle_su = serializers.CharField(source='parcelle.su', read_only=True)
    parcelle_zone = serializers.CharField(source='parcelle.zone', read_only=True)
    parcelle_prix = serializers.DecimalField(source='parcelle.prix_reel', max_digits=15, decimal_places=2, read_only=True)
    parcelle_statut = serializers.CharField(source='parcelle.statut', read_only=True)
    acheteur_nom = serializers.CharField(source='acheteur.nom', read_only=True)
    vendeur_nom = serializers.CharField(source='vendeur.nom', read_only=True)
    # Champs calculés par les méthodes ci-dessous
    dernier_message = serializers.SerializerMethodField()
    non_lus = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            'id', 'parcelle', 'parcelle_su', 'parcelle_zone', 'parcelle_prix', 'parcelle_statut',
            'acheteur', 'acheteur_nom', 'vendeur', 'vendeur_nom',
            'dernier_message', 'non_lus', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'acheteur', 'vendeur', 'created_at', 'updated_at']

    # Aperçu du dernier message (affiché dans la liste des discussions)
    def get_dernier_message(self, obj):
        dernier = obj.messages.order_by('-id').first()
        if dernier is None:
            return None
        if dernier.contenu:
            return dernier.contenu[:80]
        return f'Proposition : ${dernier.prix_propose}'

    # Nombre de messages reçus et pas encore lus par l'utilisateur connecté
    def get_non_lus(self, obj):
        user = self.context['request'].user
        return obj.messages.filter(lu=False).exclude(auteur=user).count()
