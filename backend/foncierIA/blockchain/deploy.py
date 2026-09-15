import json
import os
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
ARTIFACT_PATH = BASE_DIR / "artifacts" / "FoncierAI.json"

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
DEPLOYER_PRIVATE_KEY = os.getenv("DEPLOYER_PRIVATE_KEY")

if not DEPLOYER_PRIVATE_KEY:
    raise SystemExit("DEPLOYER_PRIVATE_KEY manquant dans le fichier .env")

with open(ARTIFACT_PATH, "r", encoding="utf-8") as f:
    artifact = json.load(f)

w3 = Web3(Web3.HTTPProvider(RPC_URL))
assert w3.is_connected(), f"Impossible de se connecter à {RPC_URL} (Ganache est-il lancé ?)"

account = w3.eth.account.from_key(DEPLOYER_PRIVATE_KEY)
print(f"Déploiement depuis le compte : {account.address}")

contract = w3.eth.contract(abi=artifact["abi"], bytecode=artifact["bytecode"])

nonce = w3.eth.get_transaction_count(account.address)
tx = contract.constructor().build_transaction({
    "from": account.address,
    "nonce": nonce,
    "gas": 3_000_000,
    "gasPrice": w3.eth.gas_price,
})

signed_tx = w3.eth.account.sign_transaction(tx, private_key=DEPLOYER_PRIVATE_KEY)
tx_hash = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

print(f"Contrat déployé à l'adresse : {receipt.contractAddress}")

with open(BASE_DIR / "artifacts" / "deployed_address.txt", "w") as f:
    f.write(receipt.contractAddress)