#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FITNESS CRM — скрипт обновления на сервере                     ║
# ║  Запускать: bash /var/www/fitness-crm/deploy/update.sh          ║
# ╚══════════════════════════════════════════════════════════════════╝
set -e

PROJECT_DIR="/var/www/fitness-crm"
VENV="$PROJECT_DIR/venv/bin"

echo "🔄  [1/6] git pull..."
cd "$PROJECT_DIR"
git pull origin main

echo "📦  [2/6] pip install..."
$VENV/pip install -r requirements/production.txt --quiet

echo "🗄   [3/6] migrate..."
DJANGO_SETTINGS_MODULE=config.settings.production $VENV/python manage.py migrate --noinput

echo "📁  [4/6] collectstatic..."
DJANGO_SETTINGS_MODULE=config.settings.production $VENV/python manage.py collectstatic --noinput --clear

echo "🏗   [5/6] npm build..."
cd "$PROJECT_DIR/frontend-spa"
npm install --silent
npm run build

echo "🔁  [6/6] restart gunicorn..."
systemctl restart fitness-crm

echo "✅  Деплой завершён!"
