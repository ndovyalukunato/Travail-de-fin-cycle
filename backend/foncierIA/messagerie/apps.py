from django.apps import AppConfig  # classe de base pour configurer une application Django


# Configuration de l'application "messagerie" (discussions acheteur <-> vendeur)
class MessagerieConfig(AppConfig):
    name = 'messagerie'  # nom du dossier de l'application
