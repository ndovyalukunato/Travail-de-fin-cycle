#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
# Point d'entrée en ligne de commande du projet Django
# (ex. : python manage.py runserver, python manage.py migrate).
import os  # accès aux variables d'environnement du système
import sys  # accès aux arguments passés en ligne de commande


def main():
    """Run administrative tasks."""
    # Indique à Django quel fichier de configuration utiliser (foncierIA/settings.py)
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'foncierIA.settings')
    try:
        # Importe la fonction qui exécute les commandes Django
        from django.core.management import execute_from_command_line
    except ImportError as exc:
        # Django n'est pas installé (ou l'environnement virtuel n'est pas activé)
        raise ImportError(
            "Couldn't import Django. Are you sure it's installed and "
            "available on your PYTHONPATH environment variable? Did you "
            "forget to activate a virtual environment?"
        ) from exc
    # Exécute la commande demandée (runserver, migrate, makemigrations...)
    execute_from_command_line(sys.argv)


# Ce bloc ne s'exécute que si le fichier est lancé directement
if __name__ == '__main__':
    main()
