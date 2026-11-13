from django.apps import AppConfig  # classe de base pour configurer une application Django


# Configuration de l'application "estimations" (historique des estimations IA)
class EstimationsConfig(AppConfig):
    name = 'estimations'  # nom du dossier de l'application

    def ready(self):
        # Apprentissage continu automatique, en arrière-plan, uniquement pour le serveur web
        # (pas pendant les tests, les migrations ni dans le processus de surveillance de runserver)
        import os
        import sys
        commande = sys.argv[1] if len(sys.argv) > 1 else ''
        serveur_web = commande not in ('test', 'makemigrations', 'migrate', 'shell', 'reentrainer_modeles')             and (commande != 'runserver' or os.environ.get('RUN_MAIN') == 'true')
        if serveur_web:
            from ia.apprentissage_continu import demarrer_surveillance
            demarrer_surveillance()

