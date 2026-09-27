from django.db import models  # outils pour définir les tables de la base de données
from parcelles.models import Parcelle  # une estimation est toujours liée à une parcelle

# Table qui garde l'historique des prix prédits par l'IA pour chaque parcelle
class Estimation(models.Model):
    # Parcelle estimée ; si la parcelle est supprimée, ses estimations le sont aussi (CASCADE)
    parcelle = models.ForeignKey(Parcelle, on_delete=models.CASCADE)
    superficie = models.FloatField()  # superficie utilisée pour la prédiction (en m²)
    zone = models.CharField(max_length=100)  # lotissement utilisé pour la prédiction
    prix_predit = models.DecimalField(max_digits=15, decimal_places=2)  # prix moyen prédit (LR + RF)
    created_at = models.DateTimeField(auto_now_add=True)  # date de l'estimation

    # Texte affiché quand on imprime une estimation
    def __str__(self):
        return f"Estimation parcelle {self.parcelle.id} - {self.prix_predit} $"
