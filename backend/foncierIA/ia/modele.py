import os  # construction des chemins vers les fichiers .pkl
import joblib  # chargement des modèles scikit-learn sauvegardés
import pandas as pd  # tableaux de données passés aux modèles

# ============================================
# CHARGEMENT DES MODÈLES ENTRAÎNÉS (.pkl)
# ============================================
# Modèles produits par backend/database/foncierai_training.ipynb :
#   - modele_lr.pkl       : Régression Linéaire   (superficie, zone_encoded, infrastructure)
#   - modele_rf.pkl       : Random Forest         (superficie, zone_encoded, infrastructure)
#   - modele_fraude.pkl   : Isolation Forest      (SUPERFICIE_M2, zone_encoded, infrastructure, PRIX-VENTE)
#   - label_encoder.pkl   : encodeur des lotissements

# Dossier où se trouve ce fichier (et les fichiers .pkl)
DOSSIER_MODELES = os.path.dirname(os.path.abspath(__file__))

# Les modèles sont chargés UNE SEULE FOIS, au démarrage du serveur Django
modele_lr = joblib.load(os.path.join(DOSSIER_MODELES, "modele_lr.pkl"))  # Régression Linéaire
modele_rf = joblib.load(os.path.join(DOSSIER_MODELES, "modele_rf.pkl"))  # Random Forest
modele_fraude = joblib.load(os.path.join(DOSSIER_MODELES, "modele_fraude.pkl"))  # Isolation Forest
le = joblib.load(os.path.join(DOSSIER_MODELES, "label_encoder.pkl"))  # transforme un nom de zone en nombre

# Zones connues par l'encodeur (les lotissements de Goma utilisés à l'entraînement)
ZONES_CONNUES = [str(z) for z in le.classes_]

# Mêmes noms de colonnes qu'à l'entraînement (évite les avertissements sklearn)
COLONNES_PRIX = ["superficie", "zone_encoded", "infrastructure"]  # entrées des modèles de prix
COLONNES_FRAUDE = ["SUPERFICIE_M2", "zone_encoded", "infrastructure", "PRIX-VENTE"]  # entrées du modèle de fraude


# ============================================
# CONVERSIONS PARCELLE -> ENTRÉES DU MODÈLE
# ============================================
def superficie_en_m2(ha=0, ares=0, ca=0, pourcent=0):
    """
    Convertit la superficie cadastrale (Ha / ares / centiares / % de centiare)
    en m², l'unité utilisée pour l'entraînement (colonne SUPERFICIE_M2).
    1 ha = 10 000 m², 1 are = 100 m², 1 ca = 1 m².
    """
    # "or 0" remplace une valeur vide (None) par 0 ; le pourcentage de centiare est divisé par 100
    return (ha or 0) * 10000 + (ares or 0) * 100 + (ca or 0) + (pourcent or 0) / 100


def infrastructure_depuis_nature(nature):
    """
    Même approximation que dans le notebook : une parcelle couverte par un
    certificat (d'enregistrement) est considérée comme mieux équipée.
    """
    # 1 = zone équipée (certificat), 0 = autre document
    return 1 if nature and "certificat" in nature.lower() else 0


# Transforme un nom de lotissement (ex. "Mapendo") en nombre compréhensible par les modèles
def _encoder_zone(zone):
    zone_normalisee = (zone or "").strip().lower()  # minuscules, sans espaces autour
    # Le modèle ne connaît que les lotissements vus pendant l'entraînement
    if zone_normalisee not in ZONES_CONNUES:
        raise ValueError(
            f"Zone inconnue : '{zone}'. Zones valides : {ZONES_CONNUES}"
        )
    return int(le.transform([zone_normalisee])[0])  # numéro attribué à la zone par l'encodeur


# ============================================
# FONCTIONS
# ============================================
def estimer_prix(superficie, zone, infrastructure):
    """
    Estime le prix d'une parcelle par Régression Linéaire et Random Forest.
    'superficie' est en m², 'zone' doit être un des lotissements connus
    (voir ZONES_CONNUES), insensible à la casse.
    """
    # Tableau d'une seule ligne avec les mêmes colonnes qu'à l'entraînement
    entree = pd.DataFrame(
        [[float(superficie), _encoder_zone(zone), int(infrastructure)]],
        columns=COLONNES_PRIX,
    )

    prix_lr = float(modele_lr.predict(entree)[0])  # prédiction de la Régression Linéaire
    prix_rf = float(modele_rf.predict(entree)[0])  # prédiction du Random Forest

    # Les deux prédictions et leur moyenne (le prix retenu), arrondies au centime
    return {
        'regression_lineaire': round(prix_lr, 2),
        'random_forest': round(prix_rf, 2),
        'moyenne': round((prix_lr + prix_rf) / 2, 2),
    }


def detecter_fraude(superficie, zone, infrastructure, prix):
    """
    Détecte si un prix est anormal pour une parcelle (Isolation Forest).
    Le modèle a été entraîné sur 4 variables (superficie, zone,
    infrastructure ET prix) : une anomalie de prix par rapport à la
    superficie/zone est justement le signal recherché.
    """
    # Tableau d'une seule ligne avec les 4 colonnes utilisées à l'entraînement
    entree = pd.DataFrame(
        [[float(superficie), _encoder_zone(zone), int(infrastructure), float(prix)]],
        columns=COLONNES_FRAUDE,
    )

    # predict renvoie -1 pour une anomalie (suspect) et 1 pour une valeur normale
    resultat = int(modele_fraude.predict(entree)[0])
    # decision_function donne un score : plus il est négatif, plus la valeur est anormale
    score = float(modele_fraude.decision_function(entree)[0])

    return {
        'est_fraude': resultat == -1,  # True si le prix est jugé anormal
        'score': round(score, 4),  # négatif = anomalie, plus il est bas plus c'est suspect
        'message': 'Transaction suspecte !' if resultat == -1 else 'Transaction normale',  # texte affiché
    }


def analyser_parcelle(parcelle, prix=None):
    """
    Estimation + détection de fraude pour une parcelle enregistrée.
    Si 'prix' n'est pas fourni, on contrôle le prix réel de la parcelle.
    """
    # 1) Superficie de la parcelle convertie en m²
    superficie = superficie_en_m2(
        parcelle.superficie_ha, parcelle.superficie_ares,
        parcelle.superficie_ca, parcelle.superficie_pourcent,
    )
    # 2) Variable "infrastructure" déduite de la nature du titre
    infrastructure = infrastructure_depuis_nature(parcelle.nature)
    # 3) Prix à contrôler : celui fourni (ex. montant d'une offre) ou, à défaut, le prix réel déclaré
    prix_a_controler = float(prix if prix is not None else parcelle.prix_reel)

    estimation = estimer_prix(superficie, parcelle.zone, infrastructure)  # prix prédits
    fraude = detecter_fraude(superficie, parcelle.zone, infrastructure, prix_a_controler)  # prix anormal ?

    # Résultat complet renvoyé au frontend
    return {
        'superficie_m2': superficie,
        'infrastructure': infrastructure,
        'prix_controle': prix_a_controler,
        'estimation': estimation,
        'fraude': fraude,
    }
