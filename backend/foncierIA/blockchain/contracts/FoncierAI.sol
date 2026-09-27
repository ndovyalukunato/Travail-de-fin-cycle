// SPDX-License-Identifier: MIT
// Licence du code source (obligatoire en Solidity)
pragma solidity ^0.8.20; // version du compilateur Solidity requise

// ==========================================================
// CONTRAT INTELLIGENT FoncierAI
// Registre des ventes de parcelles : chaque vente validée par
// l'administrateur y est enregistrée de façon infalsifiable.
// ==========================================================
contract FoncierAI {

    // Structure d'une transaction foncière enregistrée sur la blockchain
    struct TransactionFonciere {
        uint256 id;          // numéro de la transaction dans le contrat
        string  parcelleSu;  // numéro SU de la parcelle vendue
        address acheteur;    // adresse Ethereum de l'acheteur
        address vendeur;     // adresse Ethereum du vendeur
        uint256 montant;     // montant de la vente (en wei)
        uint256 timestamp;   // date d'enregistrement (horodatage du bloc)
        bool    valide;      // vrai quand la transaction est enregistrée
    }

    address public proprietaire;         // compte qui a déployé le contrat (le backend Django)
    uint256 public nombreTransactions;   // compteur des transactions enregistrées

    // Toutes les transactions, accessibles par leur numéro
    mapping(uint256 => TransactionFonciere) public transactions;
    // Pour chaque parcelle (SU), la liste des numéros de ses transactions
    mapping(string  => uint256[])           private transactionsParParcelle;

    // Événement émis à chaque enregistrement (consultable dans les journaux de la blockchain)
    event TransactionEnregistree(
        uint256 indexed id,
        string  parcelleSu,
        address indexed acheteur,
        address indexed vendeur,
        uint256 montant,
        uint256 timestamp
    );

    // Restreint une fonction au seul propriétaire du contrat
    modifier seulementProprietaire() {
        require(msg.sender == proprietaire, "FoncierAI: acces non autorise");
        _; // emplacement où s'exécute le corps de la fonction
    }

    // Exécuté une seule fois, au déploiement du contrat
    constructor() {
        proprietaire = msg.sender;  // celui qui déploie devient propriétaire
        nombreTransactions = 0;     // aucune transaction au départ
    }

    // Enregistre une vente validée ; seul le propriétaire (le backend) peut l'appeler
    function enregistrerTransaction(
        string  memory _parcelleSu,
        address _acheteur,
        address _vendeur,
        uint256 _montant
    ) public seulementProprietaire returns (uint256) {
        // Vérifications : si une condition est fausse, la transaction est annulée
        require(bytes(_parcelleSu).length > 0, "FoncierAI: SU vide");
        require(_acheteur != address(0), "FoncierAI: adresse acheteur invalide");
        require(_vendeur != address(0), "FoncierAI: adresse vendeur invalide");
        require(_montant > 0, "FoncierAI: montant nul");

        nombreTransactions++; // nouveau numéro de transaction

        // Stocke la transaction de façon permanente sur la blockchain
        transactions[nombreTransactions] = TransactionFonciere({
            id: nombreTransactions,
            parcelleSu: _parcelleSu,
            acheteur: _acheteur,
            vendeur: _vendeur,
            montant: _montant,
            timestamp: block.timestamp,
            valide: true
        });

        // Ajoute ce numéro à l'historique de la parcelle
        transactionsParParcelle[_parcelleSu].push(nombreTransactions);

        // Publie l'événement
        emit TransactionEnregistree(
            nombreTransactions, _parcelleSu, _acheteur, _vendeur, _montant, block.timestamp
        );

        return nombreTransactions; // renvoie le numéro attribué
    }

    // Lecture d'une transaction par son numéro (gratuite, ne modifie rien : "view")
    function getTransaction(uint256 _id) public view returns (TransactionFonciere memory) {
        require(_id > 0 && _id <= nombreTransactions, "FoncierAI: transaction inexistante");
        return transactions[_id];
    }

    // Liste des numéros de transactions d'une parcelle (historique des ventes)
    function getTransactionsByParcelle(string memory _parcelleSu) public view returns (uint256[] memory) {
        return transactionsParParcelle[_parcelleSu];
    }
}
