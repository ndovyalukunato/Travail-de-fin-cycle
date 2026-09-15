import os
import joblib

# ============================================
# CHARGEMENT DES MODÈLES ENTRAÎNÉS (.pkl)
# ============================================
# Les 4 fichiers doivent se trouver dans le même dossier que ce fichier
# (backend/foncierIA/ia/), à côté de modele.py :
#   - modele_lr.pkl
#   - modele_rf.pkl
#   - modele_fraude.pkl
#   - label_encoder.pkl

DOSSIER_MODELES = os.path.dirname(os.path.abspath(__file__))

modele_lr = joblib.load(os.path.join(DOSSIER_MODELES, "modele_lr.pkl"))
modele_rf = joblib.load(os.path.join(DOSSIER_MODELES, "modele_rf.pkl"))
modele_fraude = joblib.load(os.path.join(DOSSIER_MODELES, "modele_fraude.pkl"))
le = joblib.load(os.path.join(DOSSIER_MODELES, "label_encoder.pkl"))

# Zones connues par l'encodeur (les lotissements de Goma utilisés à l'entraînement)
ZONES_CONNUES = list(le.classes_)


# ============================================
# FONCTIONS
# ============================================
def estimer_prix(superficie, zone, infrastructure):
    """
    Estime le prix d'une parcelle par Régression Linéaire et Random Forest.
    'zone' doit être un des lotissements connus (voir ZONES_CONNUES),
    insensible à la casse (converti en minuscule automatiquement).
    """
    zone_normalisee = zone.strip().lower()

    if zone_normalisee not in ZONES_CONNUES:
        raise ValueError(
            f"Zone inconnue : '{zone}'. Zones valides : {ZONES_CONNUES}"
        )

    zone_enc = le.transform([zone_normalisee])[0]
    entree = [[superficie, zone_enc, infrastructure]]

    prix_lr = modele_lr.predict(entree)[0]
    prix_rf = modele_rf.predict(entree)[0]

    return {
        'regression_lineaire': round(float(prix_lr), 2),
        'random_forest': round(float(prix_rf), 2),
        'moyenne': round(float((prix_lr + prix_rf) / 2), 2)
    }


def detecter_fraude(superficie, zone, infrastructure, prix):
    """
    Détecte si une transaction est potentiellement frauduleuse
    en utilisant l'Isolation Forest entraîné sur la mercuriale foncière.

    IMPORTANT : ce modèle a été entraîné sur 4 variables (superficie, zone,
    infrastructure ET prix), car une anomalie de prix par rapport à la
    superficie/zone est justement le signal recherché. Il faut donc fournir
    le prix (réel ou estimé) pour que la détection soit pertinente.
    """
    zone_normalisee = zone.strip().lower()

    if zone_normalisee not in ZONES_CONNUES:
        raise ValueError(
            f"Zone inconnue : '{zone}'. Zones valides : {ZONES_CONNUES}"
        )

    zone_enc = le.transform([zone_normalisee])[0]
    entree = [[superficie, zone_enc, infrastructure, prix]]

    resultat = modele_fraude.predict(entree)[0]

    return {
        'est_fraude': resultat == -1,
        'message': 'Transaction suspecte !' if resultat == -1 else 'Transaction normale'
    }