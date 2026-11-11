from rest_framework import serializers  # conversion objets Python <-> JSON
import json  # contour envoyé en texte JSON dans un formulaire multipart

from .models import Parcelle, DocumentParcelle, DocumentOfficiel  # modèles à convertir
from ia.modele import analyser_parcelle, superficie_en_m2  # fonctions du module d'intelligence artificielle


# Transforme une pièce justificative en JSON (le fichier lui-même se télécharge
# par /api/documents/<id>/fichier/, réservé à l'admin et au propriétaire)
class DocumentParcelleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentParcelle
        fields = ['id', 'parcelle', 'type', 'nom', 'created_at']
        read_only_fields = fields


# Transforme une Parcelle en JSON pour l'API (et valide les données reçues)
class ParcelleSerializer(serializers.ModelSerializer):
    # Nom du propriétaire (lu via la relation), pour l'affichage dans le frontend
    proprietaire_nom = serializers.CharField(source='proprietaire.nom', read_only=True)
    # Champs calculés par les méthodes get_superficie_m2 et get_analyse_ia ci-dessous
    superficie_m2 = serializers.SerializerMethodField()
    analyse_ia = serializers.SerializerMethodField()
    # Nombre de pièces justificatives déposées
    nb_documents = serializers.IntegerField(source='documents.count', read_only=True)

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
            'verification',
            'motif_rejet',
            'nb_documents',
            'verifie_par',
            'rapport_verification',
            'latitude',
            'longitude',
            'precision_gps',
            'contour',
            'created_at',
        ]
        # Champs que le client ne peut pas modifier (calculés ou attribués par le serveur)
        # "verification" ne change que par l'action /verifier/ réservée à l'admin
        read_only_fields = ['id', 'hash_blockchain', 'proprietaire', 'created_at', 'prix_estime',
                            'verification', 'motif_rejet', 'verifie_par']

    # Rapport de vérification automatique : complet pour l'admin ; le propriétaire voit
    # les critères et leur résultat, sans les valeurs du registre ; l'acheteur ne voit rien
    rapport_verification = serializers.SerializerMethodField()

    def get_rapport_verification(self, obj):
        rapport = obj.rapport_verification
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not rapport or user is None:
            return None
        if user.role == 'admin':
            return rapport
        if obj.proprietaire_id == user.id:
            return {
                'resultat': rapport['resultat'], 'score': rapport['score'], 'date': rapport['date'],
                'message': rapport['message'] if rapport['resultat'] == 'authentique'
                else "L'analyse par l'IA n'a pas permis d'authentifier votre dossier : "
                     "l'administrateur va examiner vos pièces.",
                'controles': [{'critere': c['critere'], 'ok': c['ok'], 'bloquant': c['bloquant']}
                              for c in rapport['controles']],
            }
        return None

    # La position doit être un point valide sur la Terre
    def validate_latitude(self, value):
        if value is not None and not -90 <= value <= 90:
            raise serializers.ValidationError("Latitude invalide (entre -90 et 90).")
        return value

    def validate_longitude(self, value):
        if value is not None and not -180 <= value <= 180:
            raise serializers.ValidationError("Longitude invalide (entre -180 et 180).")
        return value

    def validate_contour(self, value):
        """Contour (bornes) : liste de 3 à 100 points [lat, lng], ou vide."""
        if value in (None, '', []):
            return None
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError:
                raise serializers.ValidationError("Contour illisible.")
        if not isinstance(value, list) or not 3 <= len(value) <= 100:
            raise serializers.ValidationError("Le contour doit compter entre 3 et 100 points.")
        try:
            points = [[round(float(lat), 7), round(float(lng), 7)] for lat, lng in value]
        except (TypeError, ValueError):
            raise serializers.ValidationError("Chaque point du contour doit être [latitude, longitude].")
        if any(not (-90 <= a <= 90 and -180 <= b <= 180) for a, b in points):
            raise serializers.ValidationError("Point du contour hors limites.")
        return points

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


# Registre officiel des titres (table "documents"), géré par l'administrateur
class DocumentOfficielSerializer(serializers.ModelSerializer):
    enregistre_par_nom = serializers.CharField(source='enregistre_par.nom', read_only=True, default='')
    type_document_libelle = serializers.CharField(source='get_type_document_display', read_only=True)
    # Parcelles de l'application qui portent ce SU (lien entre le registre et les dossiers)
    parcelles_liees = serializers.SerializerMethodField()

    class Meta:
        model = DocumentOfficiel
        fields = ['id', 'numero', 'type_document', 'type_document_libelle', 'su', 'titulaire', 'zone',
                  'superficie_m2', 'volume', 'folio', 'date_delivrance', 'bureau', 'latitude', 'longitude',
                  'pv_bornage', 'a_scan', 'statut', 'observations', 'enregistre_par', 'enregistre_par_nom',
                  'parcelles_liees', 'created_at', 'updated_at']
        read_only_fields = ['id', 'enregistre_par', 'created_at', 'updated_at']

    # Le scan s'envoie par /documents-officiels/<id>/scan/ ; ici on indique seulement s'il existe
    a_scan = serializers.SerializerMethodField()

    def get_a_scan(self, obj):
        return bool(obj.scan)

    def validate_zone(self, value):
        return value.strip().lower()

    def validate_superficie_m2(self, value):
        if value <= 0:
            raise serializers.ValidationError("La superficie doit être positive.")
        return value

    def get_parcelles_liees(self, obj):
        from .verification import normaliser_su
        cible = normaliser_su(obj.su)
        return [
            {'id': p.id, 'su': p.su, 'verification': p.verification, 'verifie_par': p.verifie_par,
             'proprietaire': p.proprietaire.nom}
            for p in Parcelle.objects.select_related('proprietaire') if normaliser_su(p.su) == cible
        ]
