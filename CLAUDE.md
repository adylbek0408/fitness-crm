# Asylzada Fitness CRM — Education Module

Расширяем существующий Django + React CRM (фитнес-школа) новым модулем
обучения: видеоуроки, аудиоуроки, прямые эфиры с автозаписью, 1-на-1
консультации по ссылке.

## Стек
- **Backend:** Django 4.2 + DRF + PostgreSQL, кастомный User (`accounts.User`).
- **Frontend:** React 18 + Vite + Tailwind + react-router v6.
- **Auth:** ДВЕ JWT-системы:
  - Staff (`simplejwt`) — admin/registrar — endpoints `/api/...`.
  - Cabinet (custom HS256, claim `type='cabinet'`) — студенты — `/api/cabinet/...`.
  - Frontend axios сам подставляет нужный токен по префиксу URL
    (см. `frontend-spa/src/api/axios.js`).
- **Внешние сервисы:** Cloudflare R2 (хранение аудио), Cloudflare Stream
  (видео+лайв с автозаписью), Jitsi Meet self-host (1-на-1 консультации).

## Критичные факты для работы
1. **Не ломать существующее.** CRM в проде на `crm.aiym-syry.kg`.
   Все изменения — аддитивные. Никаких правок в `apps/clients/`, `apps/groups/`
   и т.д. кроме явного согласования в FSD.
2. **`Client.group` (FK)** уже даёт фильтрацию уроков по группе студента.
3. **`Trainer` НЕ связан с Django User** — для MVP стримит/загружает
   admin или registrar через staff JWT.
4. **Все модели наследуют `core.models.UUIDTimestampedModel`** (`id=UUID`,
   `created_at`, `updated_at`).
5. **Soft delete через `deleted_at`** — паттерн проекта.
6. **Сервис-слой** (`core.services.BaseService`) — бизнес-логика отдельно от views.

## Команды
```bash
# Backend
cd fitness-crm
source ../.venv/bin/activate
python manage.py makemigrations education
python manage.py migrate
python manage.py runserver

# Frontend
cd frontend-spa
npm install
npm run dev
```

## Где что лежит
- **Полный план работ:** `.claude/FSD.md`
- **Текущий прогресс по спринтам:** `.claude/PROGRESS.md`
- **Что было в последней сессии:** `.claude/HANDOFF.md`
- **Existing patterns reference:** `apps/clients/cabinet_auth.py`,
  `apps/clients/cabinet_views.py`, `apps/clients/cabinet_urls.py` —
  ОБРАЗЕЦ для нового модуля.

## Правила работы Claude в этом проекте
1. **Перед стартом сессии:** прочитать `.claude/PROGRESS.md`,
   `.claude/HANDOFF.md`, `git log -20 --oneline`, `git status`.
2. **Каждая задача = отдельный коммит.** Сообщение по формату:
   `education: <что сделано>` (например `education: add Lesson model`).
3. **После каждой задачи:** обновить `.claude/PROGRESS.md` (отметить ✅).
4. **В конце сессии:** обновить `.claude/HANDOFF.md` — что сделано,
   что не закомичено, следующий конкретный шаг.
5. **Не оставлять uncommitted changes** без записи в HANDOFF.md.
6. **Не трогать чужой код** без явного согласия пользователя.

## Внешние идентификаторы (не секреты, видны в URL)
- Cloudflare R2 account ID: `5866c7aaf7b9a7fa88069131398c10ed`
- Cloudflare R2 endpoint: `https://5866c7aaf7b9a7fa88069131398c10ed.r2.cloudflarestorage.com`
- Cloudflare Stream customer subdomain: `customer-cyusd1ztro8pgq40.cloudflarestream.com`

API токены, ключи доступа R2, секреты Stream — лежат только в `.env` на сервере
и локально, никогда не в git. Шаблон — в `.env.example`.

## Деплой
- Сервер: Timeweb VPS (домен `crm.aiym-syry.kg`).
- Nginx + Gunicorn (см. `deploy/nginx.conf`, `deploy/gunicorn.service`).
- Jitsi: отдельный поддомен `jitsi.crm.aiym-syry.kg` (ставится `apt install jitsi-meet`).
