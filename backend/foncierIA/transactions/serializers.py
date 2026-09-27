from rest_framework import serializers  # conversion objets Python <-> JSON
from .models import Transaction  # modèle à convertir
from ia.modele import analyser_parcelle  # analyse IA (estimation + détection de fraude)


# Transforme une Transaction en JSON pour l'API (et valide les données reçues)
class TransactionSerializer(serializers.ModelSerializer):
    # Champ calculé par la méthode get_analyse_ia ci-dessous
    analyse_ia = serializers.SerializerMethodField()

    # Champs lisibles pour l'historique (un acheteur/vendeur n'a pas accès à /api/utilisateurs/)
    parcelle_su = serializers.CharField(source='parcelle.su', read_only=True)  # numéro SU de la parcelle
    parcelle_zone = serializers.CharField(source='parcelle.zone', read_only=True)  # lotissement
    acheteur_nom = serializers.CharField(source='acheteur.nom', read_only=True)  # nom de l'acheteur
    vendeur_nom = serializers.CharField(source='vendeur.nom', read_only=True)  # nom du vendeur

    class Meta:
        model = Transaction  # modèle concerné
        # Champs inclus dans le JSON
        fields = [
            'id', 'parcelle', 'parcelle_su', 'parcelle_zone',
            'acheteur', 'acheteur_nom', 'vendeur', 'vendeur_nom',
            'montant', 'statut', 'hash_blockchain', 'analyse_ia', 'created_at',
        ]
        # le vendeur est déduit automatiquement du propriétaire de la parcelle
        read_only_fields = ['id', 'acheteur', 'vendeur', 'hash_blockchain', 'created_at']

    def get_analyse_ia(self, obj):
        """Prix estimé par l'IA et contrôle du montant par l'Isolation Forest."""
        try:
            # On contrôle le MONTANT proposé (et non le prix déclaré de la parcelle)
            analyse = analyser_parcelle(obj.parcelle, obj.montant)
        except ValueError:
            # Zone inconnue du modèle : pas d'analyse possible
            return None
        return {
            'prix_estime': analyse['estimation']['moyenne'],  # prix moyen prédit par l'IA
            'montant_suspect': analyse['fraude']['est_fraude'],  # True si le montant est anormal
            'score': analyse['fraude']['score'],  # score d'anomalie (négatif = suspect)
        }
