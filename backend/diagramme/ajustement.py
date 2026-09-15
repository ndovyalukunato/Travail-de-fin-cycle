// Fonction de récupération d'une transaction
    function getTransaction(uint _id)
        public view returns (TransactionFonciere memory) {
        require(_id > 0 && _id <= nombreTransactions,
                'Transaction inexistante');
        return transactions[_id];
    }
 
    // Fonction de vérification de l'existence d'une transaction
    function transactionExiste(uint _id) public view returns (bool) {
        return _id > 0 && _id <= nombreTransactions;
    }
}
