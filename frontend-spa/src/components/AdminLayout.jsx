import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Layers, UserCircle, Users, BarChart2, UserCog } from 'lucide-react'

const links = [
  { to: '/admin/dashboard',  icon: LayoutDashboard, label: 'Дашборд' },
  { to: '/admin/groups',     icon: Layers, label: 'Потоки' },
  { to: '/admin/trainers',   icon: UserCircle, label: 'Тренеры' },
  { to: '/admin/clients',    icon: Users, label: 'Клиенты' },
  { to: '/admin/statistics', icon: BarChart2, label: 'Статистика' },
  { to: '/admin/managers',   icon: UserCog, label: 'Менеджеры' },
]

export default function AdminLayout({ children, user }) {
  const nav = useNavigate()
  const logout = () => { localStorage.clear(); nav('/login') }

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="hidden lg:flex w-64 bg-slate-900 text-slate-100 shadow-xl min-h-screen flex-col fixed left-0 top-0">
        <div className="px-6 py-5 border-b border-slate-800">
          <h1 className="text-lg font-semibold text-white tracking-tight">Асылзада CRM</h1>
          <p className="text-xs text-slate-400 mt-1">Администратор</p>
        </div>
        <nav className="flex-1 px-4 py-4 space-y-1">
          {links.map(l => {
            const Icon = l.icon
            return (
              <NavLink key={l.to} to={l.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition ${
                    isActive
                      ? 'bg-blue-600 text-white font-medium shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }>
                {Icon && <Icon size={20} strokeWidth={2} />} {l.label}
              </NavLink>
            )
          })}
        </nav>
        <div className="px-4 py-4 border-t border-slate-800">
          <p className="text-xs text-slate-400 mb-2">{user?.username}</p>
          <button onClick={logout}
            className="w-full text-sm text-red-300 hover:text-red-200 text-left px-3 py-2 rounded-xl hover:bg-slate-800 transition">
            Выйти
          </button>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-blue-600 truncate">Асылзада CRM</h1>
            <p className="text-xs text-gray-400 truncate">{user?.username}</p>
          </div>
          <button
            onClick={logout}
            className="shrink-0 text-sm text-red-500 hover:text-red-700 px-3 py-2 rounded-xl hover:bg-red-50 transition"
          >
            Выйти
          </button>
        </div>
        <nav className="px-2 pb-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {links.map(l => {
              const Icon = l.icon
              return (
                <NavLink
                  key={l.to}
                  to={l.to}
                  className={({ isActive }) =>
                    `inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-600 text-white font-medium'
                        : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                    }`
                  }
                >
                  {Icon && <Icon size={16} strokeWidth={2} />}
                  {l.label}
                </NavLink>
              )
            })}
          </div>
        </nav>
      </header>

      <main className="lg:ml-64 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  )
}
