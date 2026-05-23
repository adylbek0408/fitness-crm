# HANDOFF — 2026-05-23 (сессия — enrollment accordion + registration wizard)

## Что сделано в этой сессии

### Commit `7e67784` — clients: parallel enrollment accordion + 2-step registration

#### Backend
- **`ClientEnrollment` + `EnrollmentPayment`** модели добавлены в `apps/clients/models.py`
- **Migration `0027_add_client_enrollment`** применена
- **4 новых API endpoint** в `ClientViewSet`:
  - `GET  /clients/{id}/enrollments/` — список параллельных записей
  - `POST /clients/{id}/enrollments/create/` — добавить в паралл. группу
  - `POST /clients/{id}/enrollments/{eid}/payment/` — добавить платёж
  - `DELETE /clients/{id}/enrollments/{eid}/remove/` — деактивировать
- **`group_training_format`** добавлен в `ClientEnrollmentReadSerializer`
- **`parallel_enrollments`** в `ClientReadSerializer` (prefetch через API)

#### Frontend — ClientDetail (mobile)
- **`PrimaryGroupBlock`**: аккордеон для основной группы клиента
  - Заголовок: иконка формата + Группа #N · Тренер · Онлайн/Оффлайн · статус оплаты
  - Контент: полная оплата или рассрочка с прогрессом + AddPaymentForm + история чеков
- **`ParallelEnrollmentBlock`**: аккордеон для каждой параллельной группы
  - Бейдж «доп.», payment summary, прогресс, история платежей
  - «+ Добавить платёж» форма (inline, с файлом-чеком)
  - «Убрать из группы» кнопка с подтверждением
- **`AddEnrollmentPanel`**: кнопка «+ Добавить группу» → форма
  - Оффлайн/Онлайн → Набор/Активный → список групп → тип оплаты + сумма/рассрочка + бонус
- Клиенты **с группой** видят новые аккордеоны; без группы — старый блок «Оплата»
- Блок «История платежей» скрыт для клиентов с группой (теперь внутри PrimaryGroupBlock)

#### Frontend — ClientRegister (mobile)
- **2-шаговая регистрация** (было 3 шага):
  - Шаг 1: Данные (ФИО, телефон, email, заметки, тип клиента)
  - Шаг 2: Группа + Оплата (Онлайн/Оффлайн → Набор/Активный → список → тип оплаты)
  - Для пробного клиента шаг 2 = только оплата

#### Bug fixes
- DatePickerInput: нативный `<input type="date">` теперь виден и кликабелен на ноутбуках
- ReservationPanel: список групп и блок оплаты в разных секциях (шаг 1 / шаг 2)

## Незакоммиченные изменения
Нет. Всё в коммите `7e67784`.

## Следующие шаги

1. **Задеплоить на сервер:**
   ```bash
   bash /var/www/fitness-crm/deploy/update.sh
   ```

2. **Проверить после деплоя:**
   - Клиент с группой → видит PrimaryGroupBlock (аккордеон с данными группы + оплатой)
   - Клиент без группы → видит старый блок «Оплата»
   - Кнопка «+ Добавить группу» → форма открывается, позволяет выбрать онлайн/оффлайн, записать и сохранить оплату
   - Параллельная группа → «+ Добавить платёж» + «Убрать из группы» работают
   - 2-шаговая регистрация: данные → группа+оплата, форма сабмитится корректно

3. **Опционально — аналогичные изменения в admin-версии ClientDetail:**
   Файл: `frontend-spa/src/pages/ClientDetail.jsx` (desktop версия)
   Та же логика: PrimaryGroupBlock + ParallelEnrollmentBlock + AddEnrollmentPanel

## Открытые задачи (из PROGRESS.md)
- Education module задачи (1.2, 1.3, 1.4–1.5, 3.7, 9.6) — без изменений
- Frontend: ClientDetail **admin** (desktop) — enrollment accordion — не сделан
