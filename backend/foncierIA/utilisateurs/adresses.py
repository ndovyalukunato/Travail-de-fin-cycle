# ==========================================================
# ADRESSES ETHEREUM DES UTILISATEURS
# - adresse_proposee() : adresse proposée par défaut à la création d'un compte
#   (l'administrateur peut la modifier avant de créer le compte) :
#     1. le premier compte du nœud Ganache qui n'est attribué à personne ;
#     2. à défaut (Ganache arrêté ou tous ses comptes attribués), une adresse
#        Ethereum neuve générée localement (bibliothèque eth_account).
# - adresse_deja_utilisee() : contrôle d'unicité (insensible à la casse, car
#   0xAbC... et 0xabc... désignent le même compte).
# ==========================================================
import os

from .models import Utilisateur

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")  # adresse de Ganache


def adresses_utilisees(sauf_id=None):
    qs = Utilisateur.objects.exclude(adresse_ethereum__isnull=True).exclude(adresse_ethereum='')
    if sauf_id is not None:
        qs = qs.exclude(pk=sauf_id)
    return {a.lower() for a in qs.values_list('adresse_ethereum', flat=True)}


def adresse_deja_utilisee(adresse, sauf_id=None):
    return bool(adresse) and adresse.lower() in adresses_utilisees(sauf_id)


def comptes_ganache():
    """Comptes du nœud Ganache, ou [] s'il ne répond pas."""
    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout': 2}))
        return list(w3.eth.accounts) if w3.is_connected() else []
    except Exception:
        return []


def adresse_proposee():
    """Renvoie {'adresse': '0x...', 'origine': 'ganache' | 'generee'} ; l'adresse n'est attribuée à personne."""
    utilisees = adresses_utilisees()
    for compte in comptes_ganache():
        if compte.lower() not in utilisees:
            return {'adresse': compte, 'origine': 'ganache'}
    from eth_account import Account
    while True:  # une collision est pratiquement impossible, mais on la vérifie quand même
        adresse = Account.create().address
        if adresse.lower() not in utilisees:
            return {'adresse': adresse, 'origine': 'generee'}
