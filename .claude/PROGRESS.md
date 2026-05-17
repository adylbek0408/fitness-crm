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

## Спринт 9 — Player + mobile-first ЛК (2026-05-05)
- [x] **9.1** Заменили кастомный HlsPlayer на @vidstack/react (community skin).
       Новый `VodPlayer.jsx` используется в LessonView + LessonsAdmin
       preview + StreamsAdmin preview. HlsPlayer.jsx остался в репо до
       подтверждения работы vidstack в проде.
- [x] **9.2** Mobile-first редизайн CabinetProfile: max-w-md, LIVE-баннер,
       компактные плитки, stats-row, dot-strip посещаемости, свёрнутые
       секции для второстепенных данных.
- [x] **9.3** StreamLive (cabinet) full-bleed layout для live, EmptyState
       компонент для non-live состояний, bottom-sheet drawer зрителей.
- [x] **9.4** LessonsList + StreamArchive — sticky-header, плотные тайлы,
       active:scale-[0.99] для тач-feedback.
- [x] **9.5** Migration 0007: dedup StreamViewer + unique (stream, client).
       Heartbeat использует update_or_create вместо create.
- [ ] **9.6** Raise-hand (1 ученик из 100+ говорит с тренером в эфире) —
       НА ПАУЗЕ. Требует выбора SFU (CF Realtime / Jitsi / LiveKit) +
       1-2 дня работы. Согласовано с пользователем.

## Спринт 10 — Mobile broadcast + VodPlayer polish (2026-05-05)
- [x] **10.1** ConsultationsAdmin: убрана вкладка «Истекшие», только Все/Активные/Завершённые.
- [x] **10.2** StreamsAdmin manual-archive: перестаёт ретраить если CF не получил
       видеоданных (recordings_count === 0 + state !== connected) — информативное сообщение.
- [x] **10.3** BroadcastPage полный редизайн под Instagram/Telegram Live:
       тёмный полноэкранный UI, glassmorphism нижний контрол, пульсирующее лобби.
       iOS MediaRecorder fix (video/mp4 вместо webm), camera flip через
       RTCPeerConnection.getSenders().replaceTrack(), z-index фикс (cam-off overlay
       перекрывал controls), текст «Эфиры» вместо «Уроки».
- [x] **10.4** StreamsAdmin preview modal: aspect-video → адаптивный maxHeight:75dvh
       (portrait-видео больше не сжато в 16:9 рамку).
- [x] **10.5** VodPlayer → Vidstack 1.12.13 + PlyrLayout: полный рерайт под 1.x API
       (MediaProvider, PlyrLayout, корректные CSS-пути), мобильные tap-targets,
       скрыт volume на мобиле, object-fit:contain для portrait-записей.
       Все call-sites работают без изменений (одинаковый prop API).
- [x] **10.6** Mobile card UX: StreamsAdmin + ConsultationsAdmin — icon-only кнопки
       с title, убраны переполнения текста.

## Спринт 11 — CRM bugfixes (2026-05-16)
- [x] **11.1** Дубли в истории статусов:
       `cancel_payment` теперь логирует смену статуса; `close_group` использует
       `bulk_create` для `ClientStatusHistory` вместо silent `.update()`;
       фраза "поток" → "группа" в заметках.
- [x] **11.2** Система бронирования следующей группы:
       Новая модель `ClientGroupReservation` (migration 0022); методы
       `create_reservation`/`cancel_reservation` в ClientService;
       авто-запись при закрытии группы в `close_group`; поле `active_reservation`
       в `ClientReadSerializer`; API endpoints `reserve-group` / `cancel-reservation`;
       UI панель `ReservationPanel` в admin и mobile `ClientDetail`.
- [x] **11.3** Временны́е метки чеков (мобильный кабинет):
       Используем `created_at` (datetime) вместо `paid_at` (date) в "История чеков".
       Также убраны дубли — рассрочка показывает только платежи с прикреплённым чеком.
- [x] **11.4** Смена статуса для новых/пробных клиентов:
       Убрана статичная заглушка; кнопки/дропдаун теперь показываются для
       ВСЕХ статусов в admin и mobile ClientDetail.
- [x] **11.5** Тоггл is_trial в "Редактировать данные" (admin):
       Панель EditInfoPanel теперь имеет кнопки Обычный/Пробный как на мобиле.
- [x] **11.6** Замороженный клиент без оплаты не попадает в группу без new-payment:
       `canUseNewClientFlow` в admin и mobile теперь требует наличие оплаты (`hasPayment`)
       для frozen-клиентов.

## Спринт 13 — Education business logic audit (2026-05-18)
- [x] **13.1** UX/reliability round (коммит `47a90e3`):
       progress race-condition IntegrityError; keyset prev/next nav; webhook
       replay protection; recordings sorted desc; exponential backoff polling;
       progress retry on failure; retry button on feed error; invite error in modal;
       UploadDock failure header; clipboard fallback
- [x] **13.2** Business logic round (коммит `e85b09a`):
       restore() content-aware publish; manual_archive select_for_update race fix;
       guest invite checks second_group; _regrade_progress wrapped in try/except

## Спринт 12 — CRM bugfixes batch 2 (2026-05-16)
- [x] **12.1** Fix Calendar import crash на mobile ClientDetail (MobileReservationPanel)
- [x] **12.2** История чеков → История платежей; показываем ВСЕ транзакции (с/без чека + дата-время)
       в admin и mobile ClientDetail
- [x] **12.3** Поле `notes` на модели Client (migration 0023); отображается/редактируется
       в admin ClientDetail (EditInfoPanel + инфо-карточка), mobile ClientDetail,
       и форме регистрации ClientRegister (шаг 0)
- [x] **12.4** Сохранение фильтров в sessionStorage в admin Clients.jsx
       (search, status, format, group, page и т.д. — восстанавливаются при возврате)
- [x] **12.5** Все 6 статусов (new/trial/active/frozen/completed/expelled) в STATUS_OPTIONS
       (admin Clients.jsx + mobile ClientDetail.jsx) и STATUS_CONFIG (admin ClientDetail.jsx);
       убран special-case static badge для new/trial в StatusDropdown
- [x] **12.6** Блокировка рассрочников без полной оплаты от уроков/эфиров/архивов:
       helper `_client_has_lesson_access()` в education/cabinet_views.py;
       `has_lesson_access` поле в `/api/cabinet/me/`;
       StreamLive.jsx показывает экран "payment_required"
- [x] **12.7** Вторая группа: поле `second_group` FK на Client (migration 0024);
       уроки и эфиры доступны из обеих групп; helper `_client_group_ids()`;
       обновлён LessonAccessService; UI в admin EditInfoPanel + инфо-карточка
- [x] **12.8** Один сеанс ЛК: поле `session_key` на ClientAccount (migration 0025);
       ротируется при каждом входе в `create_cabinet_tokens()`;
       JWT содержит session_key; `CabinetJWTAuthentication.authenticate()` отклоняет
       токены с устаревшим session_key

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
