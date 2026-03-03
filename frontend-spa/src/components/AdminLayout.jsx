import { NavLink, useNavigate } from 'react-router-dom'

const links = [
  { to: '/admin/dashboard',  icon: '📊', label: 'Дашборд' },
  { to: '/admin/groups',     icon: '🏃', label: 'Потоки' },
  { to: '/admin/trainers',   icon: '👤', label: 'Тренеры' },
  { to: '/admin/clients',    icon: '👥', label: 'Клиенты' },
  { to: '/admin/statistics', icon: '📈', label: 'Статистика' },
  { to: '/admin/managers',   icon: '🧑‍💼', label: 'Менеджеры' },
]

export default function AdminLayout({ children, user }) {
  const nav = useNavigate()
  const logout = () => { localStorage.clear(); nav('/login') }

  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-60 bg-white shadow-md min-h-screen flex flex-col fixed left-0 top-0">
        <div className="px-6 py-5 border-b">
          <h1 className="text-lg font-bold text-blue-600">Fitness CRM</h1>
          <p className="text-xs text-gray-400 mt-1">Администратор</p>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1">
          {links.map(l => (
            <NavLink key={l.to} to={l.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-medium'
                    : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                }`
              }>
              {l.icon} {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t">
          <p className="text-xs text-gray-500 mb-2">{user?.username}</p>
          <button onClick={logout}
            className="w-full text-sm text-red-500 hover:text-red-700 text-left px-3 py-2 rounded-xl hover:bg-red-50 transition">
            Выйти
          </button>
        </div>
      </aside>
      <div className="ml-60 flex-1 p-8">{children}</div>
    </div>
  )
}
