# HANDOFF — 2026-04-28

## Что сделано

Полностью реализован модуль обучения **локально**. `python manage.py check`
чистый, миграции `apps/education/migrations/0001_initial.py` применены.

### Backend
- `apps/education/services.py` — `CloudflareStreamService` (TUS direct upload,
  signed HLS URL `https://{customer}.cloudflarestream.com/{token}/manifest/video.m3u8`,
  Live Inputs `recording.mode='automatic'`, HMAC проверка вебхука),
  `R2StorageService` (presigned PUT/GET через boto3 s3v4),
  `JitsiService` (HS256 JWT, `aud=jitsi`, `context.user`).
- `apps/education/views.py` — `LessonAdminViewSet.upload_init/finalize`
  (видео → CF TUS, аудио → R2 PUT), `LiveStreamAdminViewSet` (start/end через CF),
  `ConsultationAdminViewSet`, `CFStreamWebhookView`
  (на `live_input.recording.ready` создаёт архивный Lesson + переносит группы).
- `apps/education/cabinet_views.py` — `CabinetLessonViewSet` с фильтром по
  `Client.group`, signed playback URL + watermark `"first last • phone"`,
  `progress` per item + endpoint обновления; `CabinetStreamViewSet`
  (active/join/heartbeat/viewers); `PublicConsultationView`
  (`expires_at`, `max_uses`, `used_count`, выдача Jitsi JWT).

### Frontend
- `components/education/`: `Watermark.jsx`, `useContentProtection.js`
  (ПКМ, F12, PrintScreen, DevTools detect 1.5с, pause on `document.hidden`),
  `HlsPlayer.jsx` (hls.js + Safari native, `controlsList="nodownload noplaybackrate"`),
  `AudioPlayer.jsx` (fetch → Blob → `URL.createObjectURL`).
- `pages/cabinet/education/`: `LessonsList.jsx` (табы all/video/audio),
  `LessonView.jsx` (плеер + watermark + protection + автосейв ≥1%),
  `StreamLive.jsx` (heartbeat 15с + viewers polling 5с).
- `pages/public/ConsultationRoom.jsx` — `JitsiMeetExternalAPI` с JWT.
- `pages/admin/education/` — `LessonsAdmin`, `StreamsAdmin`, `ConsultationsAdmin`,
  все обёрнуты `<AdminLayout user={user}>` через `useOutletContext()`.
- `App.jsx` — роуты `/cabinet/lessons`, `/cabinet/lessons/:id`,
  `/cabinet/stream`, `/room/:uuid`, `/admin/education/{lessons,streams,consultations}`.
- `CabinetProfile.jsx` — два gradient-тайла (Уроки + Эфир).
- `AdminLayout.jsx` — три новые ссылки в сайдбаре.

## Не закомичено
Все изменения этой сессии (см. `git status`). Один коммит:
`education: implement sprints 1-4 + cabinet/admin UI`.

## Что нужно от пользователя
1. R2 bucket + custom domain.
2. CF Stream API token, signing key id+pem, webhook secret → `.env`
   (`CF_STREAM_*`, `R2_*`).
3. Jitsi self-host → `JITSI_DOMAIN`, `JITSI_APP_ID`, `JITSI_APP_SECRET`.
4. Зарегистрировать вебхук CF Stream на
   `https://crm.aiym-syry.kg/api/education/webhooks/cf-stream/` →
   секрет в `CF_STREAM_WEBHOOK_SECRET`.

## Известные ограничения MVP
- CF Stream upload — single PATCH (`direct_user=true`), до ~300 МБ.
  Для больших файлов — `tus-js-client`.
- StreamArchive отдельной страницы нет — записи в общем `LessonsList`.
- Аналитика обучения (5.1) не сделана.

## Следующий шаг
1. `git add -A && git commit -m "education: implement sprints 1-4 + cabinet/admin UI"`.
2. `npm run dev` + `python manage.py runserver`, прокликать сценарии.
3. Когда будут CF/Jitsi секреты — заполнить `.env` и тест полного пути.
