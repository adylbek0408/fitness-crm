# Frontend — Asylzada Fitness CRM (SPA)

React-приложение для staff (админка и мобильный регистратор), личного кабинета ученика и публичных комнат консультаций. Собирается Vite, разворачивается как статика за Nginx (`frontend-spa/dist`).

Обзор всего проекта: [../README.md](../README.md).  
Backend API: [../BACKEND.md](../BACKEND.md).

---

## Назначение Frontend

Frontend — **единая точка входа** для всех ролей:

| Зона | URL | Роль |
|------|-----|------|
| Staff login | `/login` | admin, registrar |
| Админка | `/admin/*` | только `admin` |
| Мобильный регистратор | `/mobile/*` | admin и registrar |
| Кабинет ученика | `/cabinet`, `/cabinet/*` | ученик (cabinet JWT) |
| Консультация | `/room/:uuid` | гость по ссылке |

### Взаимодействие с backend

1. Все запросы идут через **один экземпляр Axios** (`src/api/axios.js`).
2. `VITE_API_BASE` задаёт базовый путь (в dev часто `/api` — прокси Vite на `localhost:8000`).
3. Interceptor выбирает токен:
   - URL начинается с `/cabinet/` → `cabinet_access_token`
   - иначе → `access_token` (staff)
4. При `401` выполняется refresh (`/accounts/token/refresh/` или `/cabinet/token/refresh/`) с дедупликацией параллельных запросов.
5. Медиа (чеки): полные URL строятся через `VITE_BACKEND_ORIGIN` (`src/utils/format.js`), чтобы не попадать в React Router.

**Redux и RTK Query в проекте не используются.**

---

## Архитектура Frontend

### Структура папок

