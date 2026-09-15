from django.db import models
from django.contrib.auth.hashers import make_password, check_password as check_password_hash


class Utilisateur(models.Model):
    ROLE_CHOICES = [
        ('acheteur', 'Acheteur'),
        ('vendeur', 'Vendeur'),
        ('admin', 'Admin'),
    ]

    nom = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    mot_de_passe = models.CharField(max_length=255)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    adresse_ethereum = models.CharField(max_length=42, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    is_authenticated = True
    is_anonymous = False

    def set_password(self, mot_de_passe_clair):
        """Hache et stocke le mot de passe."""
        self.mot_de_passe = make_password(mot_de_passe_clair)

    def check_password(self, mot_de_passe_clair):
        """Compare un mot de passe en clair au hash stocké."""
        return check_password_hash(mot_de_passe_clair, self.mot_de_passe)

    def __str__(self):
        return f"{self.nom} ({self.role})"