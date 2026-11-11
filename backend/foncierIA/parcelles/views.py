from decimal import Decimal  # nombres décimaux exacts (pour les prix en base)

import mimetypes  # déduit le type MIME d'un fichier à partir de son nom
import os  # découpe du nom de fichier (extension)

from django.conf import settings  # réglages du projet (taille maximale des pièces)
from django.db import transaction as db_transaction  # regroupe plusieurs écritures en base (tout ou rien)
from django.db.models import Q  # combinaison de conditions (OU) dans les requêtes
from django.http import FileResponse  # réponse HTTP qui envoie un fichier
from rest_framework import viewsets, permissions, mixins  # ViewSets et permissions DRF
from rest_framework.decorators import action  # routes supplémentaires sur un ViewSet
from rest_framework.exceptions import PermissionDenied, ValidationError  # erreurs 403 et 400
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser  # JSON et formulaires avec fichiers
from rest_framework.response import Response  # réponse JSON
from .models import Parcelle, DocumentParcelle, DocumentOfficiel  # parcelles, pièces et registre officiel
from .serializers import ParcelleSerializer, DocumentParcelleSerializer, DocumentOfficielSerializer  # conversion <-> JSON
from .verification import authentifier, invalider_su  # authentification par réseau de neurones (lancée par l'admin)
from utilisateurs.permissions import EstAdmin  # registre officiel réservé à l'administrateur
from ia.modele import (  # analyse IA (estimation + détection de fraude + contrôle du prix)
    analyser_parcelle, controler_prix, superficie_en_m2, infrastructure_depuis_nature,
)

# Extensions acceptées pour les pièces justificatives, par type
EXTENSIONS_DOCUMENTS = {
    'photo': {'.jpg', '.jpeg', '.png', '.webp', '.gif'},
    'video': {'.mp4', '.webm', '.mov', '.3gp', '.mkv'},
    'document': {'.pdf'},
}


def type_de_fichier(nom):
    """Renvoie 'photo', 'video' ou 'document' selon l'extension (None si refusée)."""
    extension = os.path.splitext(nom)[1].lower()
    for type_piece, extensions in EXTENSIONS_DOCUMENTS.items():
        if extension in extensions:
            return type_piece
    return None


def controler_fichiers(fichiers):
    """Refuse (erreur 400) les fichiers d'un type non accepté ou trop volumineux."""
    for f in fichiers:
        if type_de_fichier(f.name) is None:
            raise ValidationError({
                'erreur': f"« {f.name} » : format non accepté. Envoyez des photos, des vidéos ou des PDF."
            })
        if f.size > settings.TAILLE_MAX_DOCUMENT:
            limite = settings.TAILLE_MAX_DOCUMENT // (1024 * 1024)
            raise ValidationError({'erreur': f"« {f.name} » dépasse la taille maximale de {limite} Mo."})


def enregistrer_documents(parcelle, fichiers):
    """Enregistre les pièces justificatives (déjà contrôlées) d'une parcelle."""
    for f in fichiers:
        DocumentParcelle.objects.create(
            parcelle=parcelle, fichier=f, type=type_de_fichier(f.name), nom=os.path.basename(f.name)[:255],
        )


CHAMPS_PRIX = {'superficie_ha', 'superficie_ares', 'superficie_ca', 'superficie_pourcent', 'zone', 'nature', 'prix_reel'}


def exiger_prix_coherent(donnees, parcelle=None):
    """
    Règle des 10 % : le prix réel ne peut pas s'éloigner de plus de ECART_PRIX_MAX
    du prix estimé par l'IA. Sinon : erreur 400 avec le prix proposé par le système
    (prix_propose, prix_min, prix_max), que le frontend propose au vendeur.
    'donnees' = champs envoyés ; 'parcelle' = valeurs actuelles (modification).
    """
    def valeur(champ, defaut=0):
        if champ in donnees:
            return donnees[champ]
        return getattr(parcelle, champ) if parcelle is not None else defaut

    superficie = superficie_en_m2(valeur('superficie_ha'), valeur('superficie_ares'),
                                  valeur('superficie_ca'), valeur('superficie_pourcent'))
    if superficie <= 0:
        return
    try:
        controle = controler_prix(superficie, valeur('zone', ''), infrastructure_depuis_nature(valeur('nature', '')),
                                  valeur('prix_reel'), settings.ECART_PRIX_MAX)
    except ValueError:
        return  # lotissement inconnu du modèle : pas d'estimation, pas de contrôle
    if not controle['accepte']:
        sens = "supérieur" if controle['ecart'] > 0 else "inférieur"
        raise ValidationError({
            'erreur': f"Le prix déclaré est {sens} de {abs(controle['ecart']):.0f} % au prix estimé par l'IA "
                      f"({controle['prix_estime']:,.0f} $). L'écart maximal admis est de "
                      f"{settings.ECART_PRIX_MAX:.0%} : le système vous propose {controle['prix_estime']:,.0f} $ "
                      f"(fourchette acceptée : {controle['prix_min']:,.0f} $ à {controle['prix_max']:,.0f} $).".replace(',', ' '),
            'prix_propose': controle['prix_estime'],
            'prix_min': controle['prix_min'],
            'prix_max': controle['prix_max'],
            'ecart': controle['ecart'],
        })


