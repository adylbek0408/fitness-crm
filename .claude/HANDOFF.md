# HANDOFF — 2026-05-30 (bug fixes: freeze, bonus, delete, re-enroll)

## Что сделано в этой сессии

### Commit `efd2081` — clients: fix primary freeze bug, add bonus% to reenter form, manager delete, re-enroll fixes

**Баг 1: Заморозка основной группы → сломанный статус**

`refund_client` в `services.py` не сбрасывал `status` после заморозки — клиент
оставался `status='active'` без группы. Никаких кнопок больше нельзя было нажать.

Исправлено: после `client.group = None` добавлено `client.status = 'new'`.
Включено в `update_fields` и записано в историю через `_record_status_change`.

**Баг 2: Поле «Бонус %» отсутствовало в форме "Ввести оплату заново"**

`ReenterPaymentInline` в `mobile/ClientDetail.jsx` хардкодил `bonus_percent: client.bonus_percent ?? 10`.
Теперь добавлено состояние `bonusPercent` и редактируемый инпут, аналогично параллельному блоку.

**Фича: Менеджер (registrar) может удалить клиента**

- `views.py` `get_permissions`: `destroy` переведён с `IsAdmin()` на `IsAdminOrRegistrar()`
- Добавлена кнопка «Удалить клиента» в `mobile/ClientDetail.jsx` внизу страницы
- Видна только для `user.role === 'admin'` или `'registrar'`
- Двойное подтверждение перед удалением

**Фикс: `re_enroll_client` блокировал пробных клиентов**

Убрана устаревшая проверка `if client.client_type == 'trial': raise ValidationError(...)`.
Добавлен сброс `client_type` из `frozen`/`trial` → `regular` при повторной записи.

**Доп. улучшения:**
- Кнопка «Заморозить клиента» не показывается для уже замороженных клиентов (`client.client_type !== 'frozen'`)
- Информационный баннер для замороженного клиента в панели «Добавить в группу»

## Логика после фикса заморозки

После `refund_client`:
- `client.status = 'new'` (было `'active'`)
- `client.client_type = 'frozen'`
- `client.group = null`

→ `canUseNewClientFlow = true` (условие `client.status === 'new' && !client.group`)
→ Отображается панель «Добавить в группу» с баннером о заморозке
→ При добавлении в группу: `client_type` автоматически → `'regular'`, `status` → `'active'`

## Незакоммиченные изменения
Нет. Всё запушено (`git push origin main` → `efd2081`).

## Следующие шаги

1. **Задеплоить на сервер:**
   ```bash
   bash /var/www/fitness-crm/deploy/update.sh
   ```

2. **Проверить на проде:**
   - Заморозить клиента в основном блоке → должна появиться кнопка «Добавить в группу»
   - Ввести оплату заново в основном блоке → должно быть поле «Бонус %»
   - Менеджер должен видеть кнопку «Удалить клиента» внизу карточки
   - Заморозить клиента → баннер о заморозке в панели добавления

3. **Education module** — Sprint 1.2–1.5, 3.7, 9.6.

## Открытые задачи
- Education module (Sprint 1.2–1.5, 3.7, 9.6)
- Frontend desktop ClientDetail — enrollment accordion — не сделан
