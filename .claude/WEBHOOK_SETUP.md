# Подключение Cloudflare Stream webhook

Webhook нужен, чтобы CRM **автоматически** создавала архивный урок,
когда заканчивается прямой эфир. Без этого записи эфиров придётся
заводить руками.

## Что делает webhook

Cloudflare шлёт `POST` в наш endpoint при событиях:
1. `live_input.recording.ready` — запись эфира готова → CRM создаёт
   `Lesson` с `lesson_type='video'`, `stream_uid` от записи и
   `archived_lesson` ссылкой на исходный `LiveStream`.
2. `video.ready` — обычный загруженный урок прошёл транскодинг → CRM
   подтягивает `duration_sec` и `thumbnail_url`.

Endpoint у нас: **`POST /api/education/webhooks/cf-stream/`**

Тело подписано HMAC-SHA256 (`Webhook-Signature: time=...,sig1=...`).
Проверка подписи реализована в
`apps/education/services.py::CloudflareStreamService.verify_webhook_signature`.

## Шаги установки

### 1. Сначала задеплоить CRM в прод

Cloudflare требует **публичный HTTPS** URL. На localhost не работает.

```
https://crm.aiym-syry.kg/api/education/webhooks/cf-stream/
```

Проверить, что он отвечает (без подписи получим 401, и это OK):

```bash
curl -X POST https://crm.aiym-syry.kg/api/education/webhooks/cf-stream/ \
  -H 'Content-Type: application/json' \
  -d '{"test": true}'
# → 401 Invalid signature  ← значит endpoint жив и проверяет подпись
```

### 2. Зарегистрировать webhook в Cloudflare

Cloudflare сам генерирует webhook secret и возвращает его в ответе.
Делаем `PUT` (это идемпотентно — вызывайте сколько угодно раз):

```bash
curl -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/webhook" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "notificationUrl": "https://crm.aiym-syry.kg/api/education/webhooks/cf-stream/"
  }'
```

Где:
- `$CF_ACCOUNT_ID` = `5866c7aaf7b9a7fa88069131398c10ed`
  (см. `CLAUDE.md` или `CF_STREAM_ACCOUNT_ID` в `.env`).
- `$CF_API_TOKEN` = ваш Stream API токен с правами `Stream:Edit`.

Ответ:

```json
{
  "result": {
    "notificationUrl": "https://crm.aiym-syry.kg/api/education/webhooks/cf-stream/",
    "modified": "2026-04-29T10:00:00.000Z",
    "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  },
  "success": true,
  "errors": [],
  "messages": []
}
```

**Скопировать `result.secret`** — он показывается только один раз
при первом создании. Если потеряли — повторный `PUT` сгенерит новый
(но старый перестанет работать).

### 3. Положить секрет в `.env`

На сервере:

```bash
sudo -u www-data nano /path/to/fitness-crm/.env
```

Добавить/обновить:

```
CF_STREAM_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Перезапустить gunicorn:

```bash
sudo systemctl restart gunicorn
```

### 4. Проверить, что подпись сходится

Отправить тестовое событие можно прямо из Cloudflare:

1. Открыть **Cloudflare Dashboard → Stream → Webhooks**.
2. Видим зарегистрированный URL.
3. Кнопка **«Send test webhook»** (если есть в UI на момент чтения).

Альтернатива — реальный эфир: создать `LiveStream`, в OBS залить
30-секундный поток, остановить, через 1-3 минуты прилетит
`live_input.recording.ready`.

В логах Django:

```
docker compose logs -f gunicorn  # или
sudo journalctl -u gunicorn -f
```

Должно быть:

```
INFO  apps.education.views: webhook ok event=live_input.recording.ready ...
```

Если видим `Invalid signature` — значит секрет в `.env` не совпадает с
тем, что выдал Cloudflare. Перевыпустить секрет (`PUT` ещё раз) и
обновить `.env`.

## Проверка вручную (без Cloudflare)

Скрипт для генерации тестового запроса с правильной подписью:

```python
# scripts/dev_webhook_call.py
import hmac, hashlib, time, json, requests

URL    = 'http://localhost:8000/api/education/webhooks/cf-stream/'
SECRET = 'whsec_xxxxx'  # тот же, что в .env

body = json.dumps({
    'eventType': 'video.ready',
    'uid':       'test-video-uid',
    'duration':  120,
    'thumbnail': 'https://example.com/thumb.jpg',
}).encode()
ts = int(time.time())
sig = hmac.new(
    SECRET.encode(),
    f'{ts}.'.encode() + body,
    hashlib.sha256,
).hexdigest()
headers = {
    'Webhook-Signature': f'time={ts},sig1={sig}',
    'Content-Type':      'application/json',
}
print(requests.post(URL, data=body, headers=headers).text)
```

Запуск:

```bash
python scripts/dev_webhook_call.py
# → {"ok":true,"unhandled":true}  ← подпись принята, событие не привязано
#   к существующему уроку (test-video-uid)
```

## Сменить URL webhook'а

Просто `PUT` ещё раз с новым `notificationUrl`. Cloudflare выдаст
**новый секрет** — старый протухнет. Не забыть обновить `.env`.

## Удалить webhook

```bash
curl -X DELETE \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/stream/webhook" \
  -H "Authorization: Bearer $CF_API_TOKEN"
```

После этого Cloudflare перестанет слать события — записи эфиров
надо будет заводить руками.

## Подводные камни

- **CSRF:** наш endpoint наследует DRF `APIView` с
  `authentication_classes = []` — DRF не запускает Django CSRF middleware.
  Но если вдруг увидите `403 CSRF verification failed` — значит
  view-сет переключили на `SessionAuthentication`. Не делайте этого.
- **Размер тела:** максимум, который Cloudflare шлёт — десятки КБ.
  Nginx `client_max_body_size` по умолчанию 1m → запас огромный.
- **Retry:** Cloudflare ретраит 5 раз с экспоненциальной паузой при
  не-2xx ответе. Если webhook ушёл в 500 — событие не пропадёт сразу,
  но через час уже не вернётся.
- **Дубликаты:** Cloudflare может прислать один и тот же event дважды
  (at-least-once). Webhook handler в `views.py::CFStreamWebhookView`
  идемпотентный: проверяет `LiveStream.archived_lesson_id` перед
  созданием Lesson, и `Lesson.duration_sec` перед бэкфиллом.