MESSAGE_BLOCKCHAIN = "Cette parcelle est inscrite sur la blockchain : ses données et ses pièces ne peuvent plus être modifiées, y compris par l'administrateur."


def inscrite_sur_blockchain(parcelle):
    """Vente validée et écrite dans le smart contract : la parcelle est figée pour tous."""
    return parcelle.statut == 'vendue' or bool(parcelle.hash_blockchain)


def mettre_a_jour_prix_estime(parcelle):
    """Calcule le prix estimé par l'IA et l'enregistre sur la parcelle."""
    from estimations.models import Estimation  # import local pour éviter une importation circulaire

    try:
        analyse = analyser_parcelle(parcelle)  # prédiction du prix par l'IA
    except ValueError:
        return  # zone inconnue du modèle : pas d'estimation possible

    moyenne = Decimal(str(analyse['estimation']['moyenne']))  # moyenne LR + RF en Decimal
    parcelle.prix_estime = moyenne  # met à jour le prix estimé
    parcelle.save(update_fields=['prix_estime'])  # n'enregistre que ce champ
    # Garde une trace de l'estimation dans l'historique
    Estimation.objects.create(
        parcelle=parcelle,
        superficie=analyse['superficie_m2'],
        zone=parcelle.zone,
        prix_predit=moyenne,
    )


