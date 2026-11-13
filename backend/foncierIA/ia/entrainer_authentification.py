# ==========================================================
# ENTRAÎNEMENT DU RÉSEAU DE NEURONES D'AUTHENTIFICATION DES DOCUMENTS
#   python ia/entrainer_authentification.py
#
# Données : les 510 enregistrements fonciers RÉELS de Goma publiés sur Kaggle
# (compte ndovyalukunatojosue) et copiés dans backend/database/DATA_final_mercuriale.xlsx
# (feuille « Feuil1 » : NOM, SU, LOTISSEMENT, SUPERFICIE, TYPE-DOCUMENTS...).
# AUCUNE DONNÉE SIMULÉE : aucune valeur n'est inventée ni tirée au hasard.
#   - chaque enregistrement joue le rôle d'une fiche du registre officiel ;
#   - dossier CONFORME : le vendeur déclare exactement ce qui est inscrit sur sa fiche ;
#   - dossier INCOHÉRENT : le dossier cite le SU d'une fiche mais reprend le titulaire,
#     le lotissement, la superficie ou la nature du titre d'une AUTRE fiche réelle
#     (usurpation d'identité, parcelle « déplacée », superficie d'un autre terrain...) ;
#   - doubles attributions : le fichier contient des SU inscrits au nom de plusieurs
#     personnes ; chaque fiche confrontée à l'autre fiche du même SU est incohérente.
# Les indices (entrées du réseau) sont calculés avec EXACTEMENT les mêmes fonctions
# qu'en production (parcelles/verification.py).
# Le découpage entraînement / test se fait par fiche (80 % / 20 %) : aucune fiche du
# test n'a été vue, même sous une autre forme, pendant l'entraînement.
# Le réseau est comparé, sur le même jeu de test, à une régression logistique et à
# l'ancienne vérification par règles fixes (concordance exacte de chaque champ).
# Fichiers produits :
#   - ia/modele_authentification.pkl
#   - ia/metriques_authentification.json
# ==========================================================
import json
import os
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
FICHIER_DONNEES = DOSSIER_IA.parent.parent / 'database' / 'DATA_final_mercuriale.xlsx'
SOURCE = "Kaggle (compte ndovyalukunatojosue) : DATA_final_mercuriale.xlsx, 510 enregistrements fonciers réels de Goma"
sys.path.insert(0, str(DOSSIER_IA.parent))
if 'DJANGO_SETTINGS_MODULE' not in os.environ:  # lancé en ligne de commande
    os.environ['DJANGO_SETTINGS_MODULE'] = 'foncierIA.settings'
    import django
    django.setup()

from ia.authentification import CARACTERISTIQUES  # noqa: E402  (même liste qu'en production)
from parcelles.verification import normaliser, normaliser_su, similarite, similarite_noms  # noqa: E402

GRAINE = 42  # fixe le découpage et le choix de la fiche « donneuse » : résultats reproductibles
CHAMPS = ['titulaire', 'zone', 'superficie', 'nature', 'su']
# TYPE-DOCUMENTS du fichier -> mot attendu dans la nature déclarée (comme mots_type en production)
MOT_NATURE = {'certificat_enregistrement': 'certificat', 'certificat_enregistrement_ordinaire': 'certificat',
              'contrat_location': 'location'}


def charger_fiches():
    """Les 510 enregistrements réels : une ligne = une fiche du registre."""
    df = pd.read_excel(FICHIER_DONNEES, sheet_name='Feuil1')
    fiches = pd.DataFrame({
        'titulaire': df['NOM'].astype(str).str.strip(),
        'su': df['SU'].astype(str).str.strip(),
        'zone': df['LOTISSEMENT'].astype(str).str.strip().str.lower(),
        'superficie': df['SUPERFICIE_M2'].astype(float),
        'nature': df['TYPE-DOCUMENTS'].astype(str).str.strip(),
    })
    return fiches.reset_index(drop=True)


def indices(declare, fiche):
    """Entrées du réseau : dossier déclaré comparé à la fiche du registre (fonctions de production)."""
    mot = MOT_NATURE.get(fiche['nature'])
    inscrite = fiche['superficie']
    return {
        'sim_su': similarite(normaliser_su(declare['su']), normaliser_su(fiche['su'])),
        'sim_titulaire': similarite_noms(fiche['titulaire'], declare['titulaire']),
        'sim_zone': similarite(normaliser(declare['zone']), normaliser(fiche['zone'])),
        'nature_concorde': int(mot is None or mot in normaliser(declare['nature'])),
        'ecart_superficie': min(abs(declare['superficie'] - inscrite) / inscrite, 1) if inscrite else 1,
    }


def construire_dossiers(fiches, rng):
    """Pour chaque fiche : 1 dossier conforme + 1 dossier incohérent (valeurs d'une autre fiche réelle),
    plus les confrontations entre fiches réelles portant le même SU (doubles attributions)."""
    lignes, etiquettes = [], []
    n = len(fiches)
    for i in range(n):
        fiche = fiches.iloc[i].to_dict()
        lignes.append(indices(fiche, fiche))
        etiquettes.append(1)
        # dossier incohérent : 1 à 3 champs repris d'une autre fiche réelle (qui diffère sur ces champs)
        champs = rng.choice(CHAMPS, size=rng.integers(1, 4), replace=False)
        declare = dict(fiche)
        for c in champs:
            autres = fiches.index[(fiches[c] != fiche[c]).to_numpy()]
            declare[c] = fiches.at[int(rng.choice(autres)), c]
        lignes.append(indices(declare, fiche))
        etiquettes.append(0)
    for su, groupe in fiches.groupby('su'):
        for a in groupe.index:
            for b in groupe.index:
                if a != b and (fiches.at[a, 'titulaire'] != fiches.at[b, 'titulaire']):
                    lignes.append(indices(fiches.iloc[a].to_dict(), fiches.iloc[b].to_dict()))
                    etiquettes.append(0)
    return pd.DataFrame(lignes, columns=CARACTERISTIQUES), np.array(etiquettes, dtype=int)


