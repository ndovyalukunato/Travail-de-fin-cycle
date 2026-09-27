"""
Vérifie que le contrat FoncierAI est bien déployé sur Ganache ;
sinon le déploie (via deploy.py) et met à jour CONTRACT_ADDRESS dans le .env.

Appelé automatiquement par demarrer_blockchain.bat, mais utilisable seul :
    python blockchain/verifier_contrat.py
"""
import os  # lecture des variables d'environnement
import re  # expressions régulières (modification du fichier .env)
import subprocess  # lancement du script deploy.py
import sys  # chemin de l'interpréteur Python, arrêt du script
import time  # attente entre deux tentatives de connexion
from pathlib import Path  # manipulation des chemins de fichiers

from dotenv import load_dotenv  # lecture du fichier .env
from web3 import Web3  # dialogue avec la blockchain

BASE_DIR = Path(__file__).resolve().parent  # dossier "blockchain"
ENV_PATH = BASE_DIR.parent / ".env"  # fichier .env du backend
load_dotenv(ENV_PATH)  # charge RPC_URL et CONTRACT_ADDRESS

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")  # adresse de Ganache
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "")  # adresse attendue du contrat


# Attend que Ganache réponde (il met quelques secondes à démarrer)
def attendre_ganache(delai=60):
    w3 = Web3(Web3.HTTPProvider(RPC_URL))
    debut = time.time()
    while time.time() - debut < delai:  # réessaie pendant "delai" secondes au maximum
        try:
            if w3.is_connected():
                return w3  # Ganache est prêt
        except Exception:
            pass  # pas encore prêt : on réessaie
        time.sleep(1)  # attend 1 seconde avant la tentative suivante
    sys.exit(f"[ERREUR] Ganache ne répond pas sur {RPC_URL} après {delai} s.")


# Vrai si un contrat est bien déployé à cette adresse
def contrat_present(w3, adresse):
    if not adresse or not Web3.is_address(adresse):
        return False  # adresse vide ou mal formée
    # Un contrat déployé possède du code ; une adresse vide n'en a pas
    return len(w3.eth.get_code(Web3.to_checksum_address(adresse))) > 0


# Remplace (ou ajoute) la ligne CONTRACT_ADDRESS=... dans le fichier .env
def mettre_a_jour_env(nouvelle_adresse):
    contenu = ENV_PATH.read_text(encoding="utf-8")
    if re.search(r"^CONTRACT_ADDRESS=.*$", contenu, flags=re.M):
        # La ligne existe : on remplace sa valeur
        contenu = re.sub(r"^CONTRACT_ADDRESS=.*$", f"CONTRACT_ADDRESS={nouvelle_adresse}", contenu, flags=re.M)
    else:
        # La ligne n'existe pas : on l'ajoute à la fin
        contenu = contenu.rstrip("\n") + f"\nCONTRACT_ADDRESS={nouvelle_adresse}\n"
    ENV_PATH.write_text(contenu, encoding="utf-8")


def main():
    print(f"Connexion à Ganache ({RPC_URL})...")
    w3 = attendre_ganache()
    print(f"Ganache prêt — bloc actuel : {w3.eth.block_number}")

    # Contrat déjà présent : rien à faire
    if contrat_present(w3, CONTRACT_ADDRESS):
        print(f"[OK] Contrat FoncierAI déjà déployé à {CONTRACT_ADDRESS}")
        return

    # Contrat absent : on lance deploy.py (check=True arrête tout en cas d'échec)
    print("Contrat absent : déploiement en cours...")
    subprocess.run([sys.executable, str(BASE_DIR / "deploy.py")], check=True, cwd=BASE_DIR.parent)

    # Adresse écrite par deploy.py
    nouvelle_adresse = (BASE_DIR / "artifacts" / "deployed_address.txt").read_text().strip()
    # Si elle diffère de celle du .env, on met le .env à jour
    if nouvelle_adresse.lower() != CONTRACT_ADDRESS.lower():
        mettre_a_jour_env(nouvelle_adresse)
        print(f"[INFO] .env mis à jour : CONTRACT_ADDRESS={nouvelle_adresse}")
        print("[INFO] Si Django est déjà lancé, redémarrez-le pour prendre en compte la nouvelle adresse.")
    print(f"[OK] Contrat FoncierAI déployé à {nouvelle_adresse}")


# Ce bloc ne s'exécute que si le fichier est lancé directement
if __name__ == "__main__":
    main()
