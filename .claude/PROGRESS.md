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
- [ ] **1.3** CF Stream webhook secret *(после деплоя — см. `.claude/WEBHOOK_SETUP.md`)*
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
- [x] **3.6** `StreamArchive.jsx` (`source=stream` фильтр + плитка в CabinetProfile)
- [ ] **3.7** E2E тест *(требует деплоя CF webhook — см. `.claude/E2E_CHECKLIST.md`)*

## Спринт 4 — Консультации
- [x] **4.1** consultations API + public GET
- [x] **4.2** `ConsultationsAdmin.jsx`
- [x] **4.3** `ConsultationRoom.jsx` (public)
- [x] **4.4** expires/max_uses через `is_consumable`

## Спринт 5 — Полировка
- [x] **5.1** EducationStats — API `/api/education/stats/` + `EducationStats.jsx`
       (карточки, фильтр по группе, drill-down модалка с прогрессом по студентам,
       список неактивных)
- [x] **5.2** Тайлы в `CabinetProfile` (Уроки + Эфир + Архив)
- [x] **5.3** Меню в `AdminLayout` (Уроки + Эфиры + Консультации + Аналитика)
- [x] **5.4** GetCourse-стиль (rose/pink, gradients, скелетоны)
- [x] **5.5** E2E чек-лист (`.claude/E2E_CHECKLIST.md`)
- [x] **5.6** Инструкция тренеру (`.claude/TRAINER_GUIDE.md`)

---

## Решения по ходу
- **2026-04-28** Видеоуроки — Cloudflare Stream Direct Upload (TUS),
  аудио — R2 presigned URL.
- **2026-04-28** Watermark — главный слой защиты, не DRM.
- **2026-04-28** Trainer без User → стримит admin/registrar через staff JWT.
- **2026-04-28** Все cabinet endpoints под `/api/cabinet/education/...`.
- **2026-04-29** Stream archive выделен в отдельную страницу
  `/cabinet/archive` через query-param `?source=stream` на уже существующем
  CabinetLessonViewSet (без новой модели).
- **2026-04-29** EducationStats считается на лету из LessonProgress
  (без отдельной materialized view) — для текущего масштаба этого хватает.

## Что осталось пользователю
1. R2 bucket `r2bucket` + custom domain → `R2_PUBLIC_URL`.
2. CF Stream API token + signing key (id+JWK) → `.env`.
3. Jitsi self-host + JWT secret → `.env`.
4. Зарегистрировать webhook CF Stream → см. `.claude/WEBHOOK_SETUP.md`.
5. E2E прогон по `.claude/E2E_CHECKLIST.md`.
6. **После прогона:** ротировать секреты, которыми мы пользовались
   (R2 access key, CF Stream API token), если они засветились где-то
   в чате/логах.
