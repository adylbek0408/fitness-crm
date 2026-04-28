# HANDOFF — 2026-04-29

## Что сделано в этой сессии

Закрыты оставшиеся задачи модуля обучения (Sprint 5.1, 3.6, 5.5, 5.6
и подготовка по webhook). `python manage.py check` — чисто.

### Backend
- `apps/education/views.py`
  - Добавлен `EducationStatsView` (`GET /api/education/stats/`):
    summary (всего уроков / студентов с доступом / средний % / неактивные),
    список уроков с `viewers_count`, `avg_percent`, `completed_count`,
    список неактивных клиентов (порог в днях), drill-down `?lesson=<uuid>`
    с прогрессом по каждому зрителю.
  - Импорты: `Avg, Count, Max, Q`, `timedelta`, `Client`, `LessonProgress`.
- `apps/education/urls.py` — добавлен `path('stats/', EducationStatsView.as_view())`.
- `apps/education/cabinet_views.py`
  - `CabinetLessonViewSet.get_queryset` теперь поддерживает `?source=stream`
    (только записи эфиров) и `?source=lesson` (только обычные уроки).
    Используется в `StreamArchive.jsx`.

### Frontend
- `pages/admin/education/EducationStats.jsx` — новая страница:
  4 summary-карточки (rose/pink/emerald/amber градиенты), таблица уроков
  со статистикой, фильтры по группе и порогу неактивности, кликабельная
  модалка с прогрессом по каждому студенту, список неактивных студентов
  с группой и датой последнего просмотра.
- `pages/cabinet/education/StreamArchive.jsx` — новая страница записей
  эфиров (`/cabinet/archive`), 3-колоночная сетка как в `LessonsList`,
  бейдж «Запись эфира» rose-500.
- `App.jsx` — роуты `/cabinet/archive` и `/admin/education/stats`.
- `components/AdminLayout.jsx` — пункт «Аналитика» (BarChart3) в сайдбаре.
- `pages/cabinet/CabinetProfile.jsx` — добавлен третий тайл «Архив эфиров»
  (Archive icon, amber→pink gradient), сетка теперь
  `grid-cols-2 sm:grid-cols-3`.

### Документация
- `.claude/E2E_CHECKLIST.md` — полный ручной прогон: 8 разделов
  (подготовка → видео → аудио → эфир → консультация → аналитика →
  безопасность → cross-browser → регрессия). Каждый пункт чекбоксом.
- `.claude/TRAINER_GUIDE.md` — нетехническая инструкция для тренера
  и администратора. Пять частей: видеоурок, аудиоурок, эфир (включая
  настройку OBS), консультация, аналитика. Плюс FAQ.
- `.claude/WEBHOOK_SETUP.md` — пошаговая регистрация webhook'а Cloudflare
  Stream (`PUT /accounts/{id}/stream/webhook`), проверка подписи,
  скрипт ручной отправки тестового события.
- `.claude/PROGRESS.md` — обновлён: 5.1, 3.6, 5.5, 5.6 → `[x]`.

### `.env` (локально, в гите его нет)
Подставлены пустые ключи под все education-переменные с инструкцией
заполнения. Файл в `.gitignore`.

## Не закомичено
Все изменения этой сессии (см. `git status`). Один коммит:
`education: complete sprint 5 (stats, archive, docs)`.

## Что нужно от пользователя
1. **R2:** custom domain бакета `r2bucket` (для `R2_PUBLIC_URL` если хотим
   отдавать аудио через CDN, а не presigned).
2. **CF Stream:**
   - API token (Stream:Edit + Account:Read) → `CF_STREAM_API_TOKEN`.
   - Signing key (Cloudflare Dashboard → Stream → Keys → Create) →
     `CF_STREAM_SIGNING_KEY_ID` + `CF_STREAM_SIGNING_JWK`.
3. **Jitsi:** self-host на `jitsi.crm.aiym-syry.kg` (`apt install jitsi-meet`,
   потом prosody JWT plugin) → `JITSI_APP_SECRET`.
4. **После деплоя:** прогнать `PUT /accounts/{id}/stream/webhook`
   из `.claude/WEBHOOK_SETUP.md`, секрет в `.env` →
   `CF_STREAM_WEBHOOK_SECRET`.
5. **После настройки всех креды:** прогнать `.claude/E2E_CHECKLIST.md`.

## Известные ограничения MVP
- CF Stream upload — single PATCH (`direct_user=true`), до ~300 МБ.
  Для больших файлов — `tus-js-client`.
- EducationStats считается на лету из `LessonProgress` без кэша.
  Тысячи уроков × тысячи клиентов начнут тормозить — тогда materialized
  view или background job.
- `_build_stream_playback_url` в `cabinet_views.py` возвращает
  публичный (неподписанный) HLS URL для лайва. Когда понадобится защита
  лайвов — включить `requireSignedURLs=True` в `create_live_input`
  и использовать тот же signing flow, что и для записей.

## Следующий шаг
1. `git add -A && git commit -m "education: complete sprint 5 (stats, archive, docs)"`.
2. `npm run dev` + `python manage.py runserver` — прокликать новые экраны
   (`/admin/education/stats`, `/cabinet/archive`).
3. Когда будут реальные креды CF / Jitsi — заполнить `.env` и пройти
   `.claude/E2E_CHECKLIST.md`.
4. После боевого теста — отдать `.claude/TRAINER_GUIDE.md` тренерам.
