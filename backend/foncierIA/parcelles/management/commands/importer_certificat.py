# ==========================================================
# python manage.py importer_certificat
# Inscrit dans le registre officiel (table "documents") le certificat
# d'enregistrement photographié dans backend/documentFoncier/dc.jpeg,
# avec sa photo comme scan de référence.
# ==========================================================
from datetime import date
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError

from parcelles.models import DocumentOfficiel
from parcelles.verification import invalider_su

PHOTO = Path(settings.BASE_DIR).parent / 'documentFoncier' / 'dc.jpeg'

# Informations recopiées du certificat (dc.jpeg)
CERTIFICAT = {
    'numero': 'Vol. G1/98 Folio 194',
    'type_document': 'certificat',  # certificat d'enregistrement d'une concession perpétuelle
    'su': 'SU 27.598',  # parcelle n° 27.598 du plan cadastral de la Commune de Goma
    'titulaire': 'KASEREKA MUHINDO Jules',
    'zone': 'katindo',  # lieu dit Katindo
    # « deux ares quatre-vingt-six centiares cinquante centièmes » = 286,50 m²
    'superficie_m2': Decimal('286.50'),
    'volume': 'G1/98',
    'folio': '194',
    'date_delivrance': date(2024, 5, 14),  # établi à Goma le 14 mai 2024
    'bureau': 'Conservation des titres immobiliers de Goma (Conservateur a.i : KAKULE KAISIRIRYA Damson)',
    'pv_bornage': '6214/2024',  # PV de mesurage et bornage du 25 avril 2024
    'statut': 'valide',
    'observations': "Concession perpétuelle, usage résidentiel. Contrat du 14/05/2024, registre journal "
                    "n° d'ordre général 47.004 et spécial GOM/RCP 15.842. Croquis au 1/1000 : "
                    "Avenue Madiata, voisins SU 27.537, 27.539 et 59.291.",
}


class Command(BaseCommand):
    help = "Inscrit le certificat d'enregistrement de documentFoncier/dc.jpeg dans le registre officiel."

    def handle(self, *args, **options):
        if not PHOTO.exists():
            raise CommandError(f"Photo introuvable : {PHOTO}")
        doc, cree = DocumentOfficiel.objects.update_or_create(
            numero=CERTIFICAT['numero'], defaults={k: v for k, v in CERTIFICAT.items() if k != 'numero'},
        )
        if doc.scan:
            doc.scan.delete(save=False)
        with open(PHOTO, 'rb') as f:
            doc.scan.save('certificat_SU_27598.jpeg', File(f), save=True)
        invalider_su(doc.su)  # les parcelles de ce SU devront être réauthentifiées par l'admin
        self.stdout.write(self.style.SUCCESS(
            f"{'Ajouté' if cree else 'Mis à jour'} : {doc.numero} — {doc.su} — {doc.titulaire} "
            f"({doc.superficie_m2} m²), scan : {doc.scan.name}"
        ))
