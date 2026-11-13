# ==========================================================
# APPRENTISSAGE CONTINU DES MODÈLES D'IA
# Les modèles réapprennent automatiquement avec les données produites par
# l'application elle-même :
#   - ventes validées par l'administrateur (prix réel du marché)
#       -> Régression Linéaire, Random Forest, Réseau de neurones (prix)
#          et Isolation Forest (fraude) ;
#   - décisions sur les dossiers (vérifié par l'admin, rejeté, vendu)
#       -> réseau de neurones d'authentification des documents.
#
# Déclenchement : automatiquement dès que SEUIL nouvelles données réelles sont
# disponibles (settings.APPRENTISSAGE_SEUIL), ou manuellement par l'admin.
# L'entraînement tourne en arrière-plan (thread) : l'application reste utilisable.
#
# Garde-fou : un nouveau modèle n'est ADOPTÉ que s'il fait au moins aussi bien
# (à une tolérance près) qu'un modèle entraîné sans les données réelles, sur un
# jeu de test commun. Les anciens fichiers sont archivés dans ia/historique/ et
# chaque tentative est notée dans ia/journal_apprentissage.json.
# ==========================================================
import json
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from django.conf import settings
from sklearn.ensemble import IsolationForest, RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import f1_score, mean_absolute_error, mean_squared_error, r2_score, accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

DOSSIER_IA = Path(__file__).resolve().parent
FICHIER_DONNEES = DOSSIER_IA.parent.parent / 'database' / 'DATA_final_mercuriale.xlsx'

POIDS_VENTES_REELLES = 3        # une vente réelle compte comme 3 lignes de la mercuriale (donnée récente)
POIDS_DOSSIERS_REELS = 5        # un dossier tranché dans l'application compte comme 5 dossiers du jeu Kaggle
MIN_VENTES_NOUVELLE_ZONE = 3    # un nouveau lotissement est appris après 3 ventes validées
TOLERANCE_R2 = 0.02             # baisse de R² tolérée pour adopter les nouveaux modèles de prix
TOLERANCE_F1 = 0.01             # baisse de F1 tolérée pour le réseau d'authentification

_verrou = threading.Lock()