```
frontend-spa/
├── public/              # Статика (manifest, шрифты)
├── src/
│   ├── api/
│   │   └── axios.js     # Единственный HTTP-клиент
│   ├── assets/
│   ├── components/      # Переиспользуемые UI и доменные блоки
│   │   ├── ui/          # Toast, AppSelect, GroupPicker
│   │   ├── payments/    # Формы оплат
│   │   └── education/   # Плееры, чат, feed, защита контента
│   ├── contexts/        # Глобальное состояние (React Context)
│   ├── hooks/           # Кастомные хуки (если есть)
│   ├── pages/           # Страницы-маршруты
│   │   ├── admin/
│   │   ├── mobile/
│   │   ├── cabinet/
│   │   └── public/
│   ├── utils/           # format, pdf, recordingStore
│   ├── App.jsx          # Router + providers
│   ├── main.jsx         # Entry, PWA registerSW
│   └── index.css        # Tailwind + глобальные стили
├── index.html
├── vite.config.js       # Proxy /api, /media; PWA
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

### Компоненты

| Компонент | Назначение | Где используется |
|-----------|------------|------------------|
| `ProtectedRoute` | Проверка staff-auth и роли | `/admin`, `/mobile` |
| `AdminLayout` | Shell админки (навигация) | Страницы `admin/*` |
| `MobileLayout` | Shell мобильного UI | `mobile/*` |
| `CabinetNav` | Навигация кабинета | `cabinet/*` |
| `ErrorBoundary` | Перехват ошибок React | Корень в `App.jsx` |
| `UploadDock` | UI фоновых загрузок | Глобально |
| `CloudflareStreamPlayer` | HLS/Stream playback | Уроки, архив эфира |
| `VodPlayer` / `AudioPlayer` | Видео/аудио в кабинете | `LessonView` |
| `StreamChat` | Чат эфира | `StreamLive`, `BroadcastPage` |
| `ConfirmModal`, `AlertModal` | Подтверждения | По всему приложению |
| `payments/*` | Оплата, чеки, enrollment | Client detail, register |

### Layouts

Отдельной папки `layouts/` нет — layout реализован компонентами `AdminLayout` и `MobileLayout`, которые оборачивают `<Outlet />` на страницах.

### Pages

См. раздел [Основные страницы](#основные-страницы). Маршруты объявлены в `src/App.jsx` с **lazy loading** (`React.lazy`) для code splitting.

### Hooks

- `src/components/education/useContentProtection.js` — ограничения копирования/скриншотов на контенте.
- Доменные хуки могут жить рядом с компонентами; отдельного каталога hooks минимален.

### Services

Отдельного слоя `services/` нет — вызовы API выполняются **напрямую из страниц и компонентов** через `import api from '../api/axios'`.

### State Management

| Механизм | Файл | Ответственность |
|----------|------|-----------------|
| **AuthContext** | `contexts/AuthContext.jsx` | Staff user: загрузка `/accounts/me/`, login/logout |
| **UploadContext** | `contexts/UploadContext.jsx` | Очередь загрузок уроков (TUS/R2) |
| **RefreshContext** | `contexts/RefreshContext.jsx` | Pull-to-refresh на mobile |
| **Local state** | `useState` / `useReducer` в страницах | Формы, списки, модалки |
| **localStorage** | через axios / Login | JWT токены |

Cabinet **не** использует `AuthContext` — токены кабинета читаются только в axios interceptor; профиль — запросы к `/api/cabinet/me/` на страницах кабинета.

### Routing

`react-router-dom` v6:

```jsx
// Упрощённо из App.jsx
<Route path="/login" element={<Login />} />
<Route path="/admin" element={<ProtectedRoute role="admin" />}>
  <Route path="dashboard" element={<Dashboard />} />
  ...
</Route>
<Route path="/mobile" element={<ProtectedRoute role="any" />}>...</Route>
<Route path="/cabinet/lessons" element={<LessonsFeed />} />
```

- `ProtectedRoute`: `user === undefined` → спиннер; `null` → `/login`; `role === 'admin'` и не admin → `/mobile`.
- Неизвестные пути → redirect `/login`.

### UI система

- **Tailwind CSS 3** — utility-first стили в JSX (`className="..."`).
- **CSS variables** в `index.css` для темы (например `--bg`).
- **@headlessui/react** — доступные списки/диалоги.
- **lucide-react** — иконки.
- **Toast** — `components/ui/Toast.jsx` (`ToastProvider` в `App.jsx`).
- **Шрифты:** `@fontsource/noto-sans`, Roboto для PDF (`utils/pdfRobotoFonts.js`).

### PWA

`vite-plugin-pwa`: manifest «Асылзада CRM», service worker с `navigateFallbackDenylist` для `/api/`, `/media/`, `/admin/` (чтобы SW не подменял API медиа на `index.html`).

---

## Поток данных

Типичный сценарий (staff, список клиентов):

```
Пользователь открывает /admin/clients
    → React рендерит Clients.jsx
    → useEffect вызывает api.get('/clients/', { params })
    → axios interceptor добавляет Authorization: Bearer <access_token>
    → Vite proxy (dev) или Nginx (prod) → Django ClientViewSet.list
    → JSON { count, next, previous, results: [...] }
    → setState(clients) → таблица в UI
```

При истечении access token:

```
api.get → 401
    → interceptor: doRefresh('staff')
    → POST /api/accounts/token/refresh/
    → localStorage access_token обновлён
    → повтор исходного запроса
```

Cabinet-запросы идентичны, но `isCabinetUrl()` и refresh на `/cabinet/token/refresh/`.

**RTK Query в цепочке нет** — кэширование и инвалидация не централизованы; каждая страница сама перезапрашивает данные при mount/focus.

---

## Основные страницы

### Staff

| Страница | Путь | Назначение | API (примеры) |
|----------|------|------------|---------------|
| `Login` | `/login` | Вход staff | `POST /accounts/token/`, `GET /accounts/me/` |
| `Dashboard` | `/admin/dashboard` | Сводка | `GET /statistics/dashboard/` |
| `Groups` | `/admin/groups` | Список потоков | `GET /groups/` |
| `GroupForm` | `/admin/groups/:id` | Создание/редактирование | `GET/POST/PUT /groups/` |
| `GroupDetail` | `/admin/groups/:id/detail` | Клиенты группы | `GET /groups/:id/clients/` |
| `Trainers` | `/admin/trainers` | Тренеры | `GET /trainers/` |
| `Clients` | `/admin/clients` | Список клиентов | `GET /clients/` |
| `ClientDetail` | `/admin/clients/:id` | Карточка (админ) | `GET /clients/:id/`, actions |
| `Statistics` | `/admin/statistics` | Аналитика, посещаемость | `/statistics/*`, `/attendance/group/.../all/` |
| `Managers` | `/admin/managers` | Менеджеры-регистраторы | `/accounts/managers/` |
| `Trash` | `/admin/trash` | Удалённые сущности | `/statistics/trash-data/`, restore/delete |
| `LessonsAdmin` | `/admin/education/lessons` | Видео/аудио уроки | `/education/lessons/*` |
| `TextLessonsAdmin` | `/admin/education/text-lessons` | Текстовые уроки | `create-text`, `update-text` |
| `StreamsAdmin` | `/admin/education/streams` | Расписание эфиров | `/education/streams/` |
| `BroadcastPage` | `/admin/education/broadcast/:id` | Ведущий эфира | start/end, whip-proxy, guests, chat |
| `ConsultationsAdmin` | `/admin/education/consultations` | Ссылки Jitsi | `/education/consultations/` |
| `EducationStats` | `/admin/education/stats` | Просмотры уроков | `GET /education/stats/` |

### Mobile (регистратор)

| Страница | Путь | Назначение | API |
|----------|------|------------|-----|
| `MobileDashboard` | `/mobile` | Главная | `GET /clients/stats-summary/` |
| `ClientList` | `/mobile/clients` | Список | `GET /clients/` |
| `ClientRegister` | `/mobile/clients/register` | Новый клиент | `POST /clients/`, `add-to-group` |
| `MobileClientDetail` | `/mobile/clients/:id` | Полная карточка | Множество `ClientViewSet` actions |

### Cabinet

| Страница | Путь | Назначение | API |
|----------|------|------------|-----|
| `CabinetLogin` | `/cabinet` | Вход | `POST /cabinet/login/`, `google-auth/` |
| `CabinetProfile` | `/cabinet/profile` | Профиль, посещаемость | `GET /cabinet/me/`, `/cabinet/attendance/` |
| `LessonsFeed` | `/cabinet/lessons` | Лента уроков | `GET /cabinet/education/lessons/` |
| `LessonView` | `/cabinet/lessons/:id` | Просмотр урока | `GET .../lessons/:id/`, `POST .../progress/` |
| `StreamLive` | `/cabinet/stream` | Live эфир | `/cabinet/education/streams/active/`, join, heartbeat, chat |
| `StreamArchive` | `/cabinet/archive` | Запись эфира | Урок из `archived_lesson` |

### Public

| Страница | Путь | API |
|----------|------|-----|
| `ConsultationRoom` | `/room/:uuid` | `GET /api/consultation/:uuid/`, `.../status/` (без cabinet JWT) |

---

## Основные компоненты (education)

| Компонент | Ответственность |
|-----------|-----------------|
| `feed/FeedPost`, `FeedPostVideo`, `FeedPostAudio`, `FeedPostText` | Карточки в ленте кабинета |
| `LessonThumb` | Превью урока |
| `Watermark` | Водяной знак на видео |
| `streamGuestRTC.js` | WebRTC сигналинг гостя на эфире |
| `LiveStreamBanner` | Баннер «идёт эфир» |

---

## Управление состоянием (подробно)

### AuthContext (staff)

```jsx
// Инициализация при старте приложения
useEffect(() => { fetchUser() }, [])

// fetchUser: если есть access_token → GET /accounts/me/
// user: undefined | null | { role, username, ... }
```

Использование: `const { user, login, logout } = useAuth()` в `Login.jsx`, `ProtectedRoute`.

### UploadContext

Хранит активные загрузки (видео через TUS, аудио через presigned PUT), отображает прогресс в `UploadDock`. Используется в `LessonsAdmin` и связанных формах.

### RefreshContext

Оборачивает только `/mobile` — поддержка pull-to-refresh (`PullToRefresh.jsx`) для списков.

### Local State

Большинство админ- и mobile-страниц — монолитные компоненты с `useState` (иногда тысячи строк, напр. `ClientDetail.jsx`). Паттерн: загрузка в `useEffect`, оптимистичные обновления редки — после POST обычно повторный `GET`.

---

## Как добавить новую страницу

1. **Создайте файл** в `src/pages/...`, например `src/pages/admin/Reports.jsx`:

```jsx
import AdminLayout from '../../components/AdminLayout'
import api from '../../api/axios'
import { useEffect, useState } from 'react'

export default function Reports() {
  const [data, setData] = useState(null)
  useEffect(() => {
    api.get('/statistics/dashboard/').then(r => setData(r.data))
  }, [])
  return (
    <AdminLayout title="Отчёты">
      {/* UI */}
    </AdminLayout>
  )
}
```

2. **Добавьте lazy import** в `App.jsx`:

```jsx
const Reports = lazy(() => import('./pages/admin/Reports'))
```

3. **Зарегистрируйте Route** внутри нужного layout:

```jsx
<Route path="reports" element={<Reports />} />
```

4. **Добавьте пункт меню** в `AdminLayout.jsx` (или `MobileLayout`), если нужна навигация.

5. Для **защищённых** staff-страниц используйте вложенность под `<ProtectedRoute role="admin" />` или `role="any"`.

6. Для **кабинета** — маршрут без `ProtectedRoute`, проверяйте наличие `cabinet_access_token` на странице или редирект на `/cabinet`.

---

## Как добавить новый API-запрос

1. Убедитесь, что endpoint существует в backend ([BACKEND.md](../BACKEND.md)).

2. Импортируйте клиент:

```jsx
import api from '../api/axios'
```

3. Вызов с нужным методом:

```jsx
// Staff
const { data } = await api.get('/clients/', { params: { status: 'active' } })
await api.post(`/clients/${id}/change_status/`, { status: 'frozen' })

