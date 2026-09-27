from django.db import models  # outils pour définir les tables de la base de données
# Fonctions de Django pour hacher et vérifier les mots de passe
from django.contrib.auth.hashers import make_password, check_password as check_password_hash


# Table des utilisateurs de l'application (acheteurs, vendeurs, administrateurs)
class Utilisateur(models.Model):
    # Rôles possibles : (valeur stockée en base, libellé affiché)
    ROLE_CHOICES = [
        ('acheteur', 'Acheteur'),
        ('vendeur', 'Vendeur'),
        ('admin', 'Admin'),
    ]

    nom = models.CharField(max_length=100)  # nom complet
    email = models.EmailField(unique=True)  # email unique, sert d'identifiant de connexion
    mot_de_passe = models.CharField(max_length=255)  # mot de passe HACHÉ (jamais en clair)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)  # acheteur / vendeur / admin
    # Adresse du portefeuille Ethereum (Ganache), nécessaire pour enregistrer une vente sur la blockchain
    adresse_ethereum = models.CharField(max_length=42, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)  # date de création, remplie automatiquement

    # Attributs attendus par Django REST Framework pour un utilisateur connecté
    is_authenticated = True
    is_anonymous = False

    def set_password(self, mot_de_passe_clair):
        """Hache et stocke le mot de passe."""
        # make_password transforme le mot de passe en empreinte sécurisée (PBKDF2)
        self.mot_de_passe = make_password(mot_de_passe_clair)

    def check_password(self, mot_de_passe_clair):
        """Compare un mot de passe en clair au hash stocké."""
        # Renvoie True si le mot de passe saisi correspond à l'empreinte enregistrée
        return check_password_hash(mot_de_passe_clair, self.mot_de_passe)

    # Texte affiché quand on imprime un utilisateur (ex. : "Gloria (vendeur)")
    def __str__(self):
        return f"{self.nom} ({self.role})"
