# ==========================================================
# AUTHENTIFICATION DES DOCUMENTS DE PARCELLE PAR RÉSEAU DE NEURONES
# Modèle produit par ia/entrainer_authentification.py :
#   - modele_authentification.pkl      : perceptron multicouche (MLPClassifier 32-16)
#   - metriques_authentification.json  : performances sur le jeu de test
# Le réseau reçoit 15 indices calculés en comparant le dossier déposé par le
# vendeur au registre officiel (voir parcelles/verification.py) et renvoie la
# probabilité que le dossier soit AUTHENTIQUE (entre 0 et 1).
# L'analyse n'est jamais lancée automatiquement : c'est l'administrateur qui
# la déclenche (bouton « Lancer l'authentification IA »).
# ==========================================================
import json
import os

import joblib
import pandas as pd

DOSSIER_IA = os.path.dirname(os.path.abspath(__file__))
FICHIER_MODELE = os.path.join(DOSSIER_IA, "modele_authentification.pkl")
FICHIER_METRIQUES = os.path.join(DOSSIER_IA, "metriques_authentification.json")

# Entrées du réseau (même ordre à l'entraînement et en production).
# Les similarités valent 1 quand tout concorde ; les écarts valent 0 quand tout concorde.
CARACTERISTIQUES = [
    "sim_su",            # similarité du numéro SU déclaré / inscrit au registre (0 à 1)
    "sim_numero",        # similarité du numéro du titre (volume, folio...)
    "numero_absent",     # 1 si le vendeur n'a pas indiqué de numéro de titre
    "sim_titulaire",     # similarité du nom du titulaire et du propriétaire du compte
    "sim_zone",          # similarité du lotissement
    "nature_concorde",   # 1 si la nature du titre correspond (certificat, location...)
    "ecart_superficie",  # écart relatif de superficie (0 = identique, plafonné à 1)
    "distance_gps",      # distance au point du registre, en km (plafonnée à 1)
    "gps_absent",        # 1 si la parcelle n'est pas localisée ou le registre sans coordonnées
    "ecart_contour",     # écart relatif entre l'aire du contour tracé et la superficie
    "contour_absent",    # 1 si aucun contour n'a été tracé
    "document_valide",   # 1 si le document du registre est en vigueur (ni litige, ni annulé)
    "nb_pieces",         # nombre de pièces déposées / 5 (plafonné à 1)
    "sim_image",         # ressemblance visuelle photo déposée / scan authentique (0 à 1)
    "image_absente",     # 1 si la comparaison d'images est impossible
]

# Valeurs d'un dossier parfaitement conforme : servent à expliquer la décision
# (de combien la probabilité monterait si cet indice était parfait ?)
VALEURS_IDEALES = {
    "sim_su": 1, "sim_numero": 1, "numero_absent": 0, "sim_titulaire": 1, "sim_zone": 1,
    "nature_concorde": 1, "ecart_superficie": 0, "distance_gps": 0, "gps_absent": 0,
    "ecart_contour": 0, "contour_absent": 0, "document_valide": 1, "nb_pieces": 0.6,
    "sim_image": 1, "image_absente": 0,
}

# Indices liés : une valeur et son indicateur d'absence sont toujours changés ensemble
GROUPES = [
    ("sim_su",), ("sim_numero", "numero_absent"), ("sim_titulaire",), ("sim_zone",), ("nature_concorde",),
    ("ecart_superficie",), ("distance_gps", "gps_absent"), ("ecart_contour", "contour_absent"),
    ("document_valide",), ("sim_image", "image_absente"),
]

_modele = None  # chargé au premier usage (le serveur démarre même si le modèle n'est pas encore entraîné)


def charger_modele():
    global _modele
    if _modele is None:
        if not os.path.exists(FICHIER_MODELE):
            raise FileNotFoundError(
                "Réseau d'authentification absent : lancez « python ia/entrainer_authentification.py »."
            )
        _modele = joblib.load(FICHIER_MODELE)
    return _modele


def recharger():
    """Oublie le modèle en mémoire : la version réentraînée sera relue au prochain usage."""
    global _modele
    _modele = None


def lire_metriques():
    try:
        with open(FICHIER_METRIQUES, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None


def _tableau(vecteurs):
    return pd.DataFrame([[float(v[c]) for c in CARACTERISTIQUES] for v in vecteurs], columns=CARACTERISTIQUES)


def probabilite_authentique(vecteur):
    """Probabilité (0 à 1) que le dossier décrit par 'vecteur' soit authentique."""
    return float(charger_modele().predict_proba(_tableau([vecteur]))[0][1])


def facteurs_de_doute(vecteur):
    """
    Explication de la décision : on part d'un dossier parfait (VALEURS_IDEALES) et on y
    remplace UN SEUL indice par sa valeur réelle. La baisse de probabilité obtenue mesure
    à quel point cet indice, à lui seul, rend le dossier suspect (même quand plusieurs
    falsifications se cumulent). Renvoie {indice: baisse en points de %}.
    """
    variantes, noms = [dict(VALEURS_IDEALES)], []
    for groupe in GROUPES:
        if any(abs(float(vecteur[c]) - VALEURS_IDEALES[c]) > 1e-9 for c in groupe):
            variantes.append({**VALEURS_IDEALES, **{c: float(vecteur[c]) for c in groupe}})
            # l'indice affiché est celui qui porte la valeur (ex. 'numero_absent' si le numéro manque)
            absent = next((c for c in groupe if c.endswith("_absent") or c == "image_absente"), None)
            noms.append(absent if absent and vecteur[absent] else groupe[0])
    if not noms:
        return {}
    probas = charger_modele().predict_proba(_tableau(variantes))[:, 1]
    reference = float(probas[0])
    return {n: round(max(0.0, reference - float(p)) * 100, 1) for n, p in zip(noms, probas[1:])}
