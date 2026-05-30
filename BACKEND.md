# Backend — Asylzada Fitness CRM

Django 4.2 + Django REST Framework + PostgreSQL. REST API под префиксом `/api/`. Обзор проекта: [README.md](README.md). Frontend: [frontend-spa/README.md](frontend-spa/README.md).

---

## Назначение Backend

Backend отвечает за:

- Хранение и целостность данных CRM (клиенты, группы, оплаты, посещаемость).
- Авторизацию staff (админ/регистратор) и учеников (кабинет).
- Бизнес-правила (бонусы, статусы клиентов, закрытие потоков, доступ к урокам по группе).
- Интеграции с Cloudflare R2/Stream, Jitsi, Google OAuth.
- Webhook'и и фоновую обработку записей эфиров.

Активный UI — отдельная SPA; legacy Django-template приложения `apps/admin_panel` и `apps/frontend` **не** подключены в `INSTALLED_APPS`.

---

## Архитектура Backend

Проект следует слоистой схеме DRF без отдельного слоя Repository:

| Слой | Где | Роль |
|------|-----|------|
| **Routes** | `config/urls.py`, `apps/*/urls.py` | Маршрутизация, routers |
| **Views / ViewSets** | `apps/*/views.py`, `cabinet_views.py` | HTTP, permissions, вызов сервисов |
| **Serializers** | `apps/*/serializers.py` | Валидация входа, сериализация ответа |
| **Services** | `apps/*/services.py`, `bonus_service.py` | Бизнес-логика, транзакции |
| **Models** | `apps/*/models.py` | Схема БД, ORM |
| **Permissions** | `core/permissions.py`, `apps/*/permissions.py` | `IsAdmin`, `IsCabinetClient`, … |
| **Filters** | `apps/*/filters.py` | Query-параметры списков |
| **Middleware** | `config/settings/base.py` | Security, CORS, Session, CSRF |
| **Exception handler** | `core/exception_handler.py` | `ValidationError`, `NotFoundError` → HTTP |

**DTO** как отдельные классы не используются — роль DTO выполняют serializers + `validated_data`.

**Validators** — в serializers (`validate_*`) и в сервисах (raise `core.exceptions.ValidationError`).

---

## База данных

ORM Django. Основные таблицы (app_label → model):

### accounts

| Модель | Таблица | Описание |
|--------|---------|----------|
| `User` | `accounts_user` | Staff: `role` ∈ `admin`, `registrar`; extends `AbstractUser` |
| `ManagerProfile` | `accounts_managerprofile` | Профиль регистратора, `password_plain` для показа админу, soft delete |

### clients

| Модель | Связи / ограничения |
|--------|---------------------|
| `Client` | FK → `Group`, `second_group`, `Trainer`, `User` (registered_by); `phone` unique; indexes на status, group, … |
| `ClientAccount` | OneToOne → `Client`; `username` unique; `session_key` для JWT |
| `ClientGroupHistory` | История потока при закрытии группы |
| `ClientStatusHistory` | Лог смены статуса |
| `ClientGroupReservation` | Бронь следующей группы |
| `BonusTransaction` | accrual / redemption |
| `ClientEnrollment` | Параллельная запись в группу |
| `EnrollmentPayment` | Платежи по enrollment |

**Статусы клиента:** `new`, `trial`, `active`, `active_frozen`, `completed`, `expelled`, `frozen`.

### groups

| Модель | Поля |
|--------|------|
| `Group` | `number` unique, `training_format` offline/online, `online_subscription_tags` JSON, `status` recruitment/active/completed, soft delete |

### trainers

| `Trainer` | Не FK на User; `is_active`, расписание текстом |

### payments

| Модель | Связи |
|--------|-------|
| `FullPayment` | FK → Client; `receipt` ImageField |
| `InstallmentPlan` | FK → Client; свойства `total_paid`, `remaining`, `is_closed` |
| `InstallmentPayment` | FK → Plan; index `(plan, paid_at)` |
| `RefundLog` | Аудит возвратов |

### attendance

| `Attendance` | FK → Client; **UniqueConstraint** `(client, lesson_date)` |

### education

| Модель | Назначение |
|--------|------------|
| `Lesson` | video / audio / text; `stream_uid`, `r2_key`, M2M `groups`, `subscription_tags` |
| `LessonProgress` | **unique_together** `(client, lesson)` |
| `LiveStream` | CF Live Input, статусы scheduled/live/ended/archived |
| `StreamViewer` | **unique_together** `(stream, client)` |
| `StreamChatMessage` | Чат эфира |
| `StreamGuest` | Гость на сцене, WebRTC SDP/ICE |
| `Consultation` | `room_uuid` unique, Jitsi, `max_uses`, `expires_at` |

