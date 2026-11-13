# ==========================================================
# AUTHENTIFICATION D'UNE PARCELLE PAR RÉSEAU DE NEURONES
# Lancée UNIQUEMENT par l'administrateur (jamais automatiquement).
#   1. On retrouve le document du registre officiel (table "documents") qui
#      correspond au dossier (numéro de titre, sinon SU).
#   2. On calcule les indices de concordance entre le dossier du vendeur et ce
#      document : les 5 entrées du réseau (SU, titulaire, lotissement, nature,
#      superficie) et des contrôles complémentaires (statut du document, numéro
#      du titre, position GPS, contour, photo du titre / scan du registre, pièces).
#   3. Le réseau de neurones (ia/authentification.py), entraîné sur les 510
#      enregistrements fonciers réels du jeu Kaggle, donne la probabilité que
#      le dossier soit authentique :
#        - >= SEUIL_AUTHENTIQUE  -> "authentique" : parcelle vérifiée (par l'IA)
#        - <  SEUIL_FALSIFIE     -> "falsifie"    : rejet recommandé à l'admin
#        - entre les deux        -> "douteux"     : l'admin examine les pièces
#      Un document en litige / annulé donne toujours "falsifie" ; un contrôle
#      complémentaire bloquant non satisfait empêche "authentique" ("douteux").
#      Dans les deux derniers cas, la décision finale reste à l'administrateur.
# ==========================================================
import math  # calculs de distance et de surface
import re  # nettoyage des textes
import unicodedata  # suppression des accents
from datetime import datetime
from difflib import SequenceMatcher  # similarité entre deux textes

from django.conf import settings

from ia.authentification import CARACTERISTIQUES, probabilite_authentique, facteurs_de_doute
from ia.modele import superficie_en_m2  # superficie déclarée en m²
from .models import DocumentOfficiel

TOLERANCE_SUPERFICIE = 0.02  # 2 % d'écart admis entre superficie déclarée et inscrite
DISTANCE_MAX_M = 150  # écart maximal (m) entre la position déclarée et celle du registre
TOLERANCE_CONTOUR = 0.15  # 15 % d'écart admis entre l'aire du contour tracé et la superficie
SEUIL_AUTHENTIQUE = getattr(settings, 'SEUIL_AUTHENTIQUE', 0.80)
SEUIL_FALSIFIE = getattr(settings, 'SEUIL_FALSIFIE', 0.40)


# ---------------------------------------------------------------- textes
def normaliser(texte):
    """'Josué  LUKUNATO' -> 'josue lukunato' (sans accents, minuscules, espaces simples)."""
    texte = unicodedata.normalize('NFKD', str(texte or '')).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', ' ', texte.lower()).strip()


def normaliser_su(su):
    """'SU:63251', 'su 63251', '63251' -> '63251'."""
    return re.sub(r'^su', '', normaliser(su).replace(' ', ''))


MOTS_REFERENCE = {'vol', 'volume', 'folio', 'fol', 'f', 'n', 'no', 'numero', 'num', 'ce'}


def normaliser_numero(numero):
    """'Vol. G1/98 Folio 194', 'G1/98 F°194' -> 'g 1 98 194' (on ne garde que les références)."""
    texte = normaliser(numero)
    texte = re.sub(r'(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])', ' ', texte)
    return ' '.join(m for m in texte.split() if m not in MOTS_REFERENCE)


def similarite(a, b):
    """Similarité de deux textes déjà normalisés : 1 = identiques, 0 = rien en commun."""
    if not a and not b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def similarite_noms(a, b):
    """Noms de personnes : 1 si tous les mots d'un nom figurent dans l'autre (ordre indifférent),
    sinon la meilleure similarité entre les mots communs et l'écriture des noms."""
    mots_a, mots_b = set(normaliser(a).split()), set(normaliser(b).split())
    if not mots_a or not mots_b:
        return 0.0
    if mots_a <= mots_b or mots_b <= mots_a:
        return 1.0
    communs = len(mots_a & mots_b) / min(len(mots_a), len(mots_b))
    ecriture = similarite(' '.join(sorted(mots_a)), ' '.join(sorted(mots_b)))
    return max(communs * 0.9, ecriture * 0.95)  # jamais 1 si les noms diffèrent


