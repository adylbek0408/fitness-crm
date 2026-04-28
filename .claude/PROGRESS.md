# Прогресс по спринтам

Формат: `[ ]` — не начато, `[~]` — в работе, `[x]` — готово.

---

## Спринт 1 — Фундамент
- [x] **1.1** Скелет `apps/education/`
- [x] **1.6** Модели (Lesson, LessonProgress, LiveStream, StreamViewer, Consultation)
- [x] **1.0** Handoff-инфраструктура
- [x] **1.0b** requirements + .env.example
- [x] **1.0c** Роуты в config/urls.py
- [ ] **1.2** R2 bucket DNS *(на пользователе)*
- [ ] **1.3** CF Stream webhook secret *(после деплоя)*
- [ ] **1.4–1.5** Jitsi self-host *(на пользователе)*
- [x] **1.7** `services.py` — CF Stream + R2 + Jitsi JWT
- [x] **1.8** Jitsi JWT генерация
- [x] **1.9** Webhook `/api/education/webhooks/cf-stream/` с HMAC
- [x] **1.10** Permissions (DRF `IsAuthenticated` + cabinet auth)
- [x] **1.11** Миграции прошли, `manage.py check` чистый

## Спринт 2 — Видео и аудио уроки
- [x] **2.1** `lessons/upload-init/` + `finalize/`
- [x] **2.2** cabinet lessons list + detail (signed URL)
- [x] **2.3** progress endpoint
- [x] **2.4** `LessonsAdmin.jsx`
- [x] **2.5** `LessonsList.jsx`
- [x] **2.6** `LessonView.jsx` (hls.js + audio blob)
- [x] **2.7** Watermark
- [x] **2.8** Блокировки + DevTools detect (`useContentProtection`)
- [x] **2.9** Audio blob URL
- [x] **2.10** Прогресс автосохранение (delta ≥1%)

## Спринт 3 — Прямые эфиры
- [x] **3.1** streams CRUD + start/end (CF Live Input)
- [x] **3.2** join/heartbeat/viewers
- [x] **3.3** Webhook `live_input.recording.ready` → авто-Lesson
- [x] **3.4** `StreamsAdmin.jsx` (RTMP+Key reveal)
- [x] **3.5** `StreamLive.jsx` + viewers polling
- [ ] **3.6** `StreamArchive.jsx` *(записи показываются в общем LessonsList — отдельная страница не критична)*
- [ ] **3.7** E2E тест *(требует деплоя CF webhook)*

## Спринт 4 — Консультации
- [x] **4.1** consultations API + public GET
- [x] **4.2** `ConsultationsAdmin.jsx`
- [x] **4.3** `ConsultationRoom.jsx` (public)
- [x] **4.4** expires/max_uses через `is_consumable`

## Спринт 5 — Полировка
- [ ] **5.1** EducationStats
- [x] **5.2** Тайлы в `CabinetProfile`
- [x] **5.3** Меню в `AdminLayout`
- [x] **5.4** GetCourse-стиль (rose/pink, gradients, скелетоны)
- [ ] **5.5** E2E чек-лист
- [ ] **5.6** Инструкция тренеру

---

## Решения по ходу
- **2026-04-28** Видеоуроки — Cloudflare Stream Direct Upload (TUS),
  аудио — R2 presigned URL.
- **2026-04-28** Watermark — главный слой защиты, не DRM.
- **2026-04-28** Trainer без User → стримит admin/registrar через staff JWT.
- **2026-04-28** Все cabinet endpoints под `/api/cabinet/education/...`.

## Что осталось пользователю
1. R2 bucket `r2bucket` + custom domain.
2. CF Stream API token + signing key + webhook secret → `.env`.
3. Jitsi self-host + JWT secret → `.env`.
4. Зарегистрировать webhook CF Stream на
   `https://crm.aiym-syry.kg/api/education/webhooks/cf-stream/`.
5. E2E прогон: видео → урок, эфир → запись → авто-урок, ссылка → Jitsi.
