import json  # lecture du contrat compilé (fichier JSON)
import os  # lecture des variables d'environnement
from pathlib import Path  # manipulation des chemins de fichiers
from web3 import Web3  # bibliothèque pour dialoguer avec la blockchain Ethereum
from dotenv import load_dotenv  # lecture du fichier .env

load_dotenv()  # charge RPC_URL, CONTRACT_ADDRESS, DEPLOYER_PRIVATE_KEY depuis le fichier .env

BASE_DIR = Path(__file__).resolve().parent  # dossier "blockchain"
ARTIFACT_PATH = BASE_DIR / "artifacts" / "FoncierAI.json"  # ABI du contrat (liste de ses fonctions)

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")  # adresse de Ganache
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")  # adresse du contrat déployé
DEPLOYER_PRIVATE_KEY = os.getenv("DEPLOYER_PRIVATE_KEY")  # clé privée du compte qui signe les transactions


# Client qui envoie les ventes validées au contrat intelligent FoncierAI
class BlockchainClient:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(RPC_URL))  # connexion à Ganache
        if not self.w3.is_connected():
            raise ConnectionError(f"Impossible de se connecter à {RPC_URL}")

        # Lit l'ABI produite par compile.py
        with open(ARTIFACT_PATH, "r", encoding="utf-8") as f:
            artifact = json.load(f)

        # Objet permettant d'appeler les fonctions du contrat déployé
        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACT_ADDRESS),
            abi=artifact["abi"],
        )
        # Compte "propriétaire" du contrat : le seul autorisé à enregistrer des transactions
        self.account = self.w3.eth.account.from_key(DEPLOYER_PRIVATE_KEY)

    # Enregistre une vente sur la blockchain et renvoie le hash de la transaction
    def enregistrer_transaction(self, parcelle_su, acheteur_address, vendeur_address, montant_wei):
        # Numéro de la prochaine transaction du compte
        nonce = self.w3.eth.get_transaction_count(self.account.address)
        # Prépare l'appel de la fonction enregistrerTransaction du contrat
        tx = self.contract.functions.enregistrerTransaction(
            parcelle_su,  # numéro SU de la parcelle
            Web3.to_checksum_address(acheteur_address),  # adresse Ethereum de l'acheteur
            Web3.to_checksum_address(vendeur_address),  # adresse Ethereum du vendeur
            montant_wei,  # montant (converti en wei : 1 ether = 10^18 wei)
        ).build_transaction({
            "from": self.account.address,  # compte qui envoie la transaction
            "nonce": nonce,
            "gas": 500_000,  # quantité maximale de gas autorisée
            "gasPrice": self.w3.eth.gas_price,  # prix du gas proposé par Ganache
        })

        # Signe la transaction avec la clé privée
        signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=DEPLOYER_PRIVATE_KEY)
        # Envoie la transaction signée à Ganache
        tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        # Attend qu'elle soit incluse dans un bloc et récupère le reçu
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        return {
            "tx_hash": Web3.to_hex(receipt.transactionHash),  # format standard "0x..."
            "block_number": receipt.blockNumber,  # numéro du bloc qui contient la transaction
            "status": receipt.status,  # 1 = succès, 0 = échec
        }

    # Lit une transaction enregistrée dans le contrat (lecture gratuite, sans transaction)
    def get_transaction(self, transaction_id):
        return self.contract.functions.getTransaction(transaction_id).call()


def etat_blockchain():
    """
    Vérifie rapidement (2 s max) que Ganache répond et que le contrat est déployé.
    Utilisé par l'interface pour prévenir l'admin avant qu'il ne valide une vente.
    """
    # Connexion avec un délai maximal de 2 secondes (pour ne pas bloquer la page)
    w3 = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={"timeout": 2}))
    try:
        connecte = w3.is_connected()  # Ganache répond-il ?
    except Exception:
        connecte = False
    # Cas 1 : Ganache n'est pas lancé
    if not connecte:
        return {
            "disponible": False,
            "message": "Ganache n'est pas lancé : la validation des ventes est impossible. "
                       "Lancez demarrer_blockchain.bat.",
        }
    # Cas 2 : Ganache est lancé mais il n'y a pas de code à l'adresse du contrat
    if not CONTRACT_ADDRESS or len(w3.eth.get_code(Web3.to_checksum_address(CONTRACT_ADDRESS))) == 0:
        return {
            "disponible": False,
            "message": "Ganache est lancé mais le contrat FoncierAI n'est pas déployé. "
                       "Lancez demarrer_blockchain.bat (ou python blockchain/verifier_contrat.py).",
        }
    # Cas 3 : tout est prêt
    return {"disponible": True, "message": "Blockchain opérationnelle.", "bloc": w3.eth.block_number}


# Client partagé, créé seulement au premier besoin
_client = None


def get_blockchain_client():
    """
    Connexion à Ganache à la demande (et non à l'import) : Django peut
    démarrer même si Ganache n'est pas lancé ; seule la validation d'une
    transaction en a besoin.
    """
    global _client  # on modifie la variable définie en dehors de la fonction
    if _client is None:
        _client = BlockchainClient()  # première utilisation : connexion à Ganache
    return _client  # utilisations suivantes : on réutilise la même connexion