def jeux_entrainement_test():
    """Découpage 80/20 PAR FICHE, puis construction des dossiers de chaque partie."""
    fiches = charger_fiches()
    # un SU présent plusieurs fois reste entier dans la même partie
    sus = fiches['su'].unique()
    su_train, su_test = train_test_split(sus, test_size=0.2, random_state=GRAINE)
    rng = np.random.default_rng(GRAINE)
    f_train = fiches[fiches['su'].isin(su_train)].reset_index(drop=True)
    f_test = fiches[fiches['su'].isin(su_test)].reset_index(drop=True)
    X_train, y_train = construire_dossiers(f_train, rng)
    X_test, y_test = construire_dossiers(f_test, rng)
    X_tout, y_tout = construire_dossiers(fiches, np.random.default_rng(GRAINE))
    return fiches, f_train, f_test, (X_train, y_train), (X_test, y_test), (X_tout, y_tout)


def construire_reseau():
    """Standardisation des entrées puis perceptron multicouche 5 -> 32 -> 16 -> 1 (sigmoïde)."""
    return Pipeline([
        ('echelle', StandardScaler()),
        ('reseau', MLPClassifier(
            hidden_layer_sizes=(32, 16), activation='relu', solver='adam', alpha=1e-3,
            learning_rate_init=0.005, max_iter=2000, random_state=GRAINE,
            # pas d'arrêt anticipé : avec ~860 dossiers, en retirer 10 % pour la validation
            # arrêtait l'apprentissage trop tôt (34 époques, 3 dossiers incohérents acceptés)
        )),
    ])


def regles_fixes(X):
    """Ancienne vérification : authentique seulement si chaque champ concorde EXACTEMENT."""
    return (
        (X['sim_su'] == 1) & (X['sim_titulaire'] == 1) & (X['sim_zone'] == 1)
        & (X['nature_concorde'] == 1) & (X['ecart_superficie'] <= 0.02)
    ).astype(int).to_numpy()


def mesurer(y_vrai, y_pred, proba=None):
    tn, fp, fn, tp = confusion_matrix(y_vrai, y_pred, labels=[0, 1]).ravel()
    m = {
        'exactitude': round(float(accuracy_score(y_vrai, y_pred)), 4),
        'precision': round(float(precision_score(y_vrai, y_pred, zero_division=0)), 4),
        'rappel': round(float(recall_score(y_vrai, y_pred, zero_division=0)), 4),
        'f1': round(float(f1_score(y_vrai, y_pred, zero_division=0)), 4),
        # faux authentiques = dossiers incohérents acceptés (l'erreur la plus grave)
        'matrice_confusion': {'vrais_falsifies': int(tn), 'faux_authentiques': int(fp),
                              'faux_falsifies': int(fn), 'vrais_authentiques': int(tp)},
    }
    if proba is not None and len(set(y_vrai)) > 1:
        m['auc'] = round(float(roc_auc_score(y_vrai, proba)), 4)
    return m


def main():
    fiches, f_train, f_test, (X_train, y_train), (X_test, y_test), (X, y) = jeux_entrainement_test()
    print(f"Fiches réelles : {len(fiches)} ({len(f_train)} pour l'entraînement, {len(f_test)} pour le test)")
    print(f"Dossiers : {len(X_train)} d'entraînement, {len(X_test)} de test "
          f"(conformes test = {int(y_test.sum())}, incohérents test = {int(len(y_test) - y_test.sum())})")

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
              f"| incohérents acceptés={mc['faux_authentiques']} conformes refusés={mc['faux_falsifies']}")

    # Mise en production : réentraînement sur les dossiers construits à partir des 510 fiches
    final = construire_reseau().fit(X, y)
    joblib.dump(final, DOSSIER_IA / 'modele_authentification.pkl')
    with open(DOSSIER_IA / 'metriques_authentification.json', 'w', encoding='utf-8') as f:
        json.dump({
            'date': date.today().isoformat(),
            'donnees': {'source': SOURCE, 'origine': 'réelles (aucune donnée simulée)',
                        'fiches_reelles': len(fiches), 'fiches_entrainement': len(f_train), 'fiches_test': len(f_test),
                        'nb_dossiers': len(X), 'entrainement': len(X_train), 'test': len(X_test),
                        'conformes': int(y.sum()), 'incoherents': int(len(y) - y.sum())},
            'architecture_reseau': {'entrees': len(CARACTERISTIQUES), 'couches_cachees': list(mlp.hidden_layer_sizes),
                                    'activation': mlp.activation, 'sortie': 'sigmoïde (probabilité)',
                                    'optimiseur': mlp.solver, 'epoques': int(mlp.n_iter_)},
            'caracteristiques': CARACTERISTIQUES,
            'modeles': resultats,
        }, f, ensure_ascii=False, indent=2)
    print("Enregistré : ia/modele_authentification.pkl et ia/metriques_authentification.json")


if __name__ == '__main__':
    main()
