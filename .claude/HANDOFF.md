# HANDOFF — 2026-05-05 (сессия — mobile broadcast + VodPlayer Vidstack 1.x)

## Что сделано в этой сессии

### 1. BroadcastPage — полный редизайн + iOS fix
**Файл:** `frontend-spa/src/pages/admin/education/BroadcastPage.jsx`

- **Instagram/Telegram Live стиль:** тёмный полноэкранный UI, glassmorphism нижний
  контрол-пилюль, пульсирующее lobby-экран.
- **iOS MediaRecorder fix (критично — 90% эфиров с телефона):**
  ```js
  const supportedMime = () => {
    const list = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1',
                  'video/mp4', 'video/webm;codecs=h264,opus', 'video/webm']
    return list.find(t => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } }) || ''
  }
  ```
  Отправляет `.mp4` или `.webm` расширение в соответствии с фактическим MIME.
- **Camera flip** (front/back) через `RTCPeerConnection.getSenders().replaceTrack()`.
- **Z-index bugfix:** cam-off overlay `z-10`, controls теперь `z-20` → controls видны
  когда камера выключена.
- **Текст:** «появится в разделе «Эфиры»» вместо «Уроки».

### 2. ConsultationsAdmin — убрана вкладка «Истекшие»
**Файл:** `frontend-spa/src/pages/admin/education/ConsultationsAdmin.jsx`
- `STATUS_TABS` теперь только: Все / Активные / Завершённые.

### 3. StreamsAdmin — фикс бесконечного ретрая архива
**Файл:** `frontend-spa/src/pages/admin/education/StreamsAdmin.jsx`
- При `cf.recordings_count === 0 && cf.live_input_state !== 'connected'` — прекращает
  ретраи немедленно с понятным сообщением (было: крутилось 40 раз → 10 мин впустую).
- Preview modal: заменён `aspect-video` на `maxHeight: '75dvh'` — portrait-видео
  больше не сжато в 16:9 рамку.

### 4. VodPlayer — Vidstack 1.12.13 + PlyrLayout
**Файлы:** `frontend-spa/src/components/education/VodPlayer.jsx`,
`frontend-spa/src/components/education/VodPlayer.css`,
`frontend-spa/package.json`

- Полный рерайт под Vidstack 1.x API (0.6.x использовал удалённые `MediaOutlet`,
  `MediaCommunitySkin`).
- `MediaProvider` + `PlyrLayout` из `@vidstack/react/player/layouts/plyr`.
- Корректные CSS импорты: `@vidstack/react/player/styles/base.css` + `../plyr/theme.css`.
- prop API сохранён (src, kind, poster, autoPlay, startAt, onTimeUpdate, onReady, live).
- object-fit:contain для portrait-записей, скрытый volume на мобиле.

---

## Что нужно сделать на сервере СЕЙЧАС

```bash
cd /var/www/fitness-crm
git pull origin main
cd frontend-spa
npm install          # устанавливает @vidstack/react@1.12.13
npm run build
cd ..
sudo systemctl restart fitness-crm.service
```

После деплоя проверить:
1. BroadcastPage на iPhone: запустить эфир, выключить камеру — контролы остаются.
   Завершить — запись уходит в CF.
2. Плеер VodPlayer на телефоне: открыть урок — Plyr skin, HLS без буферинга.
3. Preview portrait-видео в StreamsAdmin — не сжато в 16:9.
4. ConsultationsAdmin — нет вкладки «Истекшие».
5. StreamsAdmin — кнопка архива не крутится бесконечно если CF без записи.

---

# HANDOFF — 2026-05-05 (сессия — vidstack player + mobile-first ЛК + dedup StreamViewer)

## Что сделано в этой сессии

### 1. Заменили кастомный HlsPlayer на @vidstack/react VodPlayer
**Файлы:** `frontend-spa/src/components/education/VodPlayer.jsx` (новый),
LessonView, LessonsAdmin, StreamsAdmin (preview-модалка).

- Vidstack community skin (Plyr-style минимализм) даёт нормальные mobile-жесты
  (тап-чтобы-сикнуть, fullscreen orientation, нормальный громкость UI на iOS).
