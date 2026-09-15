// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FoncierAI {

    struct TransactionFonciere {
        uint256 id;
        string  parcelleSu;
        address acheteur;
        address vendeur;
        uint256 montant;
        uint256 timestamp;
        bool    valide;
    }

    address public proprietaire;
    uint256 public nombreTransactions;

    mapping(uint256 => TransactionFonciere) public transactions;
    mapping(string  => uint256[])           private transactionsParParcelle;

    event TransactionEnregistree(
        uint256 indexed id,
        string  parcelleSu,
        address indexed acheteur,
        address indexed vendeur,
        uint256 montant,
        uint256 timestamp
    );

    modifier seulementProprietaire() {
        require(msg.sender == proprietaire, "FoncierAI: acces non autorise");
        _;
    }

    constructor() {
        proprietaire = msg.sender;
        nombreTransactions = 0;
    }

    function enregistrerTransaction(
        string  memory _parcelleSu,
        address _acheteur,
        address _vendeur,
        uint256 _montant
    ) public seulementProprietaire returns (uint256) {
        require(bytes(_parcelleSu).length > 0, "FoncierAI: SU vide");
        require(_acheteur != address(0), "FoncierAI: adresse acheteur invalide");
        require(_vendeur != address(0), "FoncierAI: adresse vendeur invalide");
        require(_montant > 0, "FoncierAI: montant nul");

        nombreTransactions++;

        transactions[nombreTransactions] = TransactionFonciere({
            id: nombreTransactions,
            parcelleSu: _parcelleSu,
            acheteur: _acheteur,
            vendeur: _vendeur,
            montant: _montant,
            timestamp: block.timestamp,
            valide: true
        });

        transactionsParParcelle[_parcelleSu].push(nombreTransactions);

        emit TransactionEnregistree(
            nombreTransactions, _parcelleSu, _acheteur, _vendeur, _montant, block.timestamp
        );

        return nombreTransactions;
    }

    function getTransaction(uint256 _id) public view returns (TransactionFonciere memory) {
        require(_id > 0 && _id <= nombreTransactions, "FoncierAI: transaction inexistante");
        return transactions[_id];
    }

    function getTransactionsByParcelle(string memory _parcelleSu) public view returns (uint256[] memory) {
        return transactionsParParcelle[_parcelleSu];
    }
}