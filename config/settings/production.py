from decouple import config
from .base import *

DEBUG = False

ALLOWED_HOSTS = [h.strip() for h in config('ALLOWED_HOSTS', default='').split(',')]

CORS_ALLOWED_ORIGINS = [o.strip() for o in config('CORS_ALLOWED_ORIGINS', default='').split(',')]

# SSL — включить ПОСЛЕ настройки certbot
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
# SECURE_SSL_REDIRECT = True   # включить после certbot
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
