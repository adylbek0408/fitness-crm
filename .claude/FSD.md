# FSD v3 — Образовательный модуль

## 1. Что добавляем

### Модули
- **Видеоуроки** — MP4 загружается через Cloudflare Stream Direct Upload,
  раздаётся как HLS с подписанным токеном (4ч TTL).
- **Аудиоуроки** — MP3/WAV в Cloudflare R2, фронт скачивает через signed URL,
  плеер играет с blob URL (анти-DevTools).
- **Прямые эфиры** — Cloudflare Stream Live Input (RTMP). Учитель стримит
  через OBS. Запись сохраняется автоматически (`recording.mode='automatic'`),
  webhook от CF создаёт `Lesson` из неё. Все участники видят список зрителей.
- **Консультации 1-на-1 по ссылке** — Jitsi self-host. Учитель в админке создаёт
  ссылку `/room/{uuid}`, кидает в WhatsApp. Защита: `expires_at`, `max_uses=2`.
- **Защита контента** — динамический watermark `client.full_name + phone`,
  HLS signed URL, blob URL для аудио, блок ПКМ/F12/PrintScreen, DevTools detect.

### Доступ
- Студенты входят через существующий кабинет (`/cabinet`), JWT type=`cabinet`.
- Видят уроки только своей группы (`Client.group` FK) или по
  `Group.online_subscription_tags ∩ Lesson.subscription_tags`.
- Стримит/загружает админ или регистратор (staff JWT).

## 2. Архитектура

```
[Студент SPA] --cabinet JWT--> [Django /api/cabinet/education/*]
                                        |
[Админ SPA] --staff JWT-----> [Django /api/education/*]
                                        |
                              [EducationService]
                              /        |         \
                       [CF R2]   [CF Stream]   [Jitsi self-host]
                       audio     video+live    consultations
```

## 3. Новый Django app `apps/education/`

```
apps/education/
├── models.py           # Lesson, LessonProgress, LiveStream, StreamViewer, Consultation
├── services.py         # EducationService — обёртки над CF/R2/Jitsi
├── permissions.py      # IsTeacherOrAdmin, IsLessonAccessible
├── serializers.py
├── views.py            # admin/staff endpoints
├── cabinet_views.py    # student endpoints (CabinetJWTAuthentication)
├── urls.py             # /api/education/...
├── cabinet_urls.py     # /api/cabinet/education/...
└── migrations/
```

## 4. Модели

См. `apps/education/models.py` (создаётся в Спринт 1):

- **Lesson** — `lesson_type` (video/audio), `stream_uid` (CF Stream UID),
  `r2_key` (для аудио), `groups` (M2M к Group), `subscription_tags` (JSON),
  `trainer` (FK), `is_published`, `deleted_at`.
- **LessonProgress** — `client`, `lesson`, `last_position_sec`,
  `percent_watched`, `is_completed`. Unique `(client, lesson)`.
- **LiveStream** — `cf_input_uid`, `cf_rtmp_url`, `cf_stream_key` (только тренеру),
  `cf_playback_id`, `recording_uid`, `groups` (M2M), `status`
  (scheduled/live/ended/archived), `archived_lesson` (FK к авто-сохранённому уроку).
- **StreamViewer** — `stream`, `client`, `joined_at`, `left_at`, `is_active`.
- **Consultation** — `room_uuid` (UUID, public), `trainer`, `client` (nullable),
  `expires_at`, `max_uses` (default 2), `used_count`, `status`.

## 5. API

### Admin/Staff `/api/education/...` (auth: simplejwt + IsAdminOrRegistrar)
- `POST /lessons/upload-init/` — создать Lesson, выдать direct upload URL CF Stream
  или presigned R2 URL.
- `POST /lessons/{id}/finalize/` — после загрузки забрать duration/thumbnail.
- `GET/PATCH/DELETE /lessons/{id}/`.
- `POST /streams/` — создать live input в CF Stream → вернуть rtmp+key.
- `POST /streams/{id}/start/`, `/end/`.
- `GET /streams/{id}/viewers/` — для admin-мониторинга.
- `POST /consultations/` — создать ссылку.
- `POST /webhooks/cf-stream/` — webhook от Cloudflare (HMAC-проверка).