# Routes /api/parcelles/ : liste, création, détail, modification, suppression
class ParcelleViewSet(viewsets.ModelViewSet):
    """
    - admin    : voit toutes les parcelles
    - vendeur  : ne voit que SES propres parcelles
    - acheteur : voit les parcelles disponibles ET vérifiées par l'admin
                 + celles pour lesquelles il a une transaction (pour son historique)
    """
    queryset = Parcelle.objects.all()
    serializer_class = ParcelleSerializer  # serializer utilisé pour le JSON
    permission_classes = [permissions.IsAuthenticated]  # il faut être connecté
    # JSON pour les modifications, "multipart" pour l'ajout avec pièces jointes
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    # Détermine les parcelles visibles selon le rôle de l'utilisateur connecté
    def get_queryset(self):
        user = self.request.user
        qs = Parcelle.objects.all().order_by('-created_at')  # plus récentes d'abord

        if user.role == 'admin':
            return qs  # l'admin voit tout
        if user.role == 'vendeur':
            return qs.filter(proprietaire=user)  # uniquement ses propres parcelles
        # acheteur
        # Parcelles disponibles et vérifiées, OU pour lesquelles il a fait une offre ;
        # distinct() évite les doublons
        return qs.filter(
            Q(statut='disponible', verification='verifiee') | Q(transaction__acheteur=user)
        ).distinct()

    # POST /api/parcelles/ : enregistrement d'une nouvelle parcelle
    def perform_create(self, serializer):
        # Seuls les vendeurs et l'admin peuvent ajouter une parcelle
        if self.request.user.role not in ('vendeur', 'admin'):
            raise PermissionDenied("Seul un vendeur ou un administrateur peut ajouter une parcelle.")
        # Pièces justificatives obligatoires : sans elles, l'admin ne peut pas vérifier l'authenticité
        fichiers = self.request.FILES.getlist('documents')
        if not fichiers:
            raise ValidationError({
                'erreur': "Joignez au moins une pièce justificative de la parcelle "
                          "(photo ou vidéo du titre foncier, PDF...)."
            })
        controler_fichiers(fichiers)
        # Le prix réel doit rester à moins de 10 % du prix estimé par l'IA
        exiger_prix_coherent(serializer.validated_data)
        # Parcelle et pièces sont enregistrées ensemble (tout ou rien)
        with db_transaction.atomic():
            # Le propriétaire est l'utilisateur connecté (il ne peut pas le choisir) ;
            # la parcelle attend la vérification de l'admin avant d'être proposée aux acheteurs
            parcelle = serializer.save(proprietaire=self.request.user, verification='en_attente')
            enregistrer_documents(parcelle, fichiers)
        mettre_a_jour_prix_estime(parcelle)  # l'IA calcule aussitôt le prix estimé
        # Pas d'authentification automatique : le dossier attend que l'admin lance le réseau de neurones

    # Refuse l'action si l'utilisateur n'est ni l'admin ni le propriétaire
    def _verifier_proprietaire(self, parcelle):
        user = self.request.user
        if user.role != 'admin' and parcelle.proprietaire_id != user.id:
            raise PermissionDenied("Vous ne pouvez modifier que vos propres parcelles.")

    # PUT/PATCH /api/parcelles/<id>/ : modification (statut, prix, etc.)
    def perform_update(self, serializer):
        from transactions.models import Transaction  # import local pour éviter une importation circulaire

        parcelle = serializer.instance  # parcelle avant modification
        self._verifier_proprietaire(parcelle)
        admin = self.request.user.role == 'admin'
        donnees = serializer.validated_data  # champs envoyés par le client

        # Une vente inscrite sur la blockchain est définitive, même pour l'admin :
        # la base doit rester identique à ce qui est enregistré dans le smart contract
        if inscrite_sur_blockchain(parcelle):
            raise PermissionDenied(MESSAGE_BLOCKCHAIN)

        # Contrôles sur le changement de statut
        nouveau_statut = donnees.get('statut', parcelle.statut)
        if nouveau_statut != parcelle.statut:
            # "vendue" ne s'obtient que par la validation d'une transaction par l'admin
            if nouveau_statut == 'vendue' and not admin:
                raise PermissionDenied(
                    "Une parcelle devient « vendue » uniquement quand l'administrateur valide la transaction."
                )
            # Impossible de remettre en vente une parcelle dont une offre est déjà acceptée
            if nouveau_statut == 'disponible' and Transaction.objects.filter(
                parcelle=parcelle, statut='acceptée'
            ).exists():
                raise ValidationError({
                    'erreur': "Une offre acceptée est en attente de validation : "
                              "annulez d'abord la vente depuis la page Transactions."
                })

        # Nouveau prix ou nouvelles caractéristiques : le prix doit rester à moins de 10 % de l'estimation
        if CHAMPS_PRIX & set(donnees) and parcelle.statut != 'vendue':
            exiger_prix_coherent(donnees, parcelle)

        # Si le vendeur change l'identité d'une parcelle déjà contrôlée, elle doit être revérifiée
        champs_identite = {'su', 'superficie_ha', 'superficie_ares', 'superficie_ca', 'superficie_pourcent',
                           'zone', 'nature', 'titre_foncier', 'latitude', 'longitude', 'contour'}
        modifies = {c for c in champs_identite & set(donnees) if donnees[c] != getattr(parcelle, c)}
        if modifies and not admin and parcelle.verification != 'en_attente':
            parcelle = serializer.save(verification='en_attente', motif_rejet='', verifie_par='',
                                       rapport_verification=None)
        elif modifies:
            # L'ancien rapport ne correspond plus au dossier : l'admin devra relancer l'authentification
            parcelle = serializer.save(rapport_verification=None)
        else:
            parcelle = serializer.save()  # enregistre les modifications

        # Nouvelle estimation IA seulement si une caractéristique utile au modèle a changé
        champs_ia = {'superficie_ha', 'superficie_ares', 'superficie_ca', 'superficie_pourcent',
                     'zone', 'nature', 'prix_reel'}
        if champs_ia & set(donnees):  # "&" = intersection : au moins un de ces champs a été modifié
            mettre_a_jour_prix_estime(parcelle)

    # DELETE /api/parcelles/<id>/ : suppression
    def perform_destroy(self, instance):
        from transactions.models import Transaction  # import local pour éviter une importation circulaire

        self._verifier_proprietaire(instance)
        # Supprimer la parcelle effacerait aussi ses transactions (CASCADE) : on l'interdit
        if Transaction.objects.filter(parcelle=instance).exists():
            raise ValidationError({
                'erreur': "Impossible de supprimer une parcelle qui a des transactions "
                          "(leur historique serait perdu). Mettez-la plutôt en négociation."
            })
        # Efface aussi les fichiers des pièces sur le disque (la base, elle, les supprime en cascade)
        for document in instance.documents.all():
            document.fichier.delete(save=False)
        instance.delete()  # suppression définitive

    # GET  /api/parcelles/<id>/documents/ : liste des pièces justificatives
    # POST /api/parcelles/<id>/documents/ : ajout de pièces (champ "documents", un ou plusieurs fichiers)
    @action(detail=True, methods=['get', 'post'])
    def documents(self, request, pk=None):
        parcelle = self.get_object()
        user = request.user
        # Les pièces sont confidentielles : admin et propriétaire uniquement
        if user.role != 'admin' and parcelle.proprietaire_id != user.id:
            raise PermissionDenied("Les pièces d'une parcelle sont réservées à son propriétaire et à l'administrateur.")

        if request.method == 'POST':
            if inscrite_sur_blockchain(parcelle):
                raise PermissionDenied(MESSAGE_BLOCKCHAIN)
            fichiers = request.FILES.getlist('documents')
            if not fichiers:
                raise ValidationError({'erreur': "Aucun fichier reçu."})
            controler_fichiers(fichiers)
            with db_transaction.atomic():
                enregistrer_documents(parcelle, fichiers)
                # De nouvelles pièces après un rejet : le dossier repasse devant l'admin
                if parcelle.verification == 'rejetee':
                    parcelle.verification = 'en_attente'
                    parcelle.motif_rejet = ''
                # Le dossier a changé : l'ancien rapport du réseau est périmé (l'admin relancera l'analyse)
                parcelle.rapport_verification = None
                parcelle.save(update_fields=['verification', 'motif_rejet', 'rapport_verification'])

        pieces = parcelle.documents.order_by('created_at')
        return Response(DocumentParcelleSerializer(pieces, many=True).data)

    # POST /api/parcelles/<id>/verifier/ : décision de l'admin après examen des pièces
    # Corps : { "decision": "verifiee" } ou { "decision": "rejetee", "motif": "..." }
    @action(detail=True, methods=['post'])
    def verifier(self, request, pk=None):
        if request.user.role != 'admin':
            raise PermissionDenied("Seul un administrateur peut vérifier une parcelle.")
        parcelle = self.get_object()
        if inscrite_sur_blockchain(parcelle):
            raise PermissionDenied(MESSAGE_BLOCKCHAIN)
        decision = request.data.get('decision')
        motif = (request.data.get('motif') or '').strip()

        if decision not in ('verifiee', 'rejetee'):
            raise ValidationError({'erreur': "Décision invalide : « verifiee » ou « rejetee »."})
        if decision == 'verifiee' and not parcelle.documents.exists():
            raise ValidationError({'erreur': "Impossible de vérifier une parcelle sans pièce justificative."})
        if decision == 'rejetee' and not motif:
            raise ValidationError({'erreur': "Indiquez le motif du rejet : il sera affiché au vendeur."})

        parcelle.verification = decision
        parcelle.motif_rejet = motif[:255] if decision == 'rejetee' else ''
        parcelle.verifie_par = 'admin'  # décision manuelle de l'administrateur
        parcelle.save(update_fields=['verification', 'motif_rejet', 'verifie_par'])
        # Décision humaine = nouvel exemple étiqueté pour le réseau d'authentification
        from ia.apprentissage_continu import declencher_si_necessaire
        declencher_si_necessaire("décision de l'administrateur")
        return Response(self.get_serializer(parcelle).data)

    # POST /api/parcelles/<id>/authentifier/ : l'admin lance le réseau de neurones sur ce dossier
    @action(detail=True, methods=['post'], url_path='authentifier')
    def lancer_authentification(self, request, pk=None):
        if request.user.role != 'admin':
            raise PermissionDenied("Seul un administrateur peut lancer l'authentification par l'IA.")
        parcelle = self.get_object()
        try:
            authentifier(parcelle, request.user)
        except FileNotFoundError as e:  # réseau pas encore entraîné
            raise ValidationError({'erreur': str(e)})
        return Response(self.get_serializer(parcelle).data)

    # POST /api/parcelles/authentifier_en_attente/ : l'admin lance le réseau sur TOUS les dossiers en attente
    @action(detail=False, methods=['post'])
    def authentifier_en_attente(self, request):
        if request.user.role != 'admin':
            raise PermissionDenied("Seul un administrateur peut lancer l'authentification par l'IA.")
        bilan = {'authentique': 0, 'douteux': 0, 'falsifie': 0, 'introuvable': 0}
        dossiers = Parcelle.objects.filter(verification='en_attente').exclude(statut='vendue') \
            .select_related('proprietaire')
        try:
            for parcelle in dossiers:
                bilan[authentifier(parcelle, request.user)['resultat']] += 1
        except FileNotFoundError as e:
            raise ValidationError({'erreur': str(e)})
        return Response({'analyses': sum(bilan.values()), **bilan})