# ---------------------------------------------------------------- géométrie
def distance_m(lat1, lng1, lat2, lng2):
    """Distance en mètres entre deux points GPS (formule de haversine)."""
    r = 6_371_000  # rayon de la Terre
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def aire_contour_m2(contour):
    """Aire (m²) d'un polygone [[lat, lng], ...] : projection locale + formule du lacet."""
    if not contour or len(contour) < 3:
        return None
    lat0 = math.radians(sum(p[0] for p in contour) / len(contour))
    pts = [(math.radians(p[1]) * 6_371_000 * math.cos(lat0), math.radians(p[0]) * 6_371_000) for p in contour]
    s = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1] for i in range(len(pts)))
    return abs(s) / 2


# ---------------------------------------------------------------- images
def empreinte_image(chemin, taille=16):
    """Empreinte perceptuelle (dHash) : l'image est réduite en 17x16 niveaux de gris et chaque
    bit indique si un pixel est plus clair que son voisin de droite. Deux photos du même
    document donnent des empreintes proches, même avec un cadrage ou un éclairage différent."""
    from PIL import Image, ImageOps  # Pillow
    with Image.open(chemin) as img:
        img = ImageOps.exif_transpose(img).convert('L').resize((taille + 1, taille))
        px = list(img.getdata())
    return [px[l * (taille + 1) + c] > px[l * (taille + 1) + c + 1] for l in range(taille) for c in range(taille)]


def similarite_image(parcelle, doc):
    """Meilleure ressemblance (0 à 1) entre les photos déposées et le scan du registre ;
    None si la comparaison est impossible (pas de scan image ou pas de photo)."""
    if not doc.scan or not doc.scan.name.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
        return None
    try:
        reference = empreinte_image(doc.scan.path)
    except Exception:
        return None
    meilleure = None
    for piece in parcelle.documents.filter(type='photo'):
        try:
            e = empreinte_image(piece.fichier.path)
        except Exception:
            continue
        s = sum(a == b for a, b in zip(reference, e)) / len(reference)
        meilleure = s if meilleure is None else max(meilleure, s)
    return meilleure


# ---------------------------------------------------------------- registre
def trouver_document(parcelle):
    """Document du registre correspondant : d'abord par numéro de titre, sinon par SU."""
    documents = list(DocumentOfficiel.objects.all())
    if parcelle.titre_foncier:
        numero = normaliser_numero(parcelle.titre_foncier)
        doc = next((d for d in documents if normaliser_numero(d.numero) == numero), None)
        if doc:
            return doc
    su = normaliser_su(parcelle.su)
    candidats = [d for d in documents if normaliser_su(d.su) == su]
    candidats.sort(key=lambda d: d.statut != 'valide')  # on préfère un document valide
    return candidats[0] if candidats else None


# ---------------------------------------------------------------- analyse
def caracteristiques(parcelle, doc):
    """Calcule les indices du dossier (les 5 entrées du réseau + les contrôles complémentaires)
    et les valeurs lisibles affichées à l'admin."""
    declaree = superficie_en_m2(parcelle.superficie_ha, parcelle.superficie_ares,
                                parcelle.superficie_ca, parcelle.superficie_pourcent)
    inscrite = float(doc.superficie_m2)
    v = {
        'sim_su': similarite(normaliser_su(parcelle.su), normaliser_su(doc.su)),
        'numero_absent': int(not parcelle.titre_foncier),
        'sim_titulaire': similarite_noms(doc.titulaire, parcelle.proprietaire.nom),
        'sim_zone': similarite(normaliser(parcelle.zone), normaliser(doc.zone)),
        'ecart_superficie': min(abs(declaree - inscrite) / inscrite, 1) if inscrite else 1,
        'document_valide': int(doc.statut == 'valide'),
        'nb_pieces': min(parcelle.documents.count(), 5) / 5,
    }
    v['sim_numero'] = 0.5 if v['numero_absent'] else similarite(normaliser_numero(parcelle.titre_foncier),
                                                                 normaliser_numero(doc.numero))
    mots_type = {'certificat': 'certificat', 'contrat_location': 'location', 'fiche_parcellaire': 'fiche'}
    mot = mots_type.get(doc.type_document)
    v['nature_concorde'] = int(mot is None or mot in normaliser(parcelle.nature))

    lisible = {'superficie_declaree': declaree, 'superficie_inscrite': inscrite, 'distance_m': None, 'aire_contour': None}
    if parcelle.latitude is not None and doc.latitude is not None and doc.longitude is not None:
        d = distance_m(float(parcelle.latitude), float(parcelle.longitude), float(doc.latitude), float(doc.longitude))
        v['distance_gps'], v['gps_absent'], lisible['distance_m'] = min(d / 1000, 1), 0, d
    else:
        v['distance_gps'], v['gps_absent'] = 0.0, 1

    aire = aire_contour_m2(parcelle.contour)
    if aire is not None and declaree:
        v['ecart_contour'], v['contour_absent'], lisible['aire_contour'] = min(abs(aire - declaree) / declaree, 1), 0, aire
    else:
        v['ecart_contour'], v['contour_absent'] = 0.0, 1

    s_img = similarite_image(parcelle, doc)
    v['sim_image'], v['image_absente'] = (0.5, 1) if s_img is None else (s_img, 0)
    return {k: round(float(x), 4) for k, x in v.items()}, lisible