### core

| `SystemSetting` | key-value настройки в Django Admin |
| `UUIDTimestampedModel` | abstract: `id` UUID, `created_at`, `updated_at` |

### statistics

| `Statistic` | Простая метрика (имя + value); аналитика в основном считается в `StatisticsViewSet` из других таблиц |

### Индексы и soft delete

- Повсеместно `deleted_at` для Client, Group, Lesson, LiveStream, Consultation, ManagerProfile.
- Дополнительные индексы в миграциях education (`0014_add_performance_indexes`, и др.).

---

## Авторизация и безопасность

### Staff JWT (SimpleJWT)

- **Получение:** `POST /api/accounts/token/` (`CustomTokenObtainPairView`).
- **Refresh:** `POST /api/accounts/token/refresh/` с ротацией и blacklist (`BLACKLIST_AFTER_ROTATION`).
- **Lifetime:** access 12h, refresh 30d (`config/settings/base.py` → `SIMPLE_JWT`).
- **По умолчанию:** все API требуют `IsAuthenticated`, кроме явно `AllowAny`.

Роли проверяются в permissions:

```python
# core/permissions.py
class IsAdmin(BasePermission): ...
class IsAdminOrRegistrar(BasePermission): ...
```

Регистратор видит только своих клиентов (`ClientViewSet.get_queryset` фильтрует по `registered_by` / `registered_by_name`).

### Cabinet JWT (кастомный)

- Реализация: `apps/clients/cabinet_auth.py` (PyJWT, HS256, `SECRET_KEY`).
- Payload access: `{ client_id, type: 'cabinet', session_key, exp, iat }`.
- `CabinetJWTAuthentication` → `request.user` = **`ClientAccount`** (не Django User).
- Refresh: `POST /api/cabinet/token/refresh/` — отдельный view, только refresh payload.
- **Single session:** новый login обновляет `session_key` в БД; старые токены отклоняются.

### Google OAuth (кабинет)

- `POST /api/cabinet/google-auth/` с `{ "credential": "<Google ID token>" }`.
- Backend проверяет token через Google (`GOOGLE_CLIENT_ID`).
- Сопоставление: `google_id` → `google_email` → 404 если не найден.

### Throttling

```python
'cabinet_login': '10/minute'  # CabinetLoginThrottle
'anon': '200/hour'
'user': '1000/hour'
```

### OAuth staff

Не используется — только username/password для staff.

### Публичные endpoints

- `POST /api/education/webhooks/cf-stream/` — проверка подписи webhook (`CF_STREAM_WEBHOOK_SECRET`).
- `GET/POST /api/consultation/<room_uuid>/` — комната без JWT (с лимитами `max_uses`, `expires_at`).

### Production hardening

`config/settings/production.py`: `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_PROXY_SSL_HEADER`, `CORS_ALLOWED_ORIGINS`.

---

## API Документация

Базовый URL: `/api/`. Пагинация: `?page=1&page_size=25` (макс. 1000).

Формат ошибок: `{ "detail": "..." }` или поля serializer errors.

### Accounts — `/api/accounts/`

| URL | Метод | Auth | Описание |
|-----|-------|------|----------|
| `token/` | POST | — | Логин staff |
| `token/refresh/` | POST | — | Обновить access |
| `me/` | GET | Staff | Текущий пользователь |
| `managers/` | GET, POST | Admin | Список / создание менеджеров |
| `managers/{id}/` | GET, PUT, PATCH, DELETE | Admin | CRUD |
| `managers/{id}/deactivate/` | POST | Admin | Деактивация |
| `managers/{id}/clients/` | GET | Admin | Клиенты менеджера |

**POST token/ — request:**

```json
{"username": "admin", "password": "admin123"}
```

**Response 200:** `{ "access": "...", "refresh": "..." }`

---

### Clients — `/api/clients/`