# ---------------------------------------------------------------- fichiers d'état
def _lire(fichier, defaut):
    try:
        return json.loads(Path(fichier).read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        return defaut


def _ecrire(fichier, contenu):
    Path(fichier).write_text(json.dumps(contenu, ensure_ascii=False, indent=2), encoding='utf-8')


def lire_etat(dossier=DOSSIER_IA):
    return _lire(Path(dossier) / 'etat_apprentissage.json', {'ventes': 0, 'dossiers': 0, 'date': None})


def lire_journal(dossier=DOSSIER_IA):
    return _lire(Path(dossier) / 'journal_apprentissage.json', [])


def en_cours():
    return _verrou.locked()


# ---------------------------------------------------------------- données réelles
def donnees_reelles_prix():
    """Une ligne par vente validée (statut « terminée ») : superficie, lotissement, infrastructure, prix payé."""
    from transactions.models import Transaction
    from ia.modele import superficie_en_m2, infrastructure_depuis_nature
    lignes = []
    for t in Transaction.objects.filter(statut='terminée').select_related('parcelle'):
        p = t.parcelle
        superficie = superficie_en_m2(p.superficie_ha, p.superficie_ares, p.superficie_ca, p.superficie_pourcent)
        if superficie > 0 and t.montant and p.zone:
            lignes.append({'superficie': float(superficie), 'zone': p.zone.strip().lower(),
                           'infrastructure': infrastructure_depuis_nature(p.nature), 'prix': float(t.montant)})
    return pd.DataFrame(lignes, columns=['superficie', 'zone', 'infrastructure', 'prix'])


def etiquette_dossier(p):
    """1 = authentique, 0 = falsifié/rejeté, None = pas encore tranché par un humain."""
    if p.verification == 'rejetee':
        return 0
    if p.verification == 'verifiee' and (p.verifie_par == 'admin' or p.statut == 'vendue'):
        return 1
    return None  # validé seulement par l'IA, ou en attente : pas utilisé (évite que le réseau s'auto-confirme)


def donnees_reelles_authentification():
    """Indices (les 15 entrées du réseau) et décision finale des dossiers tranchés."""
    from ia.authentification import CARACTERISTIQUES
    from parcelles.models import Parcelle
    from parcelles.verification import caracteristiques, trouver_document
    lignes, etiquettes = [], []
    for p in Parcelle.objects.select_related('proprietaire'):
        y = etiquette_dossier(p)
        if y is None:
            continue
        v = (p.rapport_verification or {}).get('caracteristiques')
        if not v:
            doc = trouver_document(p)
            if doc is None:
                continue  # pas de document au registre : aucun indice calculable
            v, _ = caracteristiques(p, doc)
        lignes.append([float(v[c]) for c in CARACTERISTIQUES])
        etiquettes.append(y)
    return pd.DataFrame(lignes, columns=CARACTERISTIQUES), np.array(etiquettes, dtype=int)


def compter_donnees_reelles():
    from parcelles.models import Parcelle
    from transactions.models import Transaction
    return {
        'ventes': Transaction.objects.filter(statut='terminée').count(),
        'dossiers': sum(etiquette_dossier(p) is not None for p in Parcelle.objects.all()),
    }


def nouvelles_donnees(dossier=DOSSIER_IA):
    etat, actuel = lire_etat(dossier), compter_donnees_reelles()
    return {k: max(0, actuel[k] - etat.get(k, 0)) for k in actuel}


# ---------------------------------------------------------------- modèles de prix
def _mercuriale():
    df = pd.read_excel(FICHIER_DONNEES, sheet_name='Feuil1')
    df = df.dropna(subset=['SUPERFICIE_M2', 'LOTISSEMENT', 'PRIX-VENTE']).copy()
    return pd.DataFrame({
        'superficie': df['SUPERFICIE_M2'].astype(float),
        'zone': df['LOTISSEMENT'].str.strip().str.lower(),
        'infrastructure': df['TYPE-DOCUMENTS'].str.contains('certificat', case=False, na=False).astype(int),
        'prix': df['PRIX-VENTE'].astype(float),
    })


def _metriques_regression(y, pred):
    return {'r2': round(float(r2_score(y, pred)), 4), 'mae': round(float(mean_absolute_error(y, pred)), 2),
            'rmse': round(float(np.sqrt(mean_squared_error(y, pred))), 2)}


def _modeles_prix(nb_zones):
    from ia.entrainer_reseau_neurones import construire_reseau
    return {
        'regression_lineaire': lambda: LinearRegression(),
        'random_forest': lambda: RandomForestRegressor(n_estimators=100, random_state=42),
        'reseau_neurones': lambda: construire_reseau(nb_zones),
    }


def reentrainer_prix(force, dossier):
    base, reelles = _mercuriale(), donnees_reelles_prix()
    if reelles.empty and not force:
        return {'statut': 'ignore', 'raison': 'aucune vente validée'}

    # Lotissements : ceux de la mercuriale + les nouveaux ayant assez de ventes validées
    comptes = reelles['zone'].value_counts()
    nouvelles_zones = sorted(z for z, n in comptes.items()
                             if n >= MIN_VENTES_NOUVELLE_ZONE and z not in set(base['zone']))
    le = LabelEncoder().fit(sorted(set(base['zone']) | set(nouvelles_zones)))
    reelles = reelles[reelles['zone'].isin(le.classes_)]

    def X(df):
        return pd.DataFrame({'superficie': df['superficie'], 'zone_encoded': le.transform(df['zone']),
                             'infrastructure': df['infrastructure']})

    b_tr, b_te = train_test_split(base, test_size=0.2, random_state=42)
    if len(reelles) >= 5:
        r_tr, r_te = train_test_split(reelles, test_size=0.2, random_state=42)
    else:
        r_tr, r_te = reelles, reelles.iloc[0:0]
    test = pd.concat([b_te, r_te])
    entr_ref = b_tr
    entr_cand = pd.concat([b_tr] + [r_tr] * POIDS_VENTES_REELLES)

    constructeurs = _modeles_prix(len(le.classes_))
    comparaison, preds = {}, {}
    for nom, creer in constructeurs.items():
        ref = creer().fit(X(entr_ref), entr_ref['prix'])
        cand = creer().fit(X(entr_cand), entr_cand['prix'])
        preds[nom] = cand.predict(X(test))
        comparaison[nom] = {'r2_sans_donnees_reelles': round(float(r2_score(test['prix'], ref.predict(X(test)))), 4),
                            'r2_avec_donnees_reelles': round(float(r2_score(test['prix'], preds[nom])), 4)}
    gain = np.mean([c['r2_avec_donnees_reelles'] - c['r2_sans_donnees_reelles'] for c in comparaison.values()])
    adopte = bool(gain >= -TOLERANCE_R2)
    resultat = {'statut': 'adopte' if adopte else 'rejete', 'ventes_reelles': int(len(reelles)),
                'zones_ajoutees': nouvelles_zones, 'gain_r2_moyen': round(float(gain), 4), 'comparaison': comparaison}
    if not adopte:
        return resultat

    # Modèles définitifs : toutes les données (mercuriale + ventes réelles pondérées)
    tout = pd.concat([base] + [reelles] * POIDS_VENTES_REELLES)
    finaux = {nom: creer().fit(X(tout), tout['prix']) for nom, creer in constructeurs.items()}
    fraude = IsolationForest(n_estimators=100, contamination=0.05, random_state=42).fit(pd.DataFrame({
        'SUPERFICIE_M2': tout['superficie'], 'zone_encoded': le.transform(tout['zone']),
        'infrastructure': tout['infrastructure'], 'PRIX-VENTE': tout['prix']}))
    _archiver(dossier, ['modele_lr.pkl', 'modele_rf.pkl', 'modele_rn.pkl', 'modele_fraude.pkl',
                        'label_encoder.pkl', 'metriques.json'])
    for fichier, modele in (('modele_lr.pkl', finaux['regression_lineaire']), ('modele_rf.pkl', finaux['random_forest']),
                            ('modele_rn.pkl', finaux['reseau_neurones']), ('modele_fraude.pkl', fraude),
                            ('label_encoder.pkl', le)):
        joblib.dump(modele, Path(dossier) / fichier)

    modeles = {nom: _metriques_regression(test['prix'], p) for nom, p in preds.items()}
    modeles['moyenne_3_modeles'] = _metriques_regression(test['prix'], np.mean(list(preds.values()), axis=0))
    mlp = finaux['reseau_neurones'].regressor_.named_steps['reseau']
    metriques = _lire(Path(dossier) / 'metriques.json', {})
    metriques.update({
        'date': datetime.now().date().isoformat(), 'jeu_de_test': int(len(test)), 'modeles': modeles,
        'architecture_reseau': {**metriques.get('architecture_reseau', {}), 'epoques': int(mlp.n_iter_)},
        'apprentissage_continu': {'ventes_reelles': int(len(reelles)), 'zones': list(le.classes_)},
    })
    _ecrire(Path(dossier) / 'metriques.json', metriques)
    return resultat


# ---------------------------------------------------------------- réseau d'authentification
def reentrainer_authentification(force, dossier, nb_simules=None):
    # nb_simules : conservé pour compatibilité, inutilisé (plus aucune donnée simulée)
    from ia.entrainer_authentification import construire_reseau, jeux_entrainement_test, mesurer
    Xr, yr = donnees_reelles_authentification()
    if len(Xr) == 0 and not force:
        return {'statut': 'ignore', 'raison': 'aucun dossier tranché'}

    # base : dossiers construits à partir des 510 enregistrements réels du jeu Kaggle
    _, _, _, (Xs_tr, ys_tr), (Xs_te, ys_te), (Xs, ys) = jeux_entrainement_test()
    if len(Xr) >= 5:
        strat = yr if min(np.bincount(yr, minlength=2)) >= 2 else None
        Xr_tr, Xr_te, yr_tr, yr_te = train_test_split(Xr, yr, test_size=0.2, random_state=42, stratify=strat)
    else:
        Xr_tr, Xr_te, yr_tr, yr_te = Xr, Xr.iloc[0:0], yr, yr[:0]
    X_te, y_te = pd.concat([Xs_te, Xr_te]), np.concatenate([ys_te, yr_te])

    ref = construire_reseau().fit(Xs_tr, ys_tr)
    cand = construire_reseau().fit(pd.concat([Xs_tr] + [Xr_tr] * POIDS_DOSSIERS_REELS),
                                   np.concatenate([ys_tr] + [yr_tr] * POIDS_DOSSIERS_REELS))
    f1_ref = f1_score(y_te, ref.predict(X_te))
    f1_cand = f1_score(y_te, cand.predict(X_te))
    adopte = bool(f1_cand >= f1_ref - TOLERANCE_F1)
    resultat = {'statut': 'adopte' if adopte else 'rejete', 'dossiers_reels': int(len(Xr)),
                'f1_sans_donnees_reelles': round(float(f1_ref), 4), 'f1_avec_donnees_reelles': round(float(f1_cand), 4)}
    if len(Xr_te):
        resultat['exactitude_dossiers_reels_test'] = round(float(accuracy_score(yr_te, cand.predict(Xr_te))), 4)
    if not adopte:
        return resultat

    final = construire_reseau().fit(pd.concat([Xs] + [Xr] * POIDS_DOSSIERS_REELS),
                                    np.concatenate([ys] + [yr] * POIDS_DOSSIERS_REELS))
    _archiver(dossier, ['modele_authentification.pkl', 'metriques_authentification.json'])
    joblib.dump(final, Path(dossier) / 'modele_authentification.pkl')
    metriques = _lire(Path(dossier) / 'metriques_authentification.json', {'modeles': {}})
    metriques.setdefault('modeles', {})['reseau_neurones'] = mesurer(y_te, cand.predict(X_te), cand.predict_proba(X_te)[:, 1])
    metriques['date'] = datetime.now().date().isoformat()
    metriques['apprentissage_continu'] = {'dossiers_reels': int(len(Xr)),
                                          'authentiques': int(yr.sum()), 'rejetes': int(len(yr) - yr.sum())}
    _ecrire(Path(dossier) / 'metriques_authentification.json', metriques)
    return resultat


# ---------------------------------------------------------------- orchestration
def _archiver(dossier, fichiers):
    cible = Path(dossier) / 'historique' / datetime.now().strftime('%Y-%m-%d_%H%M%S')
    cible.mkdir(parents=True, exist_ok=True)
    for f in fichiers:
        if (Path(dossier) / f).exists():
            shutil.copy2(Path(dossier) / f, cible / f)


def reentrainer(declencheur='manuel', force=False, dossier=DOSSIER_IA, nb_simules=None):
    """Réentraîne les modèles avec les données réelles. Renvoie l'entrée du journal (None si déjà en cours)."""
    if not _verrou.acquire(blocking=False):
        return None
    try:
        debut = time.time()
        compte = compter_donnees_reelles()
        entree = {'date': datetime.now().isoformat(timespec='seconds'), 'declencheur': declencheur, **compte}
        for nom, fonction in (('prix', lambda: reentrainer_prix(force, dossier)),
                              ('authentification', lambda: reentrainer_authentification(force, dossier, nb_simules))):
            try:
                entree[nom] = fonction()
            except Exception as e:  # un échec n'empêche pas l'autre entraînement
                entree[nom] = {'statut': 'erreur', 'raison': str(e)[:300]}
        entree['duree_s'] = round(time.time() - debut, 1)
        _ecrire(Path(dossier) / 'journal_apprentissage.json', (lire_journal(dossier) + [entree])[-50:])
        _ecrire(Path(dossier) / 'etat_apprentissage.json', {**compte, 'date': entree['date']})
        if Path(dossier) == DOSSIER_IA:  # les nouveaux modèles servent aussitôt, sans redémarrer le serveur
            from ia import authentification, modele
            modele.recharger()
            authentification.recharger()
        return entree
    finally:
        _verrou.release()


def _en_arriere_plan(declencheur, force):
    from django.db import connection
    try:
        reentrainer(declencheur, force)
    finally:
        connection.close()  # le thread a sa propre connexion à la base


def lancer_en_arriere_plan(declencheur='manuel', force=False):
    if en_cours():
        return False
    threading.Thread(target=_en_arriere_plan, args=(declencheur, force), daemon=True).start()
    return True


def declencher_si_necessaire(declencheur):
    """Appelé après chaque nouvelle donnée réelle (vente validée, décision sur un dossier)."""
    if not getattr(settings, 'APPRENTISSAGE_AUTOMATIQUE', False):
        return False
    nouv = nouvelles_donnees()
    if sum(nouv.values()) >= getattr(settings, 'APPRENTISSAGE_SEUIL', 5):
        return lancer_en_arriere_plan(declencheur)
    return False


# ---------------------------------------------------------------- surveillance périodique
_surveillance_lancee = False


def demarrer_surveillance():
    """Thread d'arrière-plan lancé au démarrage du serveur : toutes les
    APPRENTISSAGE_INTERVALLE secondes, il vérifie s'il y a assez de nouvelles données
    réelles et réentraîne les modèles si besoin. Rien n'est affiché dans l'interface ;
    les résultats sont notés dans ia/journal_apprentissage.json."""
    global _surveillance_lancee
    if _surveillance_lancee or not getattr(settings, 'APPRENTISSAGE_AUTOMATIQUE', False):
        return
    _surveillance_lancee = True
    intervalle = getattr(settings, 'APPRENTISSAGE_INTERVALLE', 3600)

    def boucle():
        time.sleep(30)  # laisse le serveur finir de démarrer
        while True:
            try:
                declencher_si_necessaire('vérification périodique')
            except Exception:  # base indisponible, etc. : on réessaiera au prochain tour
                pass
            time.sleep(intervalle)

    threading.Thread(target=boucle, daemon=True, name='apprentissage-continu').start()