def _m2(x):
    return f"{x:,.2f} m²".replace(',', ' ')


def controles_lisibles(parcelle, doc, v, lisible, impacts):
    """Tableau affiché à l'admin : un indice par ligne, avec son influence sur la décision."""
    lignes = []

    def ligne(critere, cle, ok, declare, attendu, bloquant=True):
        lignes.append({'critere': critere, 'ok': bool(ok), 'declare': str(declare), 'attendu': str(attendu),
                       'bloquant': bloquant, 'indice': cle, 'valeur': v[cle], 'impact': impacts.get(cle, 0.0)})

    pct = lambda x: f"{x:.0%}"  # noqa: E731
    ligne("Document en vigueur", 'document_valide', v['document_valide'], '—', doc.get_statut_display())
    ligne("Numéro SU", 'sim_su', v['sim_su'] == 1, parcelle.su, f"{doc.su} (similarité {pct(v['sim_su'])})")
    if v['numero_absent']:
        ligne("Numéro du titre", 'numero_absent', False, "non renseigné", doc.numero, bloquant=False)
    else:
        ligne("Numéro du titre", 'sim_numero', v['sim_numero'] == 1, parcelle.titre_foncier,
              f"{doc.numero} (similarité {pct(v['sim_numero'])})")
    ligne("Titulaire = propriétaire du compte", 'sim_titulaire', v['sim_titulaire'] == 1, parcelle.proprietaire.nom,
          f"{doc.titulaire} (similarité {pct(v['sim_titulaire'])})")
    ligne("Lotissement", 'sim_zone', v['sim_zone'] == 1, parcelle.zone, doc.zone)
    ligne("Nature du titre", 'nature_concorde', v['nature_concorde'], parcelle.nature, doc.get_type_document_display())
    ligne("Superficie", 'ecart_superficie', v['ecart_superficie'] <= TOLERANCE_SUPERFICIE,
          _m2(lisible['superficie_declaree']), f"{_m2(lisible['superficie_inscrite'])} (écart {pct(v['ecart_superficie'])})")
    if v['gps_absent']:
        ligne("Position sur la carte", 'gps_absent', False, "non comparable", "coordonnées du registre", bloquant=False)
    else:
        ligne("Position sur la carte", 'distance_gps', lisible['distance_m'] <= DISTANCE_MAX_M,
              f"à {lisible['distance_m']:.0f} m du point du registre", f"≤ {DISTANCE_MAX_M} m")
    if not v['contour_absent']:
        ligne("Contour tracé cohérent", 'ecart_contour', v['ecart_contour'] <= TOLERANCE_CONTOUR,
              f"{lisible['aire_contour']:,.0f} m² tracés".replace(',', ' '),
              f"≈ {lisible['superficie_declaree']:,.0f} m²".replace(',', ' '), bloquant=False)
    if v['image_absente']:
        ligne("Photo du titre / scan du registre", 'image_absente', False, "comparaison impossible",
              "photo du titre + scan image au registre", bloquant=False)
    else:
        ligne("Photo du titre / scan du registre", 'sim_image', v['sim_image'] >= 0.75,
              f"ressemblance {pct(v['sim_image'])}", "≥ 75 %")
    ligne("Pièces justificatives déposées", 'nb_pieces', v['nb_pieces'] > 0,
          f"{parcelle.documents.count()} pièce(s)", "au moins 1")
    return lignes


