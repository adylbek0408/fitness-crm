# config/development.py

from .base import *

DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = [h.strip() for h in config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')]

CORS_ALLOW_ALL_ORIGINS = True