| URL | Метод | Permissions | Описание |
|-----|-------|-------------|----------|
| `/` | GET | Authenticated | Список (фильтры `ClientFilter`) |
| `/` | POST | AdminOrRegistrar | Создание + cabinet account |
| `/{id}/` | GET, PUT, PATCH, DELETE | varies | CRUD; DELETE = soft |
| `/{id}/change_status/` | POST | AdminOrRegistrar | Смена статуса |
| `/{id}/reset_cabinet_password/` | POST | — | Сброс пароля кабинета |
| `/{id}/status-history/` | GET | — | История статусов |
| `/{id}/group-history/` | GET | — | История потоков |
| `/{id}/edit-info/` | PATCH | AdminOrRegistrar | Редактирование полей |
| `/{id}/enter-payment/` | POST | AdminOrRegistrar | Ввод оплаты |
| `/{id}/cancel-payment/` | POST | AdminOrRegistrar | Отмена оплаты |
| `/{id}/add-to-group/` | POST | AdminOrRegistrar | Назначить группу |
| `/{id}/re-enroll/` | POST | AdminOrRegistrar | Повторная запись |
| `/{id}/reserve-group/` | POST | AdminOrRegistrar | Бронь группы |
| `/{id}/cancel-reservation/` | DELETE | AdminOrRegistrar | Отмена брони |
| `/{id}/refund/` | POST | AdminOrRegistrar | Возврат |
| `/{id}/enrollments/` | GET | AdminOrRegistrar | Параллельные записи |
| `/{id}/enrollments/create/` | POST | AdminOrRegistrar | Новая запись |
| `/{id}/enrollments/{enrollment_id}/payment/` | POST | AdminOrRegistrar | Платёж |
| `/{id}/enrollments/{enrollment_id}/cancel-payment/` | POST | AdminOrRegistrar | |
| `/{id}/enrollments/{enrollment_id}/configure/` | POST | AdminOrRegistrar | |
| `/{id}/enrollments/{enrollment_id}/remove/` | DELETE | AdminOrRegistrar | |
| `/{id}/enrollments/{enrollment_id}/freeze/` | POST | AdminOrRegistrar | |
| `/{id}/enrollments/{enrollment_id}/change-group/` | PATCH | AdminOrRegistrar | |
| `/{id}/leave-group/` | POST | AdminOrRegistrar | Выход из группы |
| `/stats-summary/` | GET | — | Сводка для mobile dashboard |

**POST /clients/ — пример тела (упрощённо):**

```json
{
  "first_name": "Айгуль",
  "last_name": "Касымова",
  "phone": "+996700123456",
  "training_format": "offline",
  "group_type": "1.5h",
  "payment_type": "full",
  "payment_amount": 15000
}
```

**Response 201** может включать `cabinet_username`, `cabinet_password` (однократно при создании).

---

### Groups — `/api/groups/`

| URL | Метод | Описание |
|-----|-------|----------|
| CRUD | GET, POST, PUT, PATCH, DELETE | Потоки |
| `/{id}/close/` | POST | Закрытие потока (история клиентов) |
| `/{id}/activate/` | POST | Активация |
| `/{id}/clients/` | GET | Клиенты (или из history если completed) |
| `/{id}/add-client/` | POST | `{ "client_id": "uuid" }` |
| `/{id}/remove-client/` | POST | Убрать клиента |
| `/auto-update-status/` | POST | Массовое обновление статусов по датам |

При `list`/`retrieve` вызывается `_auto_promote_groups()` (recruitment → active по `start_date`).

---

### Trainers — `/api/trainers/`

Стандартный ModelViewSet: list, create, retrieve, update, destroy.

---

### Attendance — `/api/attendance/`

| URL | Метод | Описание |
|-----|-------|----------|
| `/mark/` | POST | Одна отметка |
| `/bulk-mark/` | POST | Пакет за дату |
| `/group/{group_id}/` | GET | `?date=YYYY-MM-DD` |
| `/group/{group_id}/all/` | GET | Все даты группы |

**POST /mark/:**

```json
{
  "client_id": "uuid",
  "lesson_date": "2026-05-30",
  "is_absent": true,
  "note": "НБ"
}
```

---

### Payments — `/api/payments/`

| URL | Метод | Описание |
|-----|-------|----------|
| `full/{pk}/pay/` | POST | Отметить полную оплату |
| `full/{pk}/receipt/` | POST | Загрузить чек (multipart) |
| `installment/{pk}/payments/` | POST | Платёж по рассрочке |
| `installment/{pk}/summary/` | GET | Сводка плана |

---

### Bonuses — `/api/bonuses/`

| URL | Метод | Описание |
|-----|-------|----------|
| `/preview/` | POST | `{ client_id, full_price }` — расчёт без списания |
| `/apply/` | POST | Списание бонуса |
| `/history/` | GET | `?client_id=uuid` |

---

### Statistics — `/api/statistics/`

