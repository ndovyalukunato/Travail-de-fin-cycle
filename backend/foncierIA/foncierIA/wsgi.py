"""
WSGI config for foncierIA project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""
# Fichier utilisé pour un déploiement en production avec un serveur WSGI (Gunicorn, Apache mod_wsgi...).

import os  # accès aux variables d'environnement

from django.core.wsgi import get_wsgi_application  # fabrique l'application WSGI de Django

# Indique à Django quel fichier de configuration utiliser
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'foncierIA.settings')

# Objet appelé par le serveur WSGI pour traiter chaque requête HTTP
application = get_wsgi_application()
