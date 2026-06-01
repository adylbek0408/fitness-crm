# HANDOFF — 2026-06-01 (freeze flow полный цикл)

## Что сделано в этой сессии (все коммиты)

### `efd2081` — основные баги заморозки + UX
- `refund_client`: `client.status = 'new'` после заморозки (было stuck как `'active'`)
- `re_enroll_client`: убран устаревший trial-блок; сброс `client_type` frozen/trial→regular
- `views.destroy`: разрешён `registrar` удалять клиентов
- `ReenterPaymentInline`: добавлено редактируемое поле «Бонус %»
- Mobile ClientDetail: кнопка «Удалить клиента» для admin/registrar
- Баннер для замороженного клиента в панели «Добавить в группу»
- Кнопка «Заморозить без группы» не показывается уже-замороженным

### `5045d50` — параллельные записи исчезали после заморозки основной
`ParallelEnrollmentBlock` был вложен в `{client.group ? ... : ...}` → исчезал
при очистке `client.group`. Перенесен наружу, рендерится всегда.
`AddEnrollmentPanel` (+ доп. группу) остаётся за `client.group`.

### `37cc9f2` — история группы пустела после заморозки
`refund_client` не создавал `ClientGroupHistory` при очистке `client.group`.
Теперь создаёт snapshot (группа, тренер, оплата) до `client.group = None`.

### `c6ff0a2` — редизайн карточек истории
- `group-history` endpoint: добавлен `group_training_format` (select_related)
- `MobileStreamsHistory`: история рендерится как карточки параллельных записей —
  иконка онлайн/офлайн, цветной фон, бейджи «осн.»/«Заморожен»/«Завершён»

### `f17c5e7` — мелкие чистки
- Описание «Заморозить эту запись»: убран «Акт.+Заморозка» → «Заморожен»
- `MobileStreamsHistory` / `MobileStatusHistory`: заменён length-cache на
  in-flight guard — история перезагружается при каждом открытии аккордеона

## Текущее состояние после freeze-цикла

После `refund_client` (заморозка основной группы):
- `client.status = 'new'` ✅
- `client.client_type = 'frozen'` ✅
- `client.group = null` ✅
- `ClientGroupHistory` создана ✅
- Параллельные записи остаются ✅
- Панель «Добавить в группу» появляется ✅
- «История группы» показывает замороженную группу ✅

## Незакоммиченные изменения
Нет. Всё запушено (`git push origin main` → `f17c5e7`).

## Следующие шаги

1. **Задеплоить на сервер:**
   ```bash
   bash /var/www/fitness-crm/deploy/update.sh
   ```

2. **Проверить на проде** полный цикл:
   - Добавить клиента → добавить в основную группу → заморозить
   - После заморозки: статус «Новый», тип «Заморозка», панель «Добавить в группу»
   - «История группы» показывает замороженную основную группу
   - Параллельные доп. записи не исчезают

3. **Education module** — Sprint 1.2–1.5, 3.7, 9.6.

## Открытые задачи
- Education module (Sprint 1.2–1.5, 3.7, 9.6)
- Frontend desktop `ClientDetail` — enrollment accordion — не сделан
