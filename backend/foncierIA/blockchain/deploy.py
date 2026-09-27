# ==========================================================
# DÉPLOIEMENT DU CONTRAT FoncierAI SUR GANACHE
#     python blockchain/deploy.py
# (appelé automatiquement par verifier_contrat.py si le contrat est absent)
# ==========================================================
import json  # lecture du contrat compilé (fichier JSON)
import os  # lecture des variables d'environnement
from pathlib import Path  # manipulation des chemins de fichiers
from web3 import Web3  # bibliothèque pour dialoguer avec la blockchain Ethereum
from dotenv import load_dotenv  # lecture du fichier .env

load_dotenv()  # charge RPC_URL, DEPLOYER_PRIVATE_KEY... depuis le fichier .env

BASE_DIR = Path(__file__).resolve().parent  # dossier "blockchain"
ARTIFACT_PATH = BASE_DIR / "artifacts" / "FoncierAI.json"  # contrat compilé (ABI + bytecode)

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")  # adresse de Ganache
DEPLOYER_PRIVATE_KEY = os.getenv("DEPLOYER_PRIVATE_KEY")  # clé privée du compte qui déploie (compte 0 de Ganache)

# Sans clé privée, impossible de signer la transaction de déploiement
if not DEPLOYER_PRIVATE_KEY:
    raise SystemExit("DEPLOYER_PRIVATE_KEY manquant dans le fichier .env")

# Lit l'ABI et le bytecode produits par compile.py
with open(ARTIFACT_PATH, "r", encoding="utf-8") as f:
    artifact = json.load(f)

w3 = Web3(Web3.HTTPProvider(RPC_URL))  # connexion à Ganache
# Arrête le script si Ganache ne répond pas
assert w3.is_connected(), f"Impossible de se connecter à {RPC_URL} (Ganache est-il lancé ?)"

account = w3.eth.account.from_key(DEPLOYER_PRIVATE_KEY)  # compte Ethereum correspondant à la clé
print(f"Déploiement depuis le compte : {account.address}")

# Objet "contrat" prêt à être déployé (pas encore d'adresse)
contract = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])

# Numéro de la prochaine transaction du compte (évite les doublons)
nonce = w3.eth.get_transaction_count(account.address)
# Prépare la transaction qui exécute le constructeur du contrat
tx = contract.constructor().build_transaction({
    "from": account.address,  # compte qui déploie (deviendra "proprietaire" du contrat)
    "nonce": nonce,
    "gas": 3_000_000,  # quantité maximale de gas autorisée
    "gasPrice": w3.eth.gas_price,  # prix du gas proposé par Ganache
})

# Signe la transaction avec la clé privée
signed_tx = w3.eth.account.sign_transaction(tx, private_key=DEPLOYER_PRIVATE_KEY)
# Envoie la transaction signée à Ganache
tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
# Attend qu'elle soit incluse dans un bloc et récupère le reçu
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

print(f"Contrat déployé à l'adresse : {receipt.contractAddress}")

# Enregistre l'adresse du contrat (lue par verifier_contrat.py pour mettre à jour le .env)
with open(BASE_DIR / "artifacts" / "deployed_address.txt", "w") as f:
    f.write(receipt.contractAddress)
