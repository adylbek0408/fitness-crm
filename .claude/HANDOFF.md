# HANDOFF — 2026-05-03 (сессия 7 — stream diagnostics, archive polling, pagination)

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
