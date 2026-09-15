/* FoncierAI-Base de données
auteur : [NDOVYA LUKUNATO JOSUE]
ULPGL : 2025-2026
 */
 -- Création de la table "utilisateurs"

CREATE TABLE utilisateurs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    mot_de_passe VARCHAR(255) NOT NULL,
    role ENUM('acheteur', 'vendeur', 'admin') NOT NULL,
    created_ DATETIME DEFAULT CURRENT_TIMESTAMP
    );
        
    -- Création de la table "parcelles"

CREATE TABLE parcelles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    proprietaiere_id INT NOT NULL,
    superficie float NOT NULL,
    zone VARCHAR(100) NOT NULL,
    localisation VARCHAR(255),
    infrastructure TINYINT DEFAULT 0,
    prix_reel DECIMAL(15, 2) NOT NULL,
    prix_estime DECIMAL(15, 2) NOT NULL,
    statut ENUM('disponible', 'vendue', 'en négociation') DEFAULT 'disponible',
    titre_foncier VARCHAR(255) NOT NULL,
    hash_blockchain VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (proprietaiere_id) REFERENCES utilisateurs(id)
);

-- Création de la table "transactions"
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parcelle_id INT NOT NULL,
    acheteur_id INT NOT NULL,
    vendeur_id INT NOT NULL,
    montant DECIMAL(15, 2) NOT NULL,
    satut ENUM('en_cours', 'terminée', 'annulée') DEFAULT 'en_cours',
    hash_blockchain VARCHAR(255),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parcelle_id) REFERENCES parcelles(id),
    FOREIGN KEY (acheteur_id) REFERENCES utilisateurs(id),
    FOREIGN KEY (vendeur_id) REFERENCES utilisateurs(id)
);

-- Création de la table "evaluations"
CREATE TABLE estimations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    parcelle_id INT NOT NULL,
    superficie FLOAT NOT NULL,
    zone VARCHAR(100) NOT NULL,
    prix_predit DECIMAL(15, 2) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parcelle_id) REFERENCES parcelles(id)
);