# HANDOFF — 2026-05-21 (сессия — education module)

## Что сделано в этой сессии

### LiveStreamBanner — добавлен во все cabinet-страницы
Компонент `LiveStreamBanner` (опрос `/cabinet/education/streams/active/` каждые 30 с) добавлен в:
- `CabinetProfile.jsx` ✅
- `LessonsList.jsx` ✅
- `LessonView.jsx` ✅
- `StreamArchive.jsx` ✅
- `LessonsFeed.jsx` ✅ (commit `6f6dd3f`)

### EducationStats.jsx — кнопка «CSV»
Commit `6f6dd3f`. Кнопка появляется только когда данные загружены.
Экспортирует в один файл:
1. Неактивные студенты: Фамилия, Имя, Телефон, Группа, Последний просмотр
2. Статистика уроков: Название, Тип, Зрителей, Среднее %, Завершили

BOM (`﻿`) добавлен для корректного открытия в Excel.

### Другие исправления предыдущих сессий (уже задеплоены)
- Пробелы в логине/пароле студентов — trim() на backend и frontend
- Cabinet JWT: access 1 день + refresh endpoint
- WHIP DELETE — только session URL, не publish URL
- Chat polling: `__gt` → `__gte` чтобы не терять сообщения
- BroadcastPage: screen sharing через `getDisplayMedia()` + `replaceTrack()`
- StreamLive student: guard для пустого `stableUid`

## Незакоммиченные изменения
Нет. Всё запушено.

## Следующий шаг

**Задеплоить:**
```bash
bash /var/www/fitness-crm/deploy/update.sh
```

**После деплоя проверить:**
1. Баннер эфира появляется на всех страницах кабинета когда идёт стрим
2. Кнопка «CSV» в аналитике скачивает файл с корректными данными
3. Обновление token через `/cabinet/token/refresh/` работает (после истечения 1-дневного access)

## Открытые задачи (из PROGRESS.md)
- 1.2 R2 bucket DNS — на стороне пользователя (Cloudflare/Network Solutions)
- 1.3 CF webhook secret — настроить после деплоя
- 1.4–1.5 Jitsi консультации — на паузе, ждёт решения пользователя
- 3.7 E2E тест
- 9.6 Raise-hand в эфире — на паузе