### Cabinet `/api/cabinet/education/...` (auth: CabinetJWTAuthentication + IsCabinetClient)
- `GET /lessons/` — список уроков по группе клиента (фильтр type, поиск).
- `GET /lessons/{id}/` — детали + signed URL.
- `POST /lessons/{id}/progress/` — `{position, percent}`.
- `GET /streams/active/` — активный эфир для группы клиента.
- `POST /streams/{id}/join/` — регистрация StreamViewer.
- `POST /streams/{id}/heartbeat/` — каждые 15с.
- `GET /streams/{id}/viewers/` — кто на эфире (требование клиента).

### Public (без auth)
- `GET /api/consultation/{uuid}/` — проверить ссылку, выдать Jitsi JWT.

## 6. Защита контента — слои

| Слой | Что |
|---|---|
| L1 Транспорт | HLS только с signed token CF Stream (4ч TTL) |
| L2 Плеер | hls.js, отключаем download/right-click |
| L3 Watermark | `client.full_name + phone`, движется каждые 6с поверх плеера |
| L4 Disable controls | Блок ПКМ, F12, Ctrl+S, Ctrl+P, PrintScreen |
| L5 Page Visibility | При hidden=true → пауза + warning |
| L6 Audio Blob | MP3 в Blob через `URL.createObjectURL`, источник скрыт |
| L7 DevTools detect | `outerHeight - innerHeight > 200` → пауза |
| L8 DRM | Widevine/FairPlay — НЕ в MVP, закладываем интерфейс |

## 7. Frontend

### Новые npm пакеты
- `hls.js@^1.5` — HLS плеер
- `wavesurfer.js@^7` — аудио
- (Jitsi — через `<script src="https://jitsi.crm.aiym-syry.kg/external_api.js">`)

### Новые страницы

**Кабинет (`frontend-spa/src/pages/cabinet/`):**
- `LessonsList.jsx` → `/cabinet/lessons`
- `LessonView.jsx` → `/cabinet/lessons/:id`
- `StreamLive.jsx` → `/cabinet/stream`
- `StreamArchive.jsx` → `/cabinet/stream/archive`

**Админ (`frontend-spa/src/pages/admin/education/`):**
- `LessonsAdmin.jsx` → `/admin/education/lessons`
- `StreamsAdmin.jsx` → `/admin/education/streams`
- `ConsultationsAdmin.jsx` → `/admin/education/consultations`
- `EducationStats.jsx` → `/admin/education/stats`

**Публичный:**
- `ConsultationRoom.jsx` → `/room/:uuid`

### Существующие файлы — что менять
- `App.jsx` — добавить роуты (НЕ удалять существующие).
- `AdminLayout.jsx` — добавить пункт меню «Обучение».
- `CabinetProfile.jsx` — добавить блоки «Уроки», «Активный эфир».
- `axios.js` — НЕ меняем (cabinet_url detection уже работает).

### Дизайн-система GetCourse-уровня
В `frontend-spa/src/styles/education.css` или через Tailwind config:
- Карточки: `rounded-2xl shadow-md hover:shadow-lg transition`,
  thumbnail 16:9, gradient overlay, прогресс-бар внизу.
- Цветовая палитра: оставляем существующую (Tailwind),
  добавляем accent для education `#7C3AED` (фиолетовый).
- Скелетоны при загрузке.
- Тёмная тема — опционально.

## 8. Инфраструктура

### Cloudflare R2 (хранение аудио)
- Account: `5866c7aaf7b9a7fa88069131398c10ed`
- Bucket: `asylzada-education` (создать)
- Custom domain: `media.crm.aiym-syry.kg` (DNS CNAME → R2)
- API token: создать в CF dashboard, права R/W на bucket.