- HLS работает через hls.js (динамически подгружается vidstack'ом).
- Watermark + content-protection остались внешними слоями — поверх плеера.
- HlsPlayer.jsx ОСТАВЛЕН в репо (не удалён) до подтверждения, что vidstack
  работает в проде. Удалить можно после прогона.
- Bundle: VodPlayer chunk = 189KB (58KB gzip), lazy-load.

### 2. Mobile-first редизайн CabinetProfile
**Файл:** `frontend-spa/src/pages/cabinet/CabinetProfile.jsx`

- max-w-md контейнер (телефонная ширина), компактный hero с аватаром.
- LIVE-баннер прибит к шапке когда стрим идёт (не маленький бейджик в плитке).
- Плитки 2-up (Уроки + Архив); плитка «Эфир» появляется только когда нет live.
- Stats-row: бонусы + посещаемость % — то, что студент чаще всего смотрит.
- Посещаемость теперь точечная лента (последние 21 урока) вместо
  горизонтально-скроллящейся таблицы.
- Группа / личные данные / завершённые потоки / детальный лог — в свёрнутых
  секциях.

### 3. Mobile-polish для LessonsList, StreamLive, StreamArchive
- **StreamLive (live):** полноэкранный layout — чёрный фон, top bar с LIVE
  пилюлей и кнопкой счётчика зрителей, видео заполняет экран, заголовок снизу.
  Список зрителей — bottom-sheet drawer (вместо колонки сбоку).
- **StreamLive (non-live):** общий EmptyState компонент для всех 4 состояний
  (ended/scheduled/no-stream/access-denied).
- **LessonsList:** поиск отдельной строкой над табами, табы flex-1 на мобиле.
- **StreamArchive:** одинаковая ширина и spacing с LessonsList.

### 4. Bugfix: StreamViewer dedup + unique constraint
**Файлы:** `apps/education/models.py`,
`apps/education/migrations/0007_streamviewer_unique_together.py`,
`apps/education/cabinet_views.py`

- В таблице `StreamViewer` копились дубликаты (stream, client) — это вызывало
  `MultipleObjectsReturned` на `update_or_create` (уже было в HANDOFF).
- Heartbeat-эндпоинт делал `.create()` без проверки → продолжал плодить дубли.
- **Migration 0007:** для каждой пары (stream, client) оставляет только
  самую свежую запись (по updated_at), затем добавляет unique_together.
- Heartbeat теперь использует `update_or_create` (безопасно при наличии
  constraint).

---

## Что нужно сделать на сервере

```bash
cd /var/www/fitness-crm
git pull origin main
source venv/bin/activate
python manage.py migrate education     # применит 0007
cd frontend-spa && npm install         # vidstack уже зафиксирован в lock
npm run build && cd ..
sudo systemctl restart fitness-crm.service
```

После деплоя:
- Открыть кабинет на телефоне → проверить новый layout.
- Открыть урок → плеер vidstack (Plyr-skin), HLS должен подхватываться.
- Запустить эфир в студии → ученик должен видеть полноэкранный layout.
- Если плеер где-то даёт сбой — откат до HlsPlayer тривиален: 3 импорта
  заменить обратно (компонент в репо остался).

## Следующий шаг — НЕ сделанное в этой сессии

**Raise-hand → ученик в эфире (один из 100+ → говорит с тренером).**
Архитектурная развилка: CF Realtime SFU vs Jitsi vs LiveKit. Пользователь
поставил на паузу. Когда вернёмся: подтвердить выбор, потом 1-2 дня работы:
backend модели (Room, ParticipantInvite, RaiseHand), WS-сигналинг для
тренера, SFU client на фронте, переключение публикации с CF Stream Live
на выбранный SFU.

---

# HANDOFF — 2026-05-04 (сессия — фикс: ученики не видели эфир)

## Корневая проблема и все баги

**Симптом:** ученик заходит на страницу эфира → бесконечная загрузка «Ждём сигнал от тренера».
Админ при этом видит «Cloudflare получает видео ✓».

### Баг 1 — WHEP flow reversed в WebRTCPlayer (корень)
`WebRTCPlayer.jsx` реализовывал WHEP протокол задом наперёд:
- **Было (неверно):** `GET src` → ждёт SDP offer от сервера → создаёт answer → `POST answer`
- **Правильный WHEP:** клиент сам `createOffer()` → `POST offer` на endpoint → сервер отвечает `201 + SDP answer`

Из-за этого Cloudflare возвращал 405 на GET-запрос к `/webRTC/play`.

### Баг 2 — `cf_webrtc_playback_url` содержал HLS URL
В БД поле `cf_webrtc_playback_url` у части стримов содержало `/manifest/video.m3u8` вместо `/webRTC/play`.
`cabinet_views.py` видел непустое поле → отдавал `playback_kind: 'webrtc'` с HLS URL →
`WebRTCPlayer` делал POST на HLS endpoint → `405 Method Not Allowed`.
**Фикс:** добавлена проверка `'/webRTC/play' in url` перед выбором kind.

### Баг 3 — `CabinetStreamJoinView` всегда возвращал HLS URL
`/join/` endpoint всегда вызывал `_build_stream_playback_url()` → отдавал HLS URL.
Фронтенд брал `joined.playback_url` приоритетно, но `playback_kind` из `stream` → WebRTC kind + HLS URL.
**Фикс:** join теперь возвращает правильный URL и `playback_kind` в зависимости от `cf_webrtc_playback_url`.

### Баг 4 — 3 параллельных интервала (active + viewers + heartbeat)
Эффекты в `StreamLive.jsx` имели `[stream?.id, stream?.status]` в deps.
Каждый раз когда polling обновлял `stream` — все 3 эффекта перезапускались,
накапливая интервалы. В DevTools: active(×3), viewers(×3), heartbeat(×2).
**Фикс:** один стабильный интервал (8с) с `deps: [streamId]`, state через `useRef`.

### Баг 5 — 500 на `/join/` (MultipleObjectsReturned)
`StreamViewer.objects.update_or_create(stream=s, client=c)` падал потому что
в БД накопились дублирующиеся записи `StreamViewer` для одной пары (stream, client).
Нет `unique_together` на модели.
**Фикс:** `filter().update()` + `first()` вместо `update_or_create`.

### Баг 6 — iframe embed URL неверный формат
Путь `/embed/{uid}` работает только для VOD-видео.
Для live input правильный формат: `/{uid}/iframe` (подтверждено docs.cloudflare.com/stream).
Это же подтверждено через context7.

### Решение — переход на Cloudflare iframe плеер
Вместо кастомного WebRTC/HLS плеера — официальный Cloudflare iframe.
Он сам выбирает WebRTC или HLS в зависимости от браузера и состояния стрима.

**Откат:** `StreamLive.jsx` строка ~15: `const USE_IFRAME = false`

## Новые файлы
- `frontend-spa/src/components/education/CloudflareStreamPlayer.jsx` — iframe-обёртка

## Изменённые файлы
- `apps/education/cabinet_views.py` — валидация WHEP URL, фикс join (MultipleObjectsReturned)
- `frontend-spa/src/components/education/WebRTCPlayer.jsx` — правильный WHEP flow + fallback
- `frontend-spa/src/pages/cabinet/education/StreamLive.jsx` — один интервал, iframe режим
- `docker-compose.yml` — gunicorn → runserver (auto-reload в dev)

## Следующий шаг
1. Проверить что iframe показывает эфир у ученика
2. Если работает — можно удалить `WebRTCPlayer.jsx` или оставить как запасной вариант
3. Добавить `unique_together = ('stream', 'client')` в `StreamViewer` + миграцию (чтобы закрыть баг 5 навсегда)

---

# HANDOFF — 2026-05-04 (сессия — WebRTC playback для учеников)

## Что сделано в этой сессии

### 1. WebRTC playback для учеников (WHEP вместо HLS)

**Проблема:** При стриме из браузера через WebRTC (WHIP) — ученики не видели эфир (бесконечная загрузка "Ждём сигнал от тренера"). HLS playback возвращал 204 No Content.

**Решение:** Добавлен WebRTC playback (WHEP protocol) для учеников.

**Файлы:**
- `apps/education/models.py` — добавлено поле `cf_webrtc_playback_url`
- `apps/education/services.py` — генерация WHEP URL при создании live input
- `apps/education/views.py` — сохранение `cf_webrtc_playback_url` при создании эфира
- `apps/education/serializers.py` — добавление поля в `LiveStreamSerializer`
- `apps/education/cabinet_views.py` — возврат `playback_kind: 'webrtc'` для live стримов
- `frontend-spa/src/components/education/WebRTCPlayer.jsx` — **новый компонент** WHEP-плеер
- `frontend-spa/src/pages/cabinet/education/StreamLive.jsx` — выбор плеера по `playback_kind`

---

## Что нужно сделать на сервере

```bash
# 1. Стянуть изменения
cd /var/www/fitness-crm
git pull origin main

# 2. Миграция
source venv/bin/activate
python manage.py migrate

# 3. Пересобрать frontend
cd frontend-spa
npm run build
cd ..

# 4. Перезапустить gunicorn
sudo systemctl restart fitness-crm.service
```

**После этого:**
- Пересоздать эфир (чтобы получить новый `cf_webrtc_playback_url`)
- Запустить стрим из студии эфира ("Начать эфир" в браузере)
- Проверить в кабинете ученика — должен работать WebRTC playback

---

## Следующий шаг

1. Проверить что WebRTC playback работает (ученик видит эфир)
2. Проверить запись эфира (после завершения — появляется архив)
3. Проверить консультации (проблема с модератором — нужно проверить JWT)

---

# HANDOFF — 2026-05-03 (сессия 8 — business-logic bugs)

## Что сделано в этой сессии

### 1. Группы: автопереход «Набор» → «Активные» по дате старта
**Файлы:** `apps/groups/views.py`

- На каждый `GET /api/groups/` (и retrieve) запускается `_auto_promote_groups()` — bulk update по индексу `(status, start_date)`. Дешевле cron-задачи и не требует отдельного процесса.
- `auto_update_status` (POST endpoint) тоже починен: добавлен фильтр `deleted_at__isnull=True`, замена per-row `.save()` на `update()`.
- Auto-close active → completed остаётся ручным (есть side-effects: `ClientGroupHistory`, открепление клиентов).

### 2. Уроки: дата создания, раскрытие списка групп, нормальная пагинация
**Файлы:** `frontend-spa/src/pages/admin/education/LessonsAdmin.jsx`

- В карточке появилась дата создания урока (`Calendar` icon + `created_at`).
- Если групп больше 2 — показываются «+N» chevron-кнопка. Раскрытая карточка показывает все группы chip-ами.
- Контролируется снаружи (`expandedGroupsId` в LessonsAdmin) — при открытии одной автоматически закрывается прошлая.
- Пагинация уже была (PAGE_SIZE=12) — теперь работает корректно потому что max_page_size бампнут.

### 3. История чеков: точное время загрузки
**Файлы:** `apps/clients/serializers.py`, `frontend-spa/src/pages/admin/ClientDetail.jsx`, `frontend-spa/src/utils/format.js` (импорт `fmtDate`)

- В `FullPaymentReadSerializer` и `InstallmentPaymentReadSerializer` добавлен `created_at` — точное время загрузки чека.
- В блоке «История чеков» используется `created_at` (если есть) вместо `paid_at`. Формат `fmtDateTime` показывает `DD.MM.YYYY HH:mm`.
- В «История платежей» (рассрочка) под датой платежа добавлена строка «загружен HH:mm» — теперь 3-4 чека за день различимы.

### 4. Корзина: показывает все 272+ записей, не 200
**Файлы:** `apps/statistics/views.py`, `core/pagination.py`

- В `trash_data` убраны хардкод `[:200]` для clients/groups.
- `StandardResultsPagination.max_page_size` = 1000 (было 200). Многие админ-страницы запрашивают `?page_size=500` чтобы получить весь список для клиентского фильтра — раньше тихо клипались до 200.

### 5. Аудит → ещё 3 бага бизнес-логики поправлены

**Файлы:** `apps/groups/services.py`, `apps/clients/services.py`, `apps/education/views.py`

- **Уникальность номера группы**: после soft-delete номер не освобождался (`number=X already exists`, хотя видимой группы нет). Все 3 проверки в `GroupService` теперь с `deleted_at__isnull=True`.
- **Назначение клиента в trash-группу**: 4 точки в `ClientService` (`create_client`, `update_client`, `assign_to_group`, `add_new_client_to_group`, `re_enroll_client`) теперь фильтруют `deleted_at__isnull=True` при `Group.objects.get()`.
- **Webhook CF Stream — гонка двойного архива**: при ретраях Cloudflare два concurrent webhook-а могли создать два дублирующих `Lesson`. Обёрнули в `transaction.atomic()` + `select_for_update()` на `LiveStream`, плюс fallback по `stream_uid` для повторного использования существующего урока.

### 6. Защита ученика от прав модератора (усилена)
**Файл:** `frontend-spa/src/pages/public/ConsultationRoom.jsx` (доп. правки этой сессии — лаконичный strict toolbar, `lockDownToParticipantUI` re-applied на role change и через таймауты после join)

---

## Что сделано в этой сессии (продолжение прерванной сессии)

### 1. CF Stream диагностика — admin сразу видит куда уходит видео
**Файлы:** `apps/education/services.py`, `apps/education/views.py`,
`frontend-spa/src/pages/admin/education/BroadcastPage.jsx`,
`frontend-spa/src/components/education/HlsPlayer.jsx`

- `CloudflareStreamService.get_live_input_status()` — запрос к CF API за состоянием live input (`connected`/`disconnected`) и списком записей с их state/pctComplete.
- Endpoint `GET /api/education/streams/{id}/cf-status/` — отдаёт состояние стрима и записей в JSON.
- `manual_archive` теперь:
  - Тянет `recording_uid` из CF, если webhook не сработал.
  - Возвращает информативный `detail` (HTTPS не настроен / ещё обрабатывается / готова) — не просто «не найдено».
- BroadcastPage:
  - Баннер «Сайт работает по HTTP» если `!window.isSecureContext` — главная причина «эфир не доходит».
  - Polling `/cf-status/` каждые 8с во время эфира — admin видит «Cloudflare получает видео ✓» или предупреждение.
  - Real WebRTC `connectionState` отображается рядом с LIVE-бейджем.
- HlsPlayer: после 18с в waiting пробит manifest URL — показывается понятное сообщение (404 = CF без видео; 5xx = Cloudflare упал; CORS = интернет; ok = поток есть, ждём данных).

### 2. Архив с автодопросом и прогрессом
**Файл:** `frontend-spa/src/pages/admin/education/StreamsAdmin.jsx`

- Кнопка «Создать архив» теперь не одноразовая. Открывается модал, который опрашивает CF + публикует каждые 15с до 10 минут.
- Каждый шаг: «Cloudflare обрабатывает запись (inprogress)…» / «Эфир ещё идёт» / «Запись готова — публикуем…».
- Cancel реально отменяет polling (через ref-и, не закрытием состояния).

### 3. Защита ученика от прав модератора (defence-in-depth)
**Файл:** `frontend-spa/src/pages/public/ConsultationRoom.jsx`

- `lockDownToParticipantUI()` — функция, которая аггресивно перезаписывает конфиг (toolbar, recording, livestreaming, profile, kick).
- Вызывается на `videoConferenceJoined` + повторно через 1с и 3с (Jitsi иногда восстанавливает свои дефолты).
- Вызывается на `participantRoleChanged` — если Prosody всё-таки выдал moderator, UI всё равно остаётся как у участника.
- **ВАЖНО:** настоящее решение — установить prosody-модуль `mod_token_affiliation` на сервере. Без него Jitsi не учитывает claim role/affiliation в JWT.

### 4. Понятная ошибка ученику когда эфир не открывается по ссылке
**Файл:** `frontend-spa/src/pages/cabinet/education/StreamLive.jsx`

- Отдельный экран «Нет доступа к эфиру» (forbidden) и «Эфир не найден» (not_found) с подсказкой.
- Раньше показывал просто «Сейчас эфиров нет» — ученик думал, что ссылка не работает вообще.

### 5. Пагинация в admin-страницах
**Файлы:** `core/pagination.py`, `frontend-spa/src/components/Pagination.jsx`,
`frontend-spa/src/pages/admin/education/{Streams,Consultations,Lessons}Admin.jsx`

- Новый переиспользуемый `<Pagination>` компонент (Prev/Next + номера страниц с эллипсисом).
- StreamsAdmin: серверная пагинация по 12 эфиров на странице (`?page=N&page_size=12`).
- ConsultationsAdmin: серверная пагинация по 15 на странице.
- LessonsAdmin: запрашивает `?page_size=200` (max_page_size бекенда поднят до 200) — клиентская пагинация продолжает работать на всех 200 загруженных уроках.
- Default `max_page_size` бэкенда увеличен с 100 до 200.

---

# HANDOFF — 2026-05-03 (сессия 6 — stream + jitsi + security)

## Что сделано в этой сессии

### 1. Стянули изменения друга (коммит b07b3fb)
- `ConsultationStatusView` возвращает `active=True` для статуса 'used' (чтобы не кикать участников)
- Атомарный инкремент `used_count` через `F()` (устарел — мы не инкрементируем)
- `_build_stream_playback_url` — fallback на `videodelivery.net` если `CF_STREAM_CUSTOMER` не задан
- Migration 0005: сброс слишком низких `max_uses` до 100, восстановление 'used' консультаций

### 2. Jitsi — фикс прав модератора
**Файлы:** `apps/education/services.py`, `frontend-spa/src/pages/public/ConsultationRoom.jsx`

- JWT теперь включает `affiliation: 'owner'/'member'`, `role: 'moderator'/'participant'`
- `enableUserRolesBasedOnToken: true` — Prosody enforces moderator rights via JWT claims
- Ограничение кнопок тулбара для студента (нет записи, эфира, лишних кнопок)
- `videoConferenceJoined` listener — defence-in-depth: перезаписывает конфиг при входе
- `SETTINGS_SECTIONS: ['devices', 'language']` — нет лишних настроек у студента

### 3. GetCourse-style плеер (полный рерайт)
**Файл:** `frontend-spa/src/components/education/HlsPlayer.jsx`

- Кастомные контролы: play/pause, volume slider, scrubber с buffer indicator, quality menu, fullscreen
- Auto-hide controls через 2.5s при воспроизведении
- Quality selector: ABR (авто) + ручной выбор из HLS levels
- `live` prop — скрывает scrubber, показывает красный LIVE dot
- Retry при network error, `manifestLoadingMaxRetry: 10`

### 4. Защита контента
**Файлы:** `frontend-spa/src/components/education/useContentProtection.js`, `Watermark.jsx`

- Mac Cmd-шорткаты (Cmd+S/P/U/Shift+I/J/C/K)
- `window.blur` пауза видео (OBS/QuickTime защита)
- `copy/drag/selectstart` заблокированы
- Print Screen → очистка буфера обмена
- Watermark: 2 слоя — плавающий (каждые 5s) + 4×4 diagonal grid

### 5. Исправление 5 критических багов в стримах/консультациях

**Файлы:** `apps/education/cabinet_views.py`, `apps/education/views.py`, `frontend-spa/src/pages/cabinet/education/StreamLive.jsx`

1. **StreamLive polling bug** — опрос не запускался когда нет активного стрима. Студент не видел эфир даже когда тренер начал стримить. Теперь опрашивает всегда (даже `stream=null`).
2. **Soft-delete не фильтровался** — удалённые стримы были доступны студентам через GET/JOIN/heartbeat/viewers. Добавлен `deleted_at__isnull=True` везде.
3. **Несоответствие прав join/view** — стримы без групп можно было видеть через ?id= ссылку, но нельзя было join. Теперь оба endpoint используют одну логику (группы отсутствуют = доступно всем).
4. **Auto-detect fallback** — если группа студента не совпадает, теперь ищется стрим с нулевым числом групп (доступный всем).
5. **PublicConsultationView + join_as_trainer** — статус 'used' с `ended_at=None` теперь разрешает rejoin (студент может обновить страницу при активной консультации).

### 6. Фикс webhook-парсинга CF Stream
**Файл:** `apps/education/views.py`

`liveInput` в webhook payload CF Stream — это объект `{"uid": "..."}`, не строка. Старый код через `or` захватывал весь dict. Теперь правильно извлекает UID для обоих форматов событий.

### 7. Массовое удаление уроков (bulk delete)
**Файл:** `frontend-spa/src/pages/admin/education/LessonsAdmin.jsx`

- Кнопка «Выбрать», чекбоксы на каждой карточке
- `selectedIds` Set, `performBulkDelete` с `Promise.allSettled`
- Bulk action bar с кнопкой «Удалить (N)» и ConfirmModal

---

## Состояние сервера — что нужно сделать на сервере

```bash
# Подключиться к серверу
ssh root@crm.aiym-syry.kg  # или через панель Timeweb

# 1. Стянуть свежий код
cd /var/www/fitness-crm
git pull origin main

# 2. Активировать venv и накатить миграции
source venv/bin/activate
python manage.py migrate
# Должно применить migration 0005_fix_consultation_max_uses

# 3. Убедиться что CF_STREAM_CUSTOMER задан
grep "CF_STREAM_CUSTOMER" .env
# Должно быть: CF_STREAM_CUSTOMER=customer-cyusd1ztro8pgq40
# Если нет — добавить:
echo "CF_STREAM_CUSTOMER=customer-cyusd1ztro8pgq40" >> .env

# 4. Пересобрать frontend (занимает ~2-3 мин)
cd frontend-spa
npm run build
cd ..

# 5. Перезапустить gunicorn
sudo systemctl restart fitness-crm.service
sudo systemctl status fitness-crm.service  # должен быть active (running)

# 6. Применить Jitsi config для enableUserRolesBasedOnToken
# Если Jitsi настроен:
sudo nano /etc/jitsi/meet/jitsi.crm.aiym-syry.kg-config.js
# Найти и добавить/раскомментировать:
#   enableUserRolesBasedOnToken: true,
# Затем перезапустить Jitsi:
sudo systemctl restart jitsi-videobridge2 prosody jicofo
```

---

## Диагностика стрима (если всё ещё не работает)

```bash
# Проверить какие стримы есть в БД
cd /var/www/fitness-crm
source venv/bin/activate
python manage.py shell -c "
from apps.education.models import LiveStream
for s in LiveStream.objects.all().order_by('-created_at')[:5]:
    print(s.id, s.title[:30], s.status,
          'playback=', s.cf_playback_id[:8] if s.cf_playback_id else 'EMPTY',
          'webrtc=', 'SET' if s.cf_webrtc_url else 'EMPTY',
          'groups=', list(s.groups.values_list('name', flat=True)))
"
# Если cf_playback_id EMPTY — стрим создан когда CF не был настроен.
# Нужно создать новый стрим через админку.
```

---

## Состояние git (после этой сессии)

```
main:   937052a — education: fix 3 bugs — manual archive button, progress reset, lesson nav pagination
main-1: 38ef7d5 — education: fix 3 bugs — edit description data loss, error icon, add recBytes indicator
main-2: af06ed5 — education: fix startBroadcast error path + MediaRecorder audio 160kbps
main-3: 91585bd — education: add retry button for failed recording upload
main-4: 8ca2872 — education: fix cabinet guest-leave missing deleted_at + 3 regression tests
```

Все изменения закоммичены. Незакоммиченных файлов нет.

---

## Что сделано в последней сессии (2026-05-15 — аудит качества)

Полный обход всех файлов education-модуля: frontend (JSX) + backend (views/cabinet_views). Найдено и исправлено 3 бага в коммите `937052a`:

### 1. StreamsAdmin.jsx — мёртвый пропс `onManualArchive`
- `performManualArchive` передавался в `StreamCard` как пропс, но кнопки внутри компонента не было — завершённый стрим без записи нельзя было заархивировать через UI.
- Добавлена кнопка «Архив» (amber) для `isArchived && !hasRecording && !showRecProgress`.

### 2. LessonView.jsx — `lastSavedPercent` не сбрасывался при навигации
- При переходе между уроками реф хранил процент предыдущего урока. Если оба урока достигали одинакового процента, первый `/progress/` POST нового урока молча пропускался.
- Добавлен `lastSavedPercent.current = 0` в начало эффекта `[id, nav]`.

### 3. LessonView.jsx — список уроков обрезался на 25 элементах
- `GET /cabinet/education/lessons/` без `?page_size` возвращал дефолтные 25 (PAGE_SIZE=25 в settings). У студентов с 26+ уроками `currentIdx === -1`, кнопки «Предыдущий/Следующий» не показывались.
- Добавлен `?page_size=200` в запрос списка уроков.

### Аудит (без изменений — баги не найдены):
ConsultationsAdmin, LessonsAdmin, EducationStats, StreamArchive, LessonsList, AudioPlayer, BroadcastPage, UploadContext, recordingStore.js, streamGuestRTC.js, StreamLive, ConsultationRoom, cabinet_views.py, views.py.

82/82 тестов проходят.

---

## Следующий конкретный шаг

Модуль завершён. Если нужна доработка — деплоить через `npm run build` + `systemctl restart fitness-crm`.

---

## Архив прошлых HANDOFF

### HANDOFF — 2026-05-02 (сессия 5 — production fixes)

- `JitsiRoomModal` — подтверждение остановки консультации
- Авто-регенерация истёкших thumbnail URL  
- Thumbnail TTL → 7 дней

### HANDOFF — 2026-05-02 (сессия 3 — production-quality polish)

Масштабная полировка: адаптивность, UX, доступность, производительность.
Главный bundle: ~76 KB gzip + per-page chunks.

### HANDOFF — 2026-05-02 (сессия 2 — pre-polish)

- Thumbnail upload via R2 presigned PUT + Canvas capture
- Metadata edit (PATCH /metadata/)
- BroadcastPage redirect after stream end
- StreamLive ?id= link support
