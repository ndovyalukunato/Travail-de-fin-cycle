# ==========================================================
# COMPILATION DU CONTRAT INTELLIGENT (Solidity -> ABI + bytecode)
# À lancer une seule fois (ou après modification du contrat) :
#     python blockchain/compile.py
# ==========================================================
import json  # écriture du résultat au format JSON
import solcx  # bibliothèque Python qui pilote le compilateur Solidity (solc)
from pathlib import Path  # manipulation des chemins de fichiers

BASE_DIR = Path(__file__).resolve().parent  # dossier "blockchain"
CONTRACT_PATH = BASE_DIR / "contracts" / "FoncierAI.sol"  # code source du contrat
ARTIFACTS_DIR = BASE_DIR / "artifacts"  # dossier où sera écrit le contrat compilé
ARTIFACTS_DIR.mkdir(exist_ok=True)  # crée le dossier s'il n'existe pas encore

# Télécharge la version 0.8.20 du compilateur Solidity (si elle n'est pas déjà installée)
solcx.install_solc("0.8.20")

# Lit le code source du contrat
with open(CONTRACT_PATH, "r", encoding="utf-8") as f:
    source = f.read()

# Compile le contrat : on demande l'ABI (interface des fonctions) et le bytecode (code machine EVM)
compiled = solcx.compile_source(
    source,
    output_values=["abi", "bin"],
    solc_version="0.8.20",
)

# Le résultat est un dictionnaire {nom_du_contrat: interface} ; on prend le premier (et unique) contrat
contract_id, contract_interface = list(compiled.items())[0]

# Ce qui est nécessaire pour déployer et utiliser le contrat depuis Python (web3)
artifact = {
    "abi": contract_interface["abi"],  # description des fonctions et événements
    "bytecode": contract_interface["bin"],  # code à envoyer sur la blockchain lors du déploiement
}

# Enregistre le tout dans artifacts/FoncierAI.json (lu par deploy.py et client.py)
output_file = ARTIFACTS_DIR / "FoncierAI.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(artifact, f, indent=2)

print(f"Compilation réussie -> {output_file}")  # message de confirmation
