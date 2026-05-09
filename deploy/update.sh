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
# VPS has limited RAM — bump V8 heap so vite build doesn't OOM-kill itself
# (falls back to old dist/ on success, leaves it intact on failure).
NODE_OPTIONS="--max-old-space-size=3072" npm run build

echo "🔁  [6/6] restart gunicorn..."
systemctl restart fitness-crm

echo "✅  Деплой завершён!"
