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

## Спринт 7 — Server deploy + bugfixes (2026-05-02)
- [x] **7.1** Полный деплой на сервер (git pull, migrate, npm build, gunicorn TCP, nginx)
- [x] **7.2** Systemd-сервис `fitness-crm.service` (auto-restart)
- [x] **7.3** CF Stream webhook зарегистрирован (`/api/education/cf-webhook/`)
- [x] **7.4** LessonsAdmin: stream-уроки скрыты из основного списка
- [x] **7.5** StreamLive.jsx: экран "Эфир завершён" при окончании стрима
- [x] **7.6** ConsultationsAdmin: подтверждение перед закрытием + авто-стоп
       консультации через keepalive-fetch при закрытии/уходе со страницы
- [x] **7.7** Jitsi fallback: кнопка "Открыть в браузере" для случаев
       когда встроенный Jitsi не подключается
- [x] **7.8** Thumbnail: авто-регенерация истёкших presigned URL в сериализаторе;
       TTL увеличен до 7 дней

## Спринт 6 — Production-quality polish (2026-05-02)
- [x] **6.1** AdminLayout: drawer-меню для мобилки (≤ lg) с ESC/overlay/blockScroll/aria
- [x] **6.2** Убран двойной padding во всех админских страницах
       (LessonsAdmin/StreamsAdmin/ConsultationsAdmin/EducationStats)
- [x] **6.3** Адаптивные tap-targets ≥ 40px, кнопки full-width на mobile, focus-rings
- [x] **6.4** ConsultationRoom: `height: '100%'` вместо `window.innerHeight`,
       100dvh, `role="alert"` для ошибок, label/id связки
- [x] **6.5** CabinetProfile hero — sm/lg breakpoints, max-w расширен с xl до 3xl
       на больших экранах
- [x] **6.6** AlertModal/ConfirmModal: focus-management, body-scroll lock,
       role=dialog/aria-modal/aria-labelledby/aria-describedby
- [x] **6.7** ErrorBoundary на корне App.jsx (показывает понятный экран
       вместо белого при необработанной ошибке)
- [x] **6.8** Lazy-routes: все админские, кабинетные, mobile, public страницы
       через React.lazy + Suspense с RouteFallback. Главный bundle 76 KB gzip,
       страницы — отдельные chunks 1–10 KB.
- [x] **6.9** BroadcastPage: адаптивные controls (flex-wrap, 100dvh,
       ARIA-pressed на toggle-кнопках)
- [x] **6.10** Иконкам добавлен `aria-hidden`, кнопкам без текста — `aria-label`

## Спринт 8 — Bugfixes (2026-05-04)
- [x] **8.1** WebRTC playback для учеников (WHEP вместо HLS)
       - добавлено поле `cf_webrtc_playback_url` в LiveStream
       - создан компонент `WebRTCPlayer.jsx`
       - обновлён `StreamLive.jsx` для использования WebRTC при live
- [x] **8.2** Ученики не видели эфир — диагностика и полный фикс (см. HANDOFF)
       - 6 взаимосвязанных багов, корень: WHEP flow в WebRTCPlayer был reversed
       - Добавлен iframe-плеер (CloudflareStreamPlayer) с откатом через USE_IFRAME
       - Исправлен 500 на /join/ (MultipleObjectsReturned в StreamViewer)
       - Исправлен бесконечный polling (3+3+2 интервала → 1 стабильный)
       - Docker auto-reload: gunicorn → runserver

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
