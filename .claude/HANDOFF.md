# HANDOFF — 2026-05-30 (client_type рефакторинг)

## Что сделано в этой сессии

### Commit `bb188a8` — clients: add client_type field, remove is_trial + active_frozen/frozen/trial statuses

Полный рефакторинг поля статуса клиента — разделение «жизненного цикла» и «типа клиента».

**Мотивация:** `active_frozen` — хак для параллельных групп. Клиент в двух группах
(одна активна, другая заморожена) не может иметь один осмысленный статус.

**Новая модель:**
- `Client.status` (4 значения): `new`, `active`, `completed`, `expelled`
- `Client.client_type` (3 значения): `regular`, `trial`, `frozen`
- Заморозка отдельной записи: `ClientEnrollment.frozen` (уже было)

**Файлы изменены:**
- `apps/clients/models.py` — добавлен `client_type`, убран `is_trial`, `status` теперь 4 вар.
- `apps/clients/migrations/0033_add_client_type_remove_is_trial.py` — data-migration
- `apps/clients/serializers.py` — `is_trial` → `client_type`
- `apps/clients/services.py` — `create_client`, freeze-логика, статус-переходы
- `apps/clients/views.py` — `change_status` принимает `{status}` или `{client_type}`
- `apps/clients/filters.py` — `is_trial` → `client_type`
- `apps/clients/admin.py` — `list_display`, `list_filter`
- `frontend-spa/src/utils/format.js` — `STATUS_BADGE/LABEL` (4 ключа) + новые `CLIENT_TYPE_BADGE/LABEL`
- `frontend-spa/src/pages/admin/Clients.jsx` — фильтры, таблица, PDF
- `frontend-spa/src/pages/admin/ClientDetail.jsx` — весь `is_trial` → `client_type`
- `frontend-spa/src/pages/mobile/ClientDetail.jsx` — полный рефакторинг
- `frontend-spa/src/pages/mobile/ClientList.jsx` — фильтр статуса
- `frontend-spa/src/pages/mobile/ClientRegister.jsx` — `is_trial: isTrial` → `client_type: isTrial ? 'trial' : 'regular'`

**Нюанс с миграцией:** migration 0021 переименовала индекс `clients_cli_is_tria_idx`
→ `clients_cli_is_tria_5ebcf2_idx`. Migration 0033 исправлена соответственно.
Также явно именован индекс `client_type` в models.py.

## Незакоммиченные изменения
Нет. Всё запушено (`git push origin main` → `bb188a8`).

## Следующие шаги

1. **Задеплоить на сервер:**
   ```bash
   bash /var/www/fitness-crm/deploy/update.sh
   ```
   *(включает migrate — нужна migration 0033)*

2. **Проверить на проде:**
   - Список клиентов: фильтры статуса (4 варианта: Новый/Активный/Завершил/Отчислен)
   - Фильтр «Тип клиента» в расширенных фильтрах (Все/Обычные/Пробные/Заморозка)
   - Карточка клиента: секция «Тип клиента» под статусом
   - Регистрация клиента: поле «Тип клиента» (Обычный/Пробный)

3. **Education module** — Sprint 1.2–1.5, 3.7, 9.6 без изменений.

## Открытые задачи
- Education module (Sprint 1.2–1.5, 3.7, 9.6)
- Frontend desktop ClientDetail — enrollment accordion — не сделан