### Cloudflare Stream (видео + лайв)
- Customer subdomain: `customer-cyusd1ztro8pgq40.cloudflarestream.com`
- API token: создать в CF dashboard, scope = Account → Stream → Edit.
- Webhook URL: `https://crm.aiym-syry.kg/api/education/webhooks/cf-stream/`,
  secret сохраняется в `CF_STREAM_WEBHOOK_SECRET`.
- Signing key: создать через `POST /accounts/{id}/stream/keys`.

### Jitsi self-host
- Поддомен `jitsi.crm.aiym-syry.kg` (DNS A → IP сервера).
- Установка: `apt install jitsi-meet` + Let's Encrypt.
- Включить JWT auth в `/etc/prosody/conf.d/jitsi.crm.aiym-syry.kg.cfg.lua`.

### .env переменные
Добавить (см. `.env.example`):
```
R2_ACCOUNT_ID=5866c7aaf7b9a7fa88069131398c10ed
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=asylzada-education
R2_PUBLIC_URL=https://media.crm.aiym-syry.kg

CF_STREAM_ACCOUNT_ID=5866c7aaf7b9a7fa88069131398c10ed
CF_STREAM_API_TOKEN=
CF_STREAM_CUSTOMER=customer-cyusd1ztro8pgq40
CF_STREAM_WEBHOOK_SECRET=
CF_STREAM_SIGNING_KEY_ID=
CF_STREAM_SIGNING_JWK=

JITSI_DOMAIN=jitsi.crm.aiym-syry.kg
JITSI_APP_ID=asylzada
JITSI_APP_SECRET=
```

### Новые requirements/base.txt
```
boto3==1.34.162
django-storages[s3]==1.14.4
PyJWT[crypto]==2.9.0
cryptography==43.0.1
requests==2.32.3
```

## 9. Спринты (~116 часов)

### Спринт 1 — Фундамент (28ч)
- Создать `apps/education/` skeleton, прописать в settings.
- Все модели + миграции.
- `EducationService`: обёртки над CF Stream API, R2 boto3, Jitsi JWT.
- Webhook endpoint с HMAC-проверкой.
- Permissions, базовые сериализаторы.
- `requirements/base.txt` обновить, `.env.example` обновить.

### Спринт 2 — Видео и аудио уроки (32ч)
- Admin API: upload-init, finalize, CRUD lessons.
- Cabinet API: list, detail (signed URL), progress.
- Frontend admin: LessonsAdmin (загрузка через CF Direct Upload).
- Frontend cabinet: LessonsList, LessonView (hls.js + wavesurfer).
- Watermark, защита контента.

### Спринт 3 — Прямые эфиры (24ч)
- Admin API: streams CRUD, start/end.
- Cabinet API: join, heartbeat, viewers.
- CF Stream webhook → авто-создание Lesson после эфира.
- Frontend admin: StreamsAdmin (RTMP credentials для OBS).
- Frontend cabinet: StreamLive (HLS + список зрителей polling 5с).

### Спринт 4 — Консультации 1-на-1 (14ч)
- Admin API: consultations CRUD, public GET по UUID.
- Frontend admin: ConsultationsAdmin (создать → копировать → WhatsApp).
- Frontend public: ConsultationRoom (Jitsi external_api).
- Логика expires/max_uses.

### Спринт 5 — Аналитика, интеграция, полировка (18ч)
- EducationStats для админа.
- Интеграция в `CabinetProfile.jsx`.
- Меню в `AdminLayout.jsx`.
- UI-полировка (GetCourse-стиль).
- E2E чек-лист.
- Инструкция тренеру (PDF, как стримить через OBS).

## 10. Риски

| Риск | Митигация |
|---|---|
| Jitsi на одном сервере → CPU при 10+ комнатах | Вынести на отдельный VPS если нагрузка |
| Кража видео через запись экрана телефоном | Watermark = психологический барьер |
| Учителю сложно с OBS | 1-страничная инструкция + 30-мин обучение |
| `Trainer` без User | На MVP стримит admin/registrar |
| Нет CF API токенов на старте | Скелет работает с заглушками; реальные API подключаются когда токены готовы |
