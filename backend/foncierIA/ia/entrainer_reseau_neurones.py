# ==========================================================
# ENTRAÎNEMENT DU RÉSEAU DE NEURONES (Perceptron multicouche)
#   python ia/entrainer_reseau_neurones.py
# Lit backend/database/DATA_final_mercuriale.xlsx, applique le même
# nettoyage et le même découpage train/test (80/20, random_state=42) que
# le notebook foncierai_training.ipynb, entraîne le réseau, le compare à
# la Régression Linéaire et au Random Forest, puis enregistre :
#   - ia/modele_rn.pkl       : le réseau de neurones (pipeline complet)
#   - ia/metriques.json      : R², MAE et RMSE des trois modèles
# ==========================================================
import json
from datetime import date
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler

DOSSIER_IA = Path(__file__).resolve().parent
FICHIER_DONNEES = DOSSIER_IA.parent.parent / 'database' / 'DATA_final_mercuriale.xlsx'
COLONNES = ['superficie', 'zone_encoded', 'infrastructure']  # mêmes entrées que LR et RF


def charger_donnees():
    """Chargement et nettoyage identiques au notebook (sections 1 à 3)."""
    df = pd.read_excel(FICHIER_DONNEES, sheet_name='Feuil1')
    df = df.dropna(subset=['SUPERFICIE_M2', 'LOTISSEMENT', 'PRIX-VENTE']).copy()
    df['LOTISSEMENT'] = df['LOTISSEMENT'].str.strip().str.lower()
    df['infrastructure'] = df['TYPE-DOCUMENTS'].str.contains('certificat', case=False, na=False).astype(int)
    le = joblib.load(DOSSIER_IA / 'label_encoder.pkl')  # même encodeur de zones que l'application
    df['zone_encoded'] = le.transform(df['LOTISSEMENT'])
    X = df[['SUPERFICIE_M2', 'zone_encoded', 'infrastructure']].rename(columns={'SUPERFICIE_M2': 'superficie'})
    y = df['PRIX-VENTE'].astype(float)
    return train_test_split(X, y, test_size=0.2, random_state=42), le


def construire_reseau(nb_zones):
    """
    Pipeline du réseau de neurones :
      1. Préparation des entrées
         - superficie : logarithme puis standardisation (moyenne 0, écart-type 1)
         - zone       : encodage « one-hot » (un neurone d'entrée par lotissement)
         - infrastructure : 0/1, gardée telle quelle
      2. Perceptron multicouche : 2 couches cachées (32 puis 16 neurones, activation ReLU),
         optimiseur Adam, régularisation L2 (alpha), arrêt anticipé (early stopping)
      3. Cible transformée : le réseau apprend log(prix) puis on revient au prix par exp
         (les prix vont de 7 500 $ à 2 millions $ : le logarithme stabilise l'apprentissage)
    """
    preparation = ColumnTransformer([
        ('superficie', Pipeline([('log', FunctionTransformer(np.log1p)), ('echelle', StandardScaler())]), ['superficie']),
        ('zone', OneHotEncoder(categories=[list(range(nb_zones))], handle_unknown='ignore'), ['zone_encoded']),
        ('infrastructure', 'passthrough', ['infrastructure']),
    ])
    reseau = MLPRegressor(
        hidden_layer_sizes=(32, 16),  # architecture : entrée(8) -> 32 -> 16 -> sortie(1)
        activation='relu',
        solver='adam',
        alpha=1e-3,  # pénalité L2 contre le sur-apprentissage
        learning_rate_init=0.01,
        max_iter=3000,
        early_stopping=True,  # 10 % du train sert à arrêter l'entraînement au bon moment
        validation_fraction=0.1,
        n_iter_no_change=50,
        random_state=42,
    )
    return TransformedTargetRegressor(
        regressor=Pipeline([('preparation', preparation), ('reseau', reseau)]),
        func=np.log1p, inverse_func=np.expm1,
    )


def metriques(y_vrai, y_pred):
    return {
        'r2': round(float(r2_score(y_vrai, y_pred)), 4),
        'mae': round(float(mean_absolute_error(y_vrai, y_pred)), 2),
        'rmse': round(float(np.sqrt(mean_squared_error(y_vrai, y_pred))), 2),
    }


def main():
    (X_train, X_test, y_train, y_test), le = charger_donnees()
    print(f"Données : {len(X_train)} parcelles d'entraînement, {len(X_test)} de test")

    modele_rn = construire_reseau(len(le.classes_))
    modele_rn.fit(X_train, y_train)
    mlp = modele_rn.regressor_.named_steps['reseau']
    print(f"Réseau entraîné en {mlp.n_iter_} époques")

    # Comparaison sur le MÊME jeu de test que les modèles existants
    modele_lr = joblib.load(DOSSIER_IA / 'modele_lr.pkl')
    modele_rf = joblib.load(DOSSIER_IA / 'modele_rf.pkl')
    pred = {
        'regression_lineaire': modele_lr.predict(X_test),
        'random_forest': modele_rf.predict(X_test),
        'reseau_neurones': modele_rn.predict(X_test),
    }
    pred['moyenne_3_modeles'] = (pred['regression_lineaire'] + pred['random_forest'] + pred['reseau_neurones']) / 3
    resultats = {nom: metriques(y_test, p) for nom, p in pred.items()}
    for nom, m in resultats.items():
        print(f"  {nom:22s} R² = {m['r2']:.3f}   MAE = {m['mae']:>10,.0f} $   RMSE = {m['rmse']:>10,.0f} $")

    # Le réseau est réentraîné sur TOUTES les données pour la mise en production
    modele_final = construire_reseau(len(le.classes_))
    modele_final.fit(pd.concat([X_train, X_test]), pd.concat([y_train, y_test]))
    joblib.dump(modele_final, DOSSIER_IA / 'modele_rn.pkl')

    with open(DOSSIER_IA / 'metriques.json', 'w', encoding='utf-8') as f:
        json.dump({
            'date': date.today().isoformat(),
            'jeu_de_test': len(X_test),
            'architecture_reseau': {
                'entrees': int(modele_rn.regressor_.named_steps['preparation'].transform(X_test.head(1)).shape[1]),
                'couches_cachees': list(mlp.hidden_layer_sizes),
                'activation': mlp.activation,
                'optimiseur': mlp.solver,
                'epoques': int(mlp.n_iter_),
            },
            'modeles': resultats,
        }, f, ensure_ascii=False, indent=2)
    print("Enregistré : ia/modele_rn.pkl et ia/metriques.json")


if __name__ == '__main__':
    main()