// Cabinet (URL должен начинаться с /cabinet/ для правильного токена)
await api.get('/cabinet/education/lessons/')
```

4. **Не дублируйте** базовый URL — используйте пути относительно `VITE_API_BASE`.

5. Для **FormData** (чеки):

```jsx
const fd = new FormData()
fd.append('receipt', file)
await api.post(`/payments/full/${id}/receipt/`, fd, {
  headers: { 'Content-Type': 'multipart/form-data' },
})
```

6. Обработка ошибок: `err.response?.data?.detail` (формат DRF).

---

## Как добавить новый компонент

1. Выберите папку:
   - общий UI → `src/components/ui/`
   - домен → `src/components/payments/` или `education/`

2. Создайте функциональный компонент с явными props:

```jsx
export default function StatusBadge({ status }) {
  return <span className="...">{status}</span>
}
```

3. Стили — Tailwind в `className`; общие токены — CSS variables из `index.css`.

4. Импортируйте в страницу: `import StatusBadge from '../../components/StatusBadge'`

5. Если компоненту нужен **текущий staff user** — `useOutletContext()` от `ProtectedRoute` или `useAuth()`.

---

## Локальная разработка

```bash
npm install
npm run dev    # http://localhost:5173
```

Файл `.env`:

```env
VITE_API_BASE=/api
VITE_BACKEND_ORIGIN=http://localhost:8000
VITE_GOOGLE_CLIENT_ID=   # опционально
```

`vite.config.js` проксирует `/api` и `/media` на порт 8000.

Сборка:

```bash
npm run build    # → dist/
npm run preview  # локальный preview production build
```

---

## Зависимости (кратко)

| Пакет | Роль |
|-------|------|
| `react`, `react-dom` | UI |
| `react-router-dom` | Маршруты |
| `axios` | HTTP |
| `tailwindcss` | Стили |
| `@vidstack/react`, `hls.js` | Видео |
| `tus-js-client` | Resumable upload в Stream |
| `date-fns`, `react-day-picker` | Даты |
| `recharts` | Графики |
| `vite-plugin-pwa` | PWA |

Полный список: [package.json](package.json).
