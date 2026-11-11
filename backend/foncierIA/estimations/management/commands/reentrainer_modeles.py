# ==========================================================
# python manage.py reentrainer_modeles
# Réentraîne tout de suite les modèles d'IA avec les données réelles de
# l'application (ventes validées, dossiers tranchés) : voir ia/apprentissage_continu.py
# ==========================================================
import json

from django.core.management.base import BaseCommand

from ia.apprentissage_continu import reentrainer


class Command(BaseCommand):
    help = "Réentraîne les modèles d'IA avec les données réelles de l'application."

    def handle(self, *args, **options):
        entree = reentrainer('commande manage.py', force=True)
        if entree is None:
            self.stdout.write(self.style.WARNING("Un réentraînement est déjà en cours."))
        else:
            self.stdout.write(json.dumps(entree, ensure_ascii=False, indent=2))
