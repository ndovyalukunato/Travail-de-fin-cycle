# ==========================================================
# ENTRAÎNEMENT DU RÉSEAU DE NEURONES D'AUTHENTIFICATION DES DOCUMENTS
#   python ia/entrainer_authentification.py
#
# Aucune base publique de titres fonciers falsifiés n'existe pour Goma : le jeu
# d'apprentissage est donc SIMULÉ à partir du fonctionnement réel du registre :
#   - dossiers authentiques : informations conformes au registre, avec les petites
#     variations rencontrées en pratique (fautes de frappe dans le SU, nom écrit
#     partiellement, superficie arrondie, GPS imprécis, photo prise au téléphone...) ;
#   - dossiers falsifiés : 1 à 3 falsifications typiques (titulaire changé,
#     superficie gonflée, faux numéro de titre, document en litige, parcelle située
#     ailleurs, photo d'un autre document, etc.).
# Le réseau est comparé, sur le même jeu de test, à une régression logistique et à
# l'ancienne vérification par règles fixes (concordance exacte de chaque champ).
# Fichiers produits :
#   - ia/modele_authentification.pkl
#   - ia/metriques_authentification.json
# ==========================================================
import json
import sys
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

DOSSIER_IA = Path(__file__).resolve().parent
sys.path.insert(0, str(DOSSIER_IA.parent))
from ia.authentification import CARACTERISTIQUES  # noqa: E402  (même liste qu'en production)

NB_DOSSIERS = 10_000
GRAINE = 42
FALSIFICATIONS = ['titulaire', 'superficie', 'zone', 'numero', 'su', 'statut', 'position', 'image',
                  'nature', 'contour']


def dossier_authentique(rng):
    """Un dossier réellement conforme au registre, avec des imperfections normales."""
    numero_absent = rng.random() < 0.3
    gps_absent = rng.random() < 0.3
    contour_absent = rng.random() < 0.5
    image_absente = rng.random() < 0.35
    return {
        'sim_su': 1.0 if rng.random() < 0.95 else rng.uniform(0.8, 0.95),
        'sim_numero': 0.5 if numero_absent else (1.0 if rng.random() < 0.85 else rng.uniform(0.75, 0.95)),
        'numero_absent': int(numero_absent),
        'sim_titulaire': 1.0 if rng.random() < 0.8 else rng.uniform(0.65, 0.95),
        'sim_zone': 1.0 if rng.random() < 0.95 else rng.uniform(0.75, 0.95),
        'nature_concorde': int(rng.random() < 0.95),
        'ecart_superficie': min(abs(rng.normal(0, 0.01)) + (rng.uniform(0.02, 0.05) if rng.random() < 0.1 else 0), 1),
        'distance_gps': 0.0 if gps_absent else min(rng.exponential(0.04), 1),
        'gps_absent': int(gps_absent),
        'ecart_contour': 0.0 if contour_absent else min(abs(rng.normal(0, 0.08)), 1),
        'contour_absent': int(contour_absent),
        'document_valide': int(rng.random() < 0.99),
        'nb_pieces': min(rng.integers(1, 6), 5) / 5,
        'sim_image': 0.5 if image_absente else rng.beta(9, 2),
        'image_absente': int(image_absente),
    }


def falsifier(d, rng):
    """Applique 1 à 3 falsifications typiques à un dossier."""
    for f in rng.choice(FALSIFICATIONS, size=rng.integers(1, 4), replace=False):
        if f == 'titulaire':
            d['sim_titulaire'] = rng.uniform(0, 0.55)
        elif f == 'superficie':
            d['ecart_superficie'] = rng.uniform(0.08, 1)
        elif f == 'zone':
            d['sim_zone'] = rng.uniform(0, 0.6)
        elif f == 'numero':
            d['numero_absent'], d['sim_numero'] = 0, rng.uniform(0.2, 0.75)
        elif f == 'su':
            d['sim_su'] = rng.uniform(0.3, 0.8)
        elif f == 'statut':
            d['document_valide'] = 0
        elif f == 'position':
            d['gps_absent'], d['distance_gps'] = 0, rng.uniform(0.3, 1)
        elif f == 'image':
            d['image_absente'], d['sim_image'] = 0, rng.beta(3, 4)  # photo d'un autre document
        elif f == 'nature':
            d['nature_concorde'] = 0
        elif f == 'contour':
            d['contour_absent'], d['ecart_contour'] = 0, rng.uniform(0.3, 1)
    return d


def generer_dossiers(n, graine=GRAINE):
    rng = np.random.default_rng(graine)
    lignes, etiquettes = [], []
    for i in range(n):
        authentique = i % 2 == 0  # classes équilibrées
        d = dossier_authentique(rng)
        if not authentique:
            d = falsifier(d, rng)
        lignes.append(d)
        etiquettes.append(int(authentique))
    y = np.array(etiquettes)
    bruit = rng.random(n) < 0.01  # 1 % d'erreurs d'étiquetage (cas réels ambigus)
    y[bruit] = 1 - y[bruit]
    return pd.DataFrame(lignes, columns=CARACTERISTIQUES), y