| URL | Метод | Описание |
|-----|-------|----------|
| `/dashboard/` | GET | KPI дашборда |
| `/by-group/` | GET | По группам |
| `/by-trainer/` | GET | По тренерам |
| `/income-history/` | GET | История доходов |
| `/trash-data/` | GET | Удалённые сущности |
| `/trash-delete/` | POST | Окончательное удаление |
| `/trash-restore/` | POST | Восстановление |

Query-параметры фильтрации дат — см. `apps/statistics/views.py`.

---

### Cabinet — `/api/cabinet/`

| URL | Метод | Auth | Описание |
|-----|-------|------|----------|
| `login/` | POST | — | username/password → JWT |
| `token/refresh/` | POST | — | Refresh cabinet token |
| `google-auth/` | POST | — | Google credential |
| `me/` | GET | Cabinet | Профиль клиента |
| `attendance/` | GET | Cabinet | Посещаемость ученика |

---

### Education (staff) — `/api/education/`

**Lessons** (`LessonAdminViewSet`):

| Action | Метод | Path |
|--------|-------|------|
| list, create, retrieve, update, destroy | REST | `/lessons/` |
| create-text | POST | `/lessons/create-text/` |
| update-text | PATCH | `/lessons/{id}/update-text/` |
| upload-init | POST | `/lessons/upload-init/` |
| finalize | POST | `/lessons/{id}/finalize/` (и связанные) |
| metadata | PATCH | `/lessons/{id}/metadata/` |
| thumbnail | POST | `/lessons/{id}/thumbnail/` |
| thumbnail-upload-url | POST | `/lessons/{id}/thumbnail-upload-url/` |
| refresh-upload-url | POST | `/lessons/{id}/refresh-upload-url/` |
| trash | GET | `/lessons/trash/` |
| publish | POST | `/lessons/{id}/publish/` |
| permanent | DELETE | `/lessons/{id}/permanent/` |

**Streams** (`LiveStreamAdminViewSet`):

| Action | Описание |
|--------|----------|
| start, end | Управление эфиром |
| viewers, active-viewers | Зрители |
| whip-proxy | WHIP для браузера |
| chat | GET/POST сообщения |
| guests, guests/{id}/end | Приглашение на сцену |
| guest WebRTC signaling | SDP/ICE |
| turn-credentials | Cloudflare TURN |
| cf-status, recording-status | Статус CF |
| manual-archive, publish-recording, upload-recording | Архив записи |

**Consultations:**

| CRUD + cancel, join-as-trainer, permanent | |

**Прочее:**

| URL | Метод |
|-----|-------|
| `/stats/` | GET — аналитика просмотров |
| `/webhooks/cf-stream/` | POST — webhook Cloudflare |

Permission education staff: `IsTeacherOrAdmin` (`apps/education/permissions.py`) — authenticated staff (MVP: admin/registrar).

---

### Education (cabinet) — `/api/cabinet/education/`

| URL | Метод | Описание |
|-----|-------|----------|
| `/lessons/` | GET | Уроки по группе клиента + subscription tags |
| `/lessons/{id}/` | GET | Деталь + signed playback URL |
| `/lessons/{id}/progress/` | POST | Прогресс просмотра |
| `/streams/active/` | GET | Текущий эфир |
| `/streams/{id}/join/` | POST | Вход в эфир |
| `/streams/{id}/heartbeat/` | POST | Keep-alive зрителя |
| `/streams/{id}/viewers/` | GET | Список зрителей |
| `/streams/{id}/chat/` | GET, POST | Чат |
| `/streams/{id}/guest/` | GET, POST | Гость на сцене |
| `/streams/{id}/guest/webrtc/` | GET, POST | Сигналинг |
| `/streams/{id}/turn-credentials/` | GET | TURN для WebRTC |

**Доступ к урокам:** клиент должен быть в группе; для `payment_type=installment` план должен быть закрыт (`_client_has_lesson_access` в `cabinet_views.py`).

---

### Public consultation

| URL | Метод | Auth |
|-----|-------|------|
| `/api/consultation/{room_uuid}/` | GET, POST | AllowAny |
| `/api/consultation/{room_uuid}/status/` | GET | AllowAny |

Возвращают данные для Jitsi embed на фронте (`ConsultationRoom.jsx`).

---

## Бизнес-логика (ключевые сценарии)

### Регистрация клиента

1. `ClientService.create_client` в `apps/clients/services.py`.
2. Создаётся `Client`, при необходимости `FullPayment` / `InstallmentPlan`, `ClientAccount` (логин = цифры телефона).
3. Бонусы при оплате — через `BonusService` при apply.

### Закрытие группы

`GroupService.close_group` — статус `completed`, снимки в `ClientGroupHistory`, отвязка клиентов.

