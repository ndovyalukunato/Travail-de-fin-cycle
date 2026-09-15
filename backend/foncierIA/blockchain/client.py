import json
import os
from pathlib import Path
from web3 import Web3
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
ARTIFACT_PATH = BASE_DIR / "artifacts" / "FoncierAI.json"

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:8545")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS")
DEPLOYER_PRIVATE_KEY = os.getenv("DEPLOYER_PRIVATE_KEY")


class BlockchainClient:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(RPC_URL))
        if not self.w3.is_connected():
            raise ConnectionError(f"Impossible de se connecter à {RPC_URL}")

        with open(ARTIFACT_PATH, "r", encoding="utf-8") as f:
            artifact = json.load(f)

        self.contract = self.w3.eth.contract(
            address=Web3.to_checksum_address(CONTRACT_ADDRESS),
            abi=artifact["abi"],
        )
        self.account = self.w3.eth.account.from_key(DEPLOYER_PRIVATE_KEY)

    def enregistrer_transaction(self, parcelle_su, acheteur_address, vendeur_address, montant_wei):
        nonce = self.w3.eth.get_transaction_count(self.account.address)
        tx = self.contract.functions.enregistrerTransaction(
            parcelle_su,
            Web3.to_checksum_address(acheteur_address),
            Web3.to_checksum_address(vendeur_address),
            montant_wei,
        ).build_transaction({
            "from": self.account.address,
            "nonce": nonce,
            "gas": 500_000,
            "gasPrice": self.w3.eth.gas_price,
        })

        signed_tx = self.w3.eth.account.sign_transaction(tx, private_key=DEPLOYER_PRIVATE_KEY)
        tx_hash = self.w3.eth.send_raw_transaction(signed_tx.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)

        return {
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "status": receipt.status,
        }

    def get_transaction(self, transaction_id):
        return self.contract.functions.getTransaction(transaction_id).call()


blockchain_client = BlockchainClient()