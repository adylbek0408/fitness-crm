# HANDOFF — 2026-05-18 (сессия — Live stream 401 fix)

## Что сделано в этой сессии

### 1. Migration 0016 (коммит `3d22c27`)
Удалены 3 устаревших индекса из education-моделей — убрал warning
`makemigrations --check` при каждом деплое.

### 2. Live stream 401 fix (коммит `fe190c3`)

**Причина:** `create_live_input` создаёт CF live input с
`recording.requireSignedURLs: True`. Cloudflare propagates это на весь
live input → HLS (`/manifest/video.m3u8`) и WebRTC (`/webRTC/play`)
требуют подписанный JWT. Бэкенд возвращал сырые URL → 401.

**Фикс:**
- Новый метод `CloudflareStreamService.create_signed_live_urls(uid, client_id)`
  в `apps/education/services.py` — RS256 JWT (тот же ключ что и для VOD),
  `sub` = live input UID, возвращает `{hls_url, webrtc_url}` со встроенным токеном.
- `CabinetStreamView` (GET `/streams/active/`) и `CabinetStreamJoinView`
  (POST `/{id}/join/`) теперь используют `create_signed_live_urls`.
- Проверено через curl: `playback_url` теперь содержит `eyJhbGciOiJSUzI1Ni.../webRTC/play`.

## Незакоммиченные изменения
Нет — всё запушено, задеплоено.

## Текущий статус
- Все изменения в production (`crm.aiym-syry.kg`).
- Гарниcorn перезапущен (12:07:53 UTC), новый код активен.
- Подпись работает: `SIGNING OK` подтверждено на сервере.
- `playback_url` от API возвращает подписанный WebRTC URL.

## Следующий шаг
Протестировать E2E:
1. Запустить эфир с BroadcastPage
2. Ученик открывает `/cabinet/stream` (свежий рефреш)
3. 401 ошибок не должно быть
4. Плеер грузит эфир
