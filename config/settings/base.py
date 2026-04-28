import os
from pathlib import Path
from datetime import timedelta

from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config('SECRET_KEY', default='django-insecure-change-me-in-production')

DEBUG = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = [h.strip() for h in config('ALLOWED_HOSTS', default='localhost,127.0.0.1').split(',')]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'django_filters',
    'core',
    'apps.accounts',
    'apps.clients',
    'apps.payments',
    'apps.groups',
    'apps.attendance',
    'apps.trainers',
    'apps.statistics',
    'apps.education',
    'rest_framework_simplejwt.token_blacklist',
]


# ---------------------------------------------------------------------------
# Education module — external services
# Cloudflare R2 (audio storage), Cloudflare Stream (video + live), Jitsi.
# Empty defaults are safe: services raise NotImplementedError until wired up.
# ---------------------------------------------------------------------------

R2_ACCOUNT_ID = config('R2_ACCOUNT_ID', default='')
R2_ACCESS_KEY_ID = config('R2_ACCESS_KEY_ID', default='')
R2_SECRET_ACCESS_KEY = config('R2_SECRET_ACCESS_KEY', default='')
R2_BUCKET = config('R2_BUCKET', default='asylzada-education')
R2_PUBLIC_URL = config('R2_PUBLIC_URL', default='')

CF_STREAM_ACCOUNT_ID = config('CF_STREAM_ACCOUNT_ID', default='')
CF_STREAM_API_TOKEN = config('CF_STREAM_API_TOKEN', default='')
CF_STREAM_CUSTOMER = config('CF_STREAM_CUSTOMER', default='')
CF_STREAM_WEBHOOK_SECRET = config('CF_STREAM_WEBHOOK_SECRET', default='')
CF_STREAM_SIGNING_KEY_ID = config('CF_STREAM_SIGNING_KEY_ID', default='')
CF_STREAM_SIGNING_JWK = config('CF_STREAM_SIGNING_JWK', default='')

JITSI_DOMAIN = config('JITSI_DOMAIN', default='')
JITSI_APP_ID = config('JITSI_APP_ID', default='asylzada')
JITSI_APP_SECRET = config('JITSI_APP_SECRET', default='')

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

WSGI_APPLICATION = 'config.wsgi.application'

AUTH_USER_MODEL = 'accounts.User'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='fitness_crm'),
        'USER': config('DB_USER', default='postgres'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'Asia/Tashkent'

USE_I18N = True

USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardResultsPagination',
    'PAGE_SIZE': 25,
    'EXCEPTION_HANDLER': 'core.exception_handler.custom_exception_handler',
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=12),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=30),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,   # старые refresh блокируются после ротации
    'UPDATE_LAST_LOGIN': True,           # обновляет last_login при каждом входе
}
