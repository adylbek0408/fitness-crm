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
main: 7698691 — education: fix CF Stream webhook payload parsing
main-1: 3701d62 — education: fix 5 stream/consultation bugs
main-2: 87dd6de — education: Jitsi moderator fix, pro player, content security
main-3: b07b3fb — fix: consultation kicks & stream playback (друг)
```

Все изменения закоммичены. Незакоммиченных файлов нет.

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
