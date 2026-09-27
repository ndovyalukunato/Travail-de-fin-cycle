"""
ASGI config for foncierIA project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""
# Fichier utilisé seulement pour un déploiement asynchrone (serveur ASGI comme Daphne ou Uvicorn).
# En développement, "python manage.py runserver" ne l'utilise pas.

import os  # accès aux variables d'environnement

from django.core.asgi import get_asgi_application  # fabrique l'application ASGI de Django

# Indique à Django quel fichier de configuration utiliser
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'foncierIA.settings')

# Objet appelé par le serveur ASGI pour traiter chaque requête
application = get_asgi_application()