# Routes /api/documents-officiels/ : registre officiel des titres (table "documents"), admin uniquement
class DocumentOfficielViewSet(viewsets.ModelViewSet):
    queryset = DocumentOfficiel.objects.select_related('enregistre_par')
    serializer_class = DocumentOfficielSerializer
    permission_classes = [EstAdmin]

    def perform_create(self, serializer):
        doc = serializer.save(enregistre_par=self.request.user)
        invalider_su(doc.su)  # rapports de ce SU périmés : l'admin relancera l'IA

    def perform_update(self, serializer):
        ancien_su = serializer.instance.su
        doc = serializer.save()
        invalider_su(doc.su)  # ex. : document passé "en litige" -> parcelle validée par l'IA repasse en attente
        if ancien_su != doc.su:
            invalider_su(ancien_su)

    def perform_destroy(self, instance):
        su = instance.su
        if instance.scan:
            instance.scan.delete(save=False)  # efface aussi le fichier du disque
        instance.delete()
        invalider_su(su)

    # GET  /api/documents-officiels/<id>/scan/ : affiche le scan du document authentique
    # POST /api/documents-officiels/<id>/scan/ : joint (ou remplace) le scan (champ "scan" : photo ou PDF)
    @action(detail=True, methods=['get', 'post'], parser_classes=[MultiPartParser, FormParser])
    def scan(self, request, pk=None):
        doc = self.get_object()
        if request.method == 'POST':
            fichier = request.FILES.get('scan')
            if not fichier:
                raise ValidationError({'erreur': "Aucun fichier reçu."})
            if type_de_fichier(fichier.name) not in ('photo', 'document'):
                raise ValidationError({'erreur': "Le scan doit être une photo (JPG, PNG...) ou un PDF."})
            if fichier.size > settings.TAILLE_MAX_DOCUMENT:
                raise ValidationError({'erreur': "Fichier trop volumineux."})
            if doc.scan:
                doc.scan.delete(save=False)  # remplace l'ancien scan
            doc.scan.save(os.path.basename(fichier.name)[:100], fichier, save=True)
            return Response(self.get_serializer(doc).data)
        if not doc.scan:
            return Response({'erreur': "Aucun scan pour ce document."}, status=404)
        try:
            contenu = doc.scan.open('rb')
        except FileNotFoundError:
            return Response({'erreur': "Le fichier est introuvable sur le serveur."}, status=404)
        type_mime = mimetypes.guess_type(doc.scan.name)[0] or 'application/octet-stream'
        return FileResponse(contenu, content_type=type_mime)


