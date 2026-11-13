# ==========================================================
# python manage.py importer_scans_registre <rattachement.csv> <dossier_photos>
# Ajoute au registre officiel des titres les documents scannés (CamScanner) dont le
# SU a été reconnu par OCR et retrouvé dans le jeu de données réel (510 fiches) :
#   - titulaire, lotissement, superficie et nature du titre : valeurs du jeu de données ;
#   - volume / folio : lus sur le scan (OCR) quand ils sont lisibles ;
#   - scan : la photo du document authentique (servira à la comparaison visuelle).
# Un SU déjà présent dans le registre n'est pas modifié (on ne remplace pas un scan existant).
# ==========================================================
from pathlib import Path

import pandas as pd
from django.conf import settings
from django.core.files import File
from django.core.management.base import BaseCommand

from parcelles.models import DocumentOfficiel
from parcelles.verification import invalider_su, normaliser_su
from utilisateurs.models import Utilisateur

FICHIER_DONNEES = Path(settings.BASE_DIR).parent / 'database' / 'DATA_final_mercuriale.xlsx'
TYPES = {'certificat_enregistrement': 'certificat', 'certificat_enregistrement_ordinaire': 'certificat',
         'contrat_location': 'contrat_location', 'contrat_concession_perpetuelle': 'autre'}


class Command(BaseCommand):
    help = "Ajoute au registre des titres les scans rattachés à une fiche réelle (par SU)."

    def add_arguments(self, parser):
        parser.add_argument('rattachement')
        parser.add_argument('photos')

    def handle(self, rattachement, photos, **_):
        r = pd.read_csv(rattachement, dtype={'su': str, 'folio': str})
        r = r[r.su.notna() & r.retenu]
        fiches = pd.read_excel(FICHIER_DONNEES, sheet_name='Feuil1')
        fiches['SU'] = fiches['SU'].astype(str)
        admin = Utilisateur.objects.filter(role='admin').order_by('id').first()
        deja = {normaliser_su(d.su) for d in DocumentOfficiel.objects.all()}
        numeros = set(DocumentOfficiel.objects.values_list('numero', flat=True))
        crees = ignores = 0
        # une photo par SU : celle où le nom du titulaire est le mieux reconnu
        for su, g in r.sort_values('nom_confirme', ascending=False).groupby('su', sort=False):
            if su in deja:
                ignores += 1
                continue
            ligne = g.iloc[0]
            fiche = fiches[(fiches.SU == su) & (fiches.NOM == ligne['nom'])].iloc[0]
            su_affiche = f"SU {su[:-3]}.{su[-3:]}"
            vols = g.dropna(subset=['volume', 'folio'])
            vols = vols[vols.folio.str.len() >= 2]
            volume, folio = (vols.iloc[0]['volume'], vols.iloc[0]['folio']) if len(vols) else ('', '')
            numero = f"Vol. {volume} Folio {folio}" if volume else f"Réf. {su_affiche}"
            if numero in numeros:
                numero = f"{numero} ({su_affiche})"
            doc = DocumentOfficiel(
                numero=numero, type_document=TYPES.get(str(fiche['TYPE-DOCUMENTS']).strip(), 'autre'), su=su_affiche,
                titulaire=str(fiche['NOM']).strip(), zone=str(fiche['LOTISSEMENT']).strip().lower(),
                superficie_m2=float(fiche['SUPERFICIE_M2']), volume=volume, folio=folio, statut='valide',
                observations=(f"Importé depuis les scans CamScanner du 25-07-2026 ({ligne['photo']}). "
                              f"Titulaire, lotissement, superficie et nature repris du jeu de données réel ; "
                              f"volume/folio lus par OCR."),
                enregistre_par=admin,
            )
            chemin = Path(photos) / ligne['photo']
            with open(chemin, 'rb') as f:
                doc.scan.save(f"scan_SU_{su}.jpg", File(f), save=False)
            doc.save()
            invalider_su(doc.su)
            numeros.add(numero)
            deja.add(su)
            crees += 1
            self.stdout.write(f"  + {su_affiche:10s} {numero:28s} {doc.titulaire}")
        self.stdout.write(self.style.SUCCESS(f"{crees} document(s) ajouté(s), {ignores} SU déjà au registre."))
