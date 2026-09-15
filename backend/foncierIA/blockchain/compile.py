import json
import solcx
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CONTRACT_PATH = BASE_DIR / "contracts" / "FoncierAI.sol"
ARTIFACTS_DIR = BASE_DIR / "artifacts"
ARTIFACTS_DIR.mkdir(exist_ok=True)

solcx.install_solc("0.8.20")

with open(CONTRACT_PATH, "r", encoding="utf-8") as f:
    source = f.read()

compiled = solcx.compile_source(
    source,
    output_values=["abi", "bin"],
    solc_version="0.8.20",
)

contract_id, contract_interface = list(compiled.items())[0]

artifact = {
    "abi": contract_interface["abi"],
    "bytecode": contract_interface["bin"],
}

output_file = ARTIFACTS_DIR / "FoncierAI.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(artifact, f, indent=2)

print(f"Compilation réussie -> {output_file}")