def construire_reseau():
    """Standardisation des entrées puis perceptron multicouche 15 -> 32 -> 16 -> 1 (sigmoïde)."""
    return Pipeline([
        ('echelle', StandardScaler()),
        ('reseau', MLPClassifier(
            hidden_layer_sizes=(32, 16), activation='relu', solver='adam', alpha=1e-3,
            learning_rate_init=0.005, max_iter=2000, early_stopping=True, validation_fraction=0.1,
            n_iter_no_change=30, random_state=GRAINE,
        )),
    ])


def regles_fixes(X):
    """Ancienne vérification : authentique seulement si chaque champ concorde EXACTEMENT."""
    return (
        (X['document_valide'] == 1) & (X['sim_su'] == 1) & ((X['numero_absent'] == 1) | (X['sim_numero'] == 1))
        & (X['sim_titulaire'] == 1) & (X['sim_zone'] == 1) & (X['nature_concorde'] == 1)
        & (X['ecart_superficie'] <= 0.02) & ((X['gps_absent'] == 1) | (X['distance_gps'] <= 0.15))
    ).astype(int).to_numpy()


def mesurer(y_vrai, y_pred, proba=None):
    tn, fp, fn, tp = confusion_matrix(y_vrai, y_pred, labels=[0, 1]).ravel()
    m = {
        'exactitude': round(float(accuracy_score(y_vrai, y_pred)), 4),
        'precision': round(float(precision_score(y_vrai, y_pred)), 4),
        'rappel': round(float(recall_score(y_vrai, y_pred)), 4),
        'f1': round(float(f1_score(y_vrai, y_pred)), 4),
        # faux authentiques = dossiers falsifiés acceptés (l'erreur la plus grave)
        'matrice_confusion': {'vrais_falsifies': int(tn), 'faux_authentiques': int(fp),
                              'faux_falsifies': int(fn), 'vrais_authentiques': int(tp)},
    }
    if proba is not None:
        m['auc'] = round(float(roc_auc_score(y_vrai, proba)), 4)
    return m


def main():
    X, y = generer_dossiers(NB_DOSSIERS)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=GRAINE, stratify=y)
    print(f"Dossiers simulés : {len(X_train)} d'entraînement, {len(X_test)} de test")

    reseau = construire_reseau().fit(X_train, y_train)
    mlp = reseau.named_steps['reseau']
    print(f"Réseau entraîné en {mlp.n_iter_} époques")
    logistique = Pipeline([('echelle', StandardScaler()), ('lr', LogisticRegression(max_iter=1000))]).fit(X_train, y_train)

    resultats = {
        'reseau_neurones': mesurer(y_test, reseau.predict(X_test), reseau.predict_proba(X_test)[:, 1]),
        'regression_logistique': mesurer(y_test, logistique.predict(X_test), logistique.predict_proba(X_test)[:, 1]),
        'regles_fixes': mesurer(y_test, regles_fixes(X_test)),
    }
    for nom, m in resultats.items():
        mc = m['matrice_confusion']
        print(f"  {nom:22s} exactitude={m['exactitude']:.3f} précision={m['precision']:.3f} "
              f"rappel={m['rappel']:.3f} F1={m['f1']:.3f} AUC={m.get('auc', float('nan')):.3f} "
              f"| falsifiés acceptés={mc['faux_authentiques']} authentiques refusés={mc['faux_falsifies']}")

    # Mise en production : réentraînement sur tous les dossiers simulés
    final = construire_reseau().fit(X, y)
    joblib.dump(final, DOSSIER_IA / 'modele_authentification.pkl')
    with open(DOSSIER_IA / 'metriques_authentification.json', 'w', encoding='utf-8') as f:
        json.dump({
            'date': date.today().isoformat(),
            'donnees': {'nb_dossiers': NB_DOSSIERS, 'entrainement': len(X_train), 'test': len(X_test),
                        'origine': 'simulées (authentiques / falsifiés)'},
            'architecture_reseau': {'entrees': len(CARACTERISTIQUES), 'couches_cachees': list(mlp.hidden_layer_sizes),
                                    'activation': mlp.activation, 'sortie': 'sigmoïde (probabilité)',
                                    'optimiseur': mlp.solver, 'epoques': int(mlp.n_iter_)},
            'caracteristiques': CARACTERISTIQUES,
            'modeles': resultats,
        }, f, ensure_ascii=False, indent=2)
    print("Enregistré : ia/modele_authentification.pkl et ia/metriques_authentification.json")


if __name__ == '__main__':
    main()