# Routes /api/documents/<id>/ (suppression) et /api/documents/<id>/fichier/ (téléchargement)
class DocumentParcelleViewSet(mixins.DestroyModelMixin, viewsets.GenericViewSet):
    """Pièces justificatives : accessibles à l'admin et au propriétaire de la parcelle uniquement."""
    queryset = DocumentParcelle.objects.all()
    serializer_class = DocumentParcelleSerializer
    permission_classes = [permissions.IsAuthenticated]

    # Un vendeur ne peut atteindre que les pièces de ses propres parcelles
    def get_queryset(self):
        user = self.request.user
        qs = DocumentParcelle.objects.select_related('parcelle')
        if user.role == 'admin':
            return qs
        return qs.filter(parcelle__proprietaire=user)

    # GET /api/documents/<id>/fichier/ : envoie le fichier (le frontend l'affiche dans la page)
    @action(detail=True, methods=['get'])
    def fichier(self, request, pk=None):
        document = self.get_object()
        type_mime = mimetypes.guess_type(document.nom)[0] or 'application/octet-stream'
        try:
            contenu = document.fichier.open('rb')
        except FileNotFoundError:
            return Response({'erreur': "Le fichier est introuvable sur le serveur."}, status=404)
        return FileResponse(contenu, content_type=type_mime, filename=document.nom)

    # DELETE /api/documents/<id>/ : retrait d'une pièce
    def perform_destroy(self, instance):
        parcelle = instance.parcelle
        if inscrite_sur_blockchain(parcelle):
            raise PermissionDenied(MESSAGE_BLOCKCHAIN)
        if self.request.user.role != 'admin':
            # Les pièces qui ont servi à la vérification doivent rester au dossier
            if parcelle.verification == 'verifiee':
                raise PermissionDenied("Les pièces d'une parcelle vérifiée ne peuvent plus être retirées.")
            if parcelle.documents.count() <= 1:
                raise ValidationError({'erreur': "Une parcelle doit garder au moins une pièce justificative."})
        instance.fichier.delete(save=False)  # efface le fichier du disque
        instance.delete()
