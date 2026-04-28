import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Layers2, UserCircle, Users,
  BarChart2, UserCog, LogOut, Trash2,
  Play, Radio, Video,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const links = [
  { to: '/admin/dashboard',  icon: LayoutDashboard, label: 'Дашборд'    },
  { to: '/admin/groups',     icon: Layers2,          label: 'Группы'     },
  { to: '/admin/trainers',   icon: UserCircle,       label: 'Тренеры'    },
  { to: '/admin/clients',    icon: Users,            label: 'Клиенты'    },
  { to: '/admin/statistics', icon: BarChart2,        label: 'Статистика' },
  { to: '/admin/managers',   icon: UserCog,          label: 'Менеджеры'  },
  { to: '/admin/education/lessons',       icon: Play,  label: 'Уроки'         },
  { to: '/admin/education/streams',       icon: Radio, label: 'Эфиры'         },
  { to: '/admin/education/consultations', icon: Video, label: 'Консультации'  },
  { to: '/admin/trash',      icon: Trash2,           label: 'Корзина',   danger: true },
]

function Avatar({ name }) {
  const initials = (name || 'A').slice(0, 2).toUpperCase()
  return (
    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
         style={{ background: 'linear-gradient(135deg, #be185d, #7c3aed)' }}>
      {initials}
    </div>
  )
}

const roleLabel = (role) =>
  ({ admin: 'Администратор', registrar: 'Регистратор' }[role] || role || '')

export default function AdminLayout({ children, user }) {
  const nav = useNavigate()
  const { logout } = useAuth()
  const handleLogout = () => { logout(); nav('/login') }
  const displayName = user?.display_name || user?.username

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* ══ SIDEBAR (Desktop) ══ */}
      <aside className="hidden lg:flex w-56 flex-col fixed left-0 top-0 bottom-0 z-30"
        style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid rgba(255,255,255,0.05)' }}>

        {/* Лого */}
        <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                 style={{ background: 'linear-gradient(135deg, #be185d, #9333ea)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white" opacity="0.9"/>
              </svg>
            </div>
            <div>
              <p className="text-white text-sm font-bold leading-tight tracking-tight">CRM система</p>
            </div>
          </div>
        </div>

        {/* Навигация */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5">
          {links.map(l => {
            const Icon = l.icon
            return (
              <NavLink key={l.to} to={l.to}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-100 ${
                    isActive ? 'text-white font-medium' : 'font-normal'
                  }`
                }
                style={({ isActive }) => {
                  if (isActive) {
                    return { background: l.danger ? 'rgba(239,68,68,0.2)' : 'rgba(190,24,93,0.25)', color: '#fff' }
                  }
                  return { color: l.danger ? 'rgba(255,150,150,0.5)' : 'rgba(255,255,255,0.45)' }
                }}>
                {({ isActive }) => (
                  <>
                    <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8}
                          style={{
                            color: isActive
                              ? (l.danger ? '#fca5a5' : '#f9a8d4')
                              : (l.danger ? 'rgba(255,150,150,0.4)' : 'rgba(255,255,255,0.4)')
                          }} />
                    <span>{l.label}</span>
                    {isActive && (
                      <span className="ml-auto w-1 h-4 rounded-full"
                        style={{ background: l.danger ? '#fca5a5' : '#f9a8d4' }} />
                    )}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Пользователь */}
        <div className="px-2 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg group cursor-default"
               onMouseEnter={e => e.currentTarget.style.background = 'var(--sidebar-h)'}
               onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <Avatar name={displayName} />
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{displayName}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{roleLabel(user?.role)}</p>
            </div>
            <button onClick={handleLogout} title="Выйти"
              className="p-1.5 rounded-md transition opacity-0 group-hover:opacity-100"
              style={{ color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fda4af'; e.currentTarget.style.background = 'rgba(244,63,94,0.12)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'transparent' }}>
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {/* ══ MOBILE HEADER ══ */}
      <header className="lg:hidden sticky top-0 z-40"
        style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="px-4 py-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: 'linear-gradient(135deg, #be185d, #9333ea)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <span className="text-white font-bold text-sm flex-1 truncate">CRM система</span>
          <button onClick={handleLogout}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs transition"
            style={{ color: '#fda4af', border: '1px solid rgba(253,164,175,0.2)' }}>
            <LogOut size={13} /> Выйти
          </button>
        </div>
        <nav className="px-3 pb-2.5 overflow-x-auto no-scrollbar">
          <div className="flex gap-1 min-w-max">
            {links.map(l => {
              const Icon = l.icon
              return (
                <NavLink key={l.to} to={l.to}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
                      isActive ? 'text-white' : ''
                    }`
                  }
                  style={({ isActive }) => {
                    if (isActive) {
                      return { background: l.danger ? 'rgba(239,68,68,0.25)' : 'rgba(190,24,93,0.30)' }
                    }
                    return { color: l.danger ? 'rgba(255,150,150,0.6)' : 'rgba(255,255,255,0.45)' }
                  }}>
                  <Icon size={13} strokeWidth={2} />
                  {l.label}
                </NavLink>
              )
            })}
          </div>
        </nav>
      </header>

      {/* ══ MAIN ══ */}
      <main className="lg:ml-56 min-h-screen">
        <div className="p-5 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
