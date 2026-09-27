from rest_framework import serializers  # conversion objets Python <-> JSON
from .models import Parcelle  # modèle à convertir
from ia.modele import analyser_parcelle, superficie_en_m2  # fonctions du module d'intelligence artificielle


# Transforme une Parcelle en JSON pour l'API (et valide les données reçues)
class ParcelleSerializer(serializers.ModelSerializer):
    # Nom du propriétaire (lu via la relation), pour l'affichage dans le frontend
    proprietaire_nom = serializers.CharField(source='proprietaire.nom', read_only=True)
    # Champs calculés par les méthodes get_superficie_m2 et get_analyse_ia ci-dessous
    superficie_m2 = serializers.SerializerMethodField()
    analyse_ia = serializers.SerializerMethodField()

    class Meta:
        model = Parcelle  # modèle concerné
        # Champs inclus dans le JSON
        fields = [
            'id',
            'su',
            'superficie_ha',
            'superficie_ares',
            'superficie_ca',
            'superficie_pourcent',
            'superficie_m2',
            'zone',
            'usage',
            'nature',
            'prix_reel',
            'prix_estime',
            'statut',
            'titre_foncier',
            'hash_blockchain',
            'proprietaire',
            'proprietaire_nom',
            'analyse_ia',
            'created_at',
        ]
        # Champs que le client ne peut pas modifier (calculés ou attribués par le serveur)
        read_only_fields = ['id', 'hash_blockchain', 'proprietaire', 'created_at', 'prix_estime']

    # Validation du champ "zone" avant l'enregistrement
    def validate_zone(self, value):
        # le modèle IA travaille avec des lotissements en minuscules
        return value.strip().lower()

    # Calcule la superficie totale en m² (unité utilisée par le modèle IA)
    def get_superficie_m2(self, obj):
        return superficie_en_m2(obj.superficie_ha, obj.superficie_ares,
                                obj.superficie_ca, obj.superficie_pourcent)

    def get_analyse_ia(self, obj):
        """Contrôle du prix réel par l'Isolation Forest (None si zone inconnue du modèle)."""
        try:
            # Analyse IA de la parcelle : estimation du prix + détection de prix anormal
            fraude = analyser_parcelle(obj)['fraude']
        except ValueError:
            # Zone inconnue du modèle : pas d'analyse possible
            return None
        # On ne renvoie que l'avis sur le prix et le score d'anomalie
        return {'prix_suspect': fraude['est_fraude'], 'score': fraude['score']}
