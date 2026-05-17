# HANDOFF — 2026-05-18 (сессия — Education live UI audit)

## Что сделано в этой сессии

### Live puppeteer audit всех разделов (коммит `c9b00fb`)

Протестированы все 5 admin-страниц + кабинет студента через браузер.
Найдено и исправлено **8 багов**:

**Backend:**
- `ClientAccount.is_authenticated = True` — DRF `UserRateThrottle` вызывал
  `request.user.is_authenticated` на `ClientAccount`, который не наследует Django User.
  Результат: **500 на всех cabinet endpoints** (`/cabinet/me/`, уроки, эфиры и т.д.).
  Добавлен атрибут класса `is_authenticated = True` в `apps/clients/models.py`.

**Admin UI:**
- **LessonsAdmin** — кнопки удалить/превью/редактировать были `opacity-0 group-hover:opacity-100`
  → полностью недоступны на тач-устройствах. Исправлено: `sm:opacity-0 sm:group-hover:opacity-100`
  (постоянно видны на < 640px).
- **LessonsAdmin** — счётчик "Всего X" включал текстовые уроки (которые скрыты из этого вида).
  Теперь считает только video/audio.
- **LessonsAdmin / StreamsAdmin / TextLessonsAdmin / EducationStats** — groups fetch
  с `training_format=online` скрывал офлайн-группы из picker'а. Удалён фильтр.
- **StreamsAdmin / ConsultationsAdmin** — client-side поиск работал только на текущей
  странице (server pagination). Исправлено: `page_size=500`, все данные загружаются за раз.
- **StreamsAdmin** — счётчик "готовы" → "запланировано".
- **ConsultationsAdmin** — статус `cancelled` отображался как "Завершена" (серый),
  неотличимо от `used`. Исправлено: "Отменена" с розовым бейджем.
- **TextLessonsAdmin** — нет `useOutletContext` → `AdminLayout` не получал `user` → имя/роль
  admin не отображались в сайдбаре.

## Незакоммиченные изменения
Нет — всё в коммите `c9b00fb`.

## Следующий шаг — деплой на сервер

```bash
bash /var/www/fitness-crm/deploy/update.sh
```

## После деплоя
- Существующие ЛК-токены продолжают работать (нет новых миграций).
- Проверить что кабинет студента открывается без 500 ошибки.
- Убедиться что на мобиле в разделе "Видео-уроки" видны кнопки на карточках.
