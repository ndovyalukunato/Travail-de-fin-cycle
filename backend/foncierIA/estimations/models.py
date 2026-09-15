from django.db import models
from parcelles.models import Parcelle

class Estimation(models.Model):
    parcelle = models.ForeignKey(Parcelle, on_delete=models.CASCADE)
    superficie = models.FloatField()
    zone = models.CharField(max_length=100)
    prix_predit = models.DecimalField(max_digits=15, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Estimation parcelle {self.parcelle.id} - {self.prix_predit} $"