### Доступ к урокам (кабинет)

1. `group_ids` из `client.group` и `client.second_group`.
2. Урок: M2M `groups` **или** пересечение `lesson.subscription_tags` с `group.online_subscription_tags`.
3. Только `is_published=True`, `deleted_at IS NULL`.

### Live stream → архив урока

1. Админ создаёт `LiveStream`, CF создаёт Live Input.
2. После эфира webhook `live_input.recording.ready` → создание/обновление `Lesson`, опционально миграция в R2 (`_migrate_recording_to_r2`).

### Консультация

1. Admin создаёт `Consultation` → UUID комнаты.
2. Ссылка `https://crm.aiym-syry.kg/room/{uuid}`.
3. `JitsiService` выдаёт JWT для домена `JITSI_DOMAIN`.
4. `used_count` / `expires_at` ограничивают злоупотребления.

---

## Работа с БД

### Миграции

```bash
export DJANGO_SETTINGS_MODULE=config.settings.development
python manage.py makemigrations <app_label>
python manage.py migrate
```

Миграции лежат в `apps/<app>/migrations/`.

### ORM

Django ORM; **Prisma не используется**.

### Seed / тестовые данные

| Команда | Назначение |
|---------|------------|
| `python manage.py create_staff_users` | admin + registrar |
| `python manage.py fill_test_data` | тренеры, группы, клиенты, оплаты, посещаемость |
| `python manage.py fill_test_data --flush` | очистка перед заполнением |

### Django Admin

`python manage.py createsuperuser` — доступ к `/admin/` Django для `SystemSetting` и отладки.

---

## Разработка

### Как добавить новый endpoint

1. Определите app (`apps/<domain>/`).
2. Добавьте логику в `services.py` (наследник `BaseService` при необходимости).
3. Serializer для входа/выхода.
4. ViewSet + `@action` или `APIView`.
5. Подключите URL в `config/urls.py` или app `urls.py`.
6. Permissions в `get_permissions` или `@action(permission_classes=[...])`.
7. Миграции, если меняется модель.
8. Вызов с frontend через `axios`.

**Пример action на существующем ViewSet:**

```python
@action(detail=True, methods=['post'], url_path='my-action')
def my_action(self, request, pk=None):
    obj = self.get_object()
    result = self.service.do_something(pk, request.data)
    return Response({'ok': True, 'result': result})
```

### Как добавить новую таблицу

1. Модель в `apps/<app>/models.py` — наследуйте `UUIDTimestampedModel` где уместно.
2. `python manage.py makemigrations <app>`
3. `python manage.py migrate`
4. Зарегистрируйте в `admin.py` при необходимости.
5. Serializer + service + viewset.

### Как добавить бизнес-логику

1. Метод в `*Service` классе app.
2. Используйте `transaction.atomic()` для составных операций.
3. Бросайте `core.exceptions.ValidationError`, `NotFoundError` — handler вернёт 400/404.
4. View остаётся тонким: validate → service → serialize.

---

## Конфигурация и запуск

```bash
pip install -r requirements/development.txt
export DJANGO_SETTINGS_MODULE=config.settings.development
python manage.py migrate
python manage.py runserver
```

**Production:** `config.settings.production`, Gunicorn (`deploy/gunicorn.service`), socket `/run/fitness-crm/gunicorn.sock`.

**Docker:**

```bash
docker compose up
# web на :8000, migrate при старте
```

Зависимости: [requirements/base.txt](requirements/base.txt).

---

## Сервисы education (интеграции)

| Класс | Файл | Назначение |
|-------|------|------------|
| `R2StorageService` | `apps/education/services.py` | Presigned PUT, публичные URL аудио |
| `CloudflareStreamService` | там же | Live Input, TUS, playback signing |
| `JitsiService` | там же | JWT для консультаций |
| `LessonAccessService` | там же | Правила доступа |

Без заполненных `R2_*` / `CF_STREAM_*` сервисы могут выбрасывать `ImproperlyConfigured` при вызове.

---

## Тесты

```bash
python manage.py test apps.clients
python manage.py test apps.education
```

Тесты в `apps/*/tests/`.

---

## Полезные файлы

| Файл | Содержание |
|------|------------|
| `config/urls.py` | Корневой роутинг API |
| `apps/clients/cabinet_auth.py` | Cabinet JWT |
| `apps/clients/cabinet_views.py` | Cabinet API клиента |
| `apps/education/views.py` | Staff education API |
| `apps/education/cabinet_views.py` | Student education API |
| `core/exception_handler.py` | Единый формат ошибок |