def analyser(parcelle, admin=None):
    """Construit le rapport d'authentification (ne modifie rien)."""
    base = {'methode': 'reseau_neurones', 'date': datetime.now().isoformat(timespec='seconds'),
            'lance_par': getattr(admin, 'nom', None) or getattr(admin, 'username', None)}
    doc = trouver_document(parcelle)
    if doc is None:
        return {**base, 'resultat': 'introuvable', 'probabilite': None, 'score': 0, 'document': None, 'controles': [],
                'message': "Aucun document du registre officiel ne correspond à ce SU ou à ce numéro de titre : "
                           "le réseau ne peut pas comparer le dossier, vérification manuelle par l'administrateur."}

    v, lisible = caracteristiques(parcelle, doc)
    p = probabilite_authentique(v)
    impacts = facteurs_de_doute(v)
    controles = controles_lisibles(parcelle, doc, v, lisible, impacts)
    doutes = sorted((c for c in controles if c['impact'] >= 1), key=lambda c: -c['impact'])

    # contrôles complémentaires (hors entrées du réseau) bloquants et non satisfaits
    complementaires_ko = [c for c in controles if c['bloquant'] and not c['ok']
                          and c['indice'] not in CARACTERISTIQUES and c['indice'] != 'document_valide']

    if not v['document_valide'] or p < SEUIL_FALSIFIE:
        resultat, message = 'falsifie', "Le réseau de neurones juge le dossier probablement falsifié : rejet recommandé."
        if not v['document_valide']:
            message = "Le document du registre n'est pas en vigueur (litige ou annulé) : rejet recommandé."
    elif p >= SEUIL_AUTHENTIQUE and not complementaires_ko:
        resultat, message = 'authentique', "Le réseau de neurones juge le dossier authentique."
    elif p >= SEUIL_AUTHENTIQUE:
        resultat = 'douteux'
        message = ("Le réseau de neurones juge les informations conformes au registre, mais un contrôle "
                   "complémentaire échoue (" + ", ".join(c['critere'] for c in complementaires_ko) + ") : "
                   "examinez les pièces avant de décider.")
    else:
        resultat, message = 'douteux', "Le réseau de neurones a un doute : examinez les pièces avant de décider."
    if doutes and resultat != 'authentique':
        message += " Principaux facteurs : " + ", ".join(c['critere'] for c in doutes[:3]) + "."

    return {**base, 'resultat': resultat, 'message': message,
            'probabilite': round(p, 4), 'score': round(p * 100),
            'seuils': {'authentique': SEUIL_AUTHENTIQUE, 'falsifie': SEUIL_FALSIFIE},
            'document': {'id': doc.id, 'numero': doc.numero, 'statut': doc.statut, 'a_scan': bool(doc.scan)},
            'caracteristiques': v, 'controles': controles}


def authentifier(parcelle, admin):
    """
    Lancée par l'admin : calcule le rapport et applique la décision du réseau.
    - authentique : la parcelle en attente devient "verifiee" (verifie_par = 'ia') ;
    - douteux / falsifié / introuvable : la parcelle reste (ou repasse) "en_attente"
      si elle n'avait été validée que par l'IA ; l'admin tranche avec /verifier/.
    Une parcelle vendue, rejetée ou validée manuellement par l'admin n'est pas modifiée.
    """
    rapport = analyser(parcelle, admin)
    parcelle.rapport_verification = rapport
    champs = ['rapport_verification']
    if parcelle.statut != 'vendue':
        if rapport['resultat'] == 'authentique' and parcelle.verification == 'en_attente':
            parcelle.verification, parcelle.verifie_par, parcelle.motif_rejet = 'verifiee', 'ia', ''
            champs += ['verification', 'verifie_par', 'motif_rejet']
        elif rapport['resultat'] != 'authentique' and parcelle.verification == 'verifiee' \
                and parcelle.verifie_par in ('ia', 'auto'):
            parcelle.verification, parcelle.verifie_par = 'en_attente', ''
            champs += ['verification', 'verifie_par']
    parcelle.save(update_fields=champs)
    return rapport


def invalider_su(su):
    """
    Après un ajout / une modification du registre : AUCUNE nouvelle analyse n'est lancée
    (c'est l'admin qui la déclenche). Les rapports de ce SU deviennent périmés et une
    parcelle validée par l'IA repasse en attente pour être réauthentifiée.
    """
    from .models import Parcelle
    cible = normaliser_su(su)
    for p in Parcelle.objects.exclude(statut='vendue'):
        if normaliser_su(p.su) != cible:
            continue
        p.rapport_verification = None
        champs = ['rapport_verification']
        if p.verification == 'verifiee' and p.verifie_par in ('ia', 'auto'):
            p.verification, p.verifie_par = 'en_attente', ''
            champs += ['verification', 'verifie_par']
        p.save(update_fields=champs)
