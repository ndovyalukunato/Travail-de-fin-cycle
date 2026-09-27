from decimal import Decimal  # nombres décimaux exacts (pour les prix en base)

from django.db.models import Count  # comptage groupé (statistiques)
from rest_framework import viewsets  # ViewSets : regroupent les actions d'une ressource
from rest_framework.decorators import api_view  # transforme une fonction en vue d'API
from rest_framework.response import Response  # réponse JSON

from .models import Estimation  # historique des estimations
from .serializers import EstimationSerializer  # conversion Estimation <-> JSON
# Fonctions du module d'intelligence artificielle
from ia.modele import (
    ZONES_CONNUES, estimer_prix, detecter_fraude, analyser_parcelle,
)
from parcelles.models import Parcelle  # modèle des parcelles
from parcelles.views import ParcelleViewSet  # pour réutiliser son filtrage par rôle
from transactions.models import Transaction  # modèle des transactions (statistiques)


# GET /api/estimations/ : historique des estimations (lecture seule)
class EstimationViewSet(viewsets.ReadOnlyModelViewSet):
    """Historique des estimations IA (lecture seule, filtré par rôle)."""
    queryset = Estimation.objects.all()
    serializer_class = EstimationSerializer

    # Détermine les estimations visibles selon le rôle de l'utilisateur connecté
    def get_queryset(self):
        user = self.request.user
        qs = Estimation.objects.select_related('parcelle').order_by('-created_at')  # plus récentes d'abord
        if user.role == 'admin':
            return qs  # l'admin voit tout
        if user.role == 'vendeur':
            return qs.filter(parcelle__proprietaire=user)  # estimations de ses propres parcelles
        # acheteur : estimations des parcelles pour lesquelles il a fait une offre
        return qs.filter(parcelle__transaction__acheteur=user).distinct()


def _parcelles_visibles(request):
    """Réutilise le filtrage par rôle défini dans ParcelleViewSet."""
    vue = ParcelleViewSet()  # crée la vue des parcelles
    vue.request = request  # lui donne la requête (donc l'utilisateur connecté)
    return vue.get_queryset()  # parcelles que cet utilisateur a le droit de voir


# GET /api/zones/ : liste des lotissements (utilisée pour remplir les listes déroulantes)
@api_view(['GET'])
def zones(request):
    """Liste des lotissements connus par le modèle IA."""
    return Response(ZONES_CONNUES)


# POST /api/estimer/ : estimation du prix et détection de fraude
@api_view(['POST'])
def estimer(request):
    """
    Deux façons d'appeler l'estimation :
      1) { "parcelle_id": 12, "prix": 50000 (optionnel) }
         -> analyse une parcelle enregistrée, met à jour son prix_estime
            et sauvegarde l'estimation en base ;
      2) { "superficie": 400 (m²), "zone": "mapendo", "infrastructure": 1,
           "prix": 50000 (optionnel) }
         -> simulation libre, rien n'est enregistré.
    Sans prix, la détection de fraude contrôle le prix estimé.
    """
    parcelle_id = request.data.get('parcelle_id')  # présent dans le mode 1
    prix = request.data.get('prix')  # prix à contrôler (facultatif)

    try:
        # Convertit le prix en nombre, ou None s'il n'a pas été fourni
        prix = float(prix) if prix not in (None, '') else None

        # ----- Mode 1 : parcelle enregistrée -----
        if parcelle_id:
            try:
                # On ne cherche que parmi les parcelles visibles par l'utilisateur
                parcelle = _parcelles_visibles(request).get(id=parcelle_id)
            except Parcelle.DoesNotExist:
                return Response({'erreur': 'Parcelle introuvable'}, status=404)

            analyse = analyser_parcelle(parcelle, prix)  # estimation + détection de fraude
            moyenne = Decimal(str(analyse['estimation']['moyenne']))  # prix retenu, en Decimal pour la base

            parcelle.prix_estime = moyenne  # met à jour le prix estimé de la parcelle
            parcelle.save(update_fields=['prix_estime'])  # n'enregistre que ce champ
            # Garde une trace de l'estimation dans l'historique
            Estimation.objects.create(
                parcelle=parcelle,
                superficie=analyse['superficie_m2'],
                zone=parcelle.zone,
                prix_predit=moyenne,
            )
            return Response({**analyse, 'parcelle_id': parcelle.id})  # renvoie l'analyse complète

        # ----- Mode 2 : simulation libre -----
        superficie = request.data.get('superficie')  # en m²
        zone = request.data.get('zone')  # lotissement
        infrastructure = request.data.get('infrastructure')  # 1 = certificat, 0 = autre
        # Les trois informations sont obligatoires
        if superficie in (None, '') or not zone or infrastructure in (None, ''):
            return Response({'erreur': 'Données manquantes (superficie, zone, infrastructure)'}, status=400)

        superficie = float(superficie)  # conversion en nombre
        infrastructure = int(infrastructure)  # conversion en entier
        if superficie <= 0:
            return Response({'erreur': 'La superficie doit être positive'}, status=400)

        estimation = estimer_prix(superficie, zone, infrastructure)  # prix prédits
        # Prix contrôlé : celui fourni, sinon le prix estimé
        prix_controle = prix if prix is not None else estimation['moyenne']
        fraude = detecter_fraude(superficie, zone, infrastructure, prix_controle)  # prix anormal ?

    except ValueError as e:
        # Valeur invalide (zone inconnue, nombre mal saisi...) : erreur 400 avec l'explication
        return Response({'erreur': str(e)}, status=400)

    # Résultat de la simulation libre
    return Response({
        'superficie_m2': superficie,
        'infrastructure': infrastructure,
        'prix_controle': prix_controle,
        'estimation': estimation,
        'fraude': fraude,
    })


# GET /api/statistiques/ : chiffres affichés sur le tableau de bord
@api_view(['GET'])
def statistiques(request):
    """Chiffres du tableau de bord, limités à ce que l'utilisateur peut voir."""
    user = request.user  # utilisateur connecté
    parcelles = _parcelles_visibles(request)  # parcelles visibles selon le rôle

    transactions = Transaction.objects.all()
    estimations = Estimation.objects.all()
    # Restreint les transactions et estimations selon le rôle (l'admin voit tout)
    if user.role == 'vendeur':
        transactions = transactions.filter(vendeur=user)  # ses ventes
        estimations = estimations.filter(parcelle__proprietaire=user)  # estimations de ses parcelles
    elif user.role == 'acheteur':
        transactions = transactions.filter(acheteur=user)  # ses achats
        estimations = estimations.filter(parcelle__transaction__acheteur=user).distinct()

    # Fraudes : transactions dont le montant est jugé anormal par l'Isolation Forest
    fraudes = 0
    for t in transactions.select_related('parcelle'):  # select_related évite une requête par parcelle
        try:
            if analyser_parcelle(t.parcelle, t.montant)['fraude']['est_fraude']:
                fraudes += 1  # montant suspect : on le compte
        except ValueError:
            pass  # zone inconnue du modèle

    # Nombre de transactions par statut, ex. {"en_cours": 2, "terminée": 1}
    par_statut = {s['statut']: s['n'] for s in transactions.values('statut').annotate(n=Count('id'))}

    return Response({
        'parcelles': parcelles.count(),
        'transactions': transactions.count(),
        'transactions_par_statut': par_statut,
        'estimations': estimations.count(),
        'fraudes': fraudes,
    })
