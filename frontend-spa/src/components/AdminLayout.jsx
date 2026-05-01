import { useEffect, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Layers2, UserCircle, Users,
  BarChart2, UserCog, LogOut, Trash2,
  Play, Radio, Video, BarChart3, Menu, X,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

const links = [
  { to: '/admin/dashboard',  icon: LayoutDashboard, label: 'Дашборд'    },
  { to: '/admin/groups',     icon: Layers2,          label: 'Группы'     },
  { to: '/admin/trainers',   icon: UserCircle,       label: 'Тренеры'    },
  { to: '/admin/clients',    icon: Users,            label: 'Клиенты'    },
  { to: '/admin/statistics', icon: BarChart2,        label: 'Статистика' },
  { to: '/admin/managers',   icon: UserCog,          label: 'Менеджеры'  },
  { divider: 'Обучение' },
  { to: '/admin/education/lessons',       icon: Play,    label: 'Уроки'         },
  { to: '/admin/education/streams',       icon: Radio,   label: 'Эфиры'         },
  { to: '/admin/education/consultations', icon: Video,   label: 'Консультации'  },
  { to: '/admin/education/stats',         icon: BarChart3, label: 'Аналитика'   },
  { divider: '' },
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

function NavItem({ link, onClick }) {
  const { divider, to, icon: Icon, label, danger } = link
  if ('divider' in link) {
    return (
      <div className="pt-3 pb-1 px-3">
        {divider && (
          <p className="text-[10px] font-semibold uppercase tracking-widest"
             style={{ color: 'rgba(255,255,255,0.25)' }}>
            {divider}
          </p>
        )}
        {!divider && <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />}
      </div>
    )
  }
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-all duration-100 focus:outline-none focus:ring-2 focus:ring-rose-400/40 ${
          isActive ? 'text-white font-medium' : 'font-normal'
        }`
      }
      style={({ isActive }) => {
        if (isActive) {
          return { background: danger ? 'rgba(239,68,68,0.2)' : 'rgba(190,24,93,0.25)', color: '#fff' }
        }
        return { color: danger ? 'rgba(255,150,150,0.6)' : 'rgba(255,255,255,0.55)' }
      }}>
      {({ isActive }) => (
        <>
          <Icon size={16} strokeWidth={isActive ? 2.2 : 1.8}
                style={{
                  color: isActive
                    ? (danger ? '#fca5a5' : '#f9a8d4')
                    : (danger ? 'rgba(255,150,150,0.5)' : 'rgba(255,255,255,0.5)')
                }} />
          <span className="truncate">{label}</span>
          {isActive && (
            <span className="ml-auto w-1 h-4 rounded-full"
              style={{ background: danger ? '#fca5a5' : '#f9a8d4' }} />
          )}
        </>
      )}
    </NavLink>
  )
}

function getActiveTitle(pathname) {
  const found = links.find(l => l.to && pathname.startsWith(l.to))
  return found?.label || 'Админка'
}

export default function AdminLayout({ children, user }) {
  const nav = useNavigate()
  const loc = useLocation()
  const { logout } = useAuth()
  const handleLogout = () => { logout(); nav('/login') }
  const displayName = user?.display_name || user?.username

  const [drawerOpen, setDrawerOpen] = useState(false)

  // Close drawer on route change
  useEffect(() => { setDrawerOpen(false) }, [loc.pathname])

  // Close on ESC + lock body scroll while open
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = e => { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [drawerOpen])

  const SidebarBody = ({ onItemClick }) => (
    <>
      {/* Лого */}
      <div className="px-4 pt-5 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: 'linear-gradient(135deg, #be185d, #9333ea)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <div>
            <p className="text-white text-sm font-bold leading-tight tracking-tight">CRM система</p>
          </div>
        </div>
      </div>

      {/* Навигация */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5" aria-label="Главная навигация">
        {links.map((l, i) => (
          <NavItem key={l.to || `div-${i}`} link={l} onClick={onItemClick} />
        ))}
      </nav>

      {/* Пользователь */}
      <div className="px-2 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg">
          <Avatar name={displayName} />
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{displayName}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{roleLabel(user?.role)}</p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Выйти"
            title="Выйти"
            className="p-1.5 rounded-md transition focus:outline-none focus:ring-2 focus:ring-rose-400/40"
            style={{ color: 'rgba(255,255,255,0.6)' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fda4af'; e.currentTarget.style.background = 'rgba(244,63,94,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'transparent' }}>
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>

      {/* ══ SIDEBAR (Desktop ≥ lg) ══ */}
      <aside
        className="hidden lg:flex w-56 flex-col fixed left-0 top-0 bottom-0 z-30"
        style={{ background: 'var(--sidebar-bg)', borderRight: '1px solid rgba(255,255,255,0.05)' }}
        aria-label="Боковая навигация"
      >
        <SidebarBody />
      </aside>

      {/* ══ MOBILE HEADER ══ */}
      <header className="lg:hidden sticky top-0 z-40"
        style={{ background: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="px-3 sm:px-4 py-3 flex items-center gap-2.5">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Открыть меню"
            aria-expanded={drawerOpen}
            className="p-2 -ml-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 active:bg-white/15 transition focus:outline-none focus:ring-2 focus:ring-rose-400/40"
          >
            <Menu size={20} />
          </button>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: 'linear-gradient(135deg, #be185d, #9333ea)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="white" opacity="0.9"/>
            </svg>
          </div>
          <span className="text-white font-semibold text-sm flex-1 truncate">
            {getActiveTitle(loc.pathname)}
          </span>
          <button
            onClick={handleLogout}
            aria-label="Выйти"
            className="p-2 rounded-lg text-rose-300 hover:bg-rose-500/15 active:bg-rose-500/20 transition focus:outline-none focus:ring-2 focus:ring-rose-400/40"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ══ MOBILE DRAWER ══ */}
      <div
        className={`lg:hidden fixed inset-0 z-50 transition-opacity duration-200 ${
          drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!drawerOpen}
      >
        {/* Overlay */}
        <button
          type="button"
          aria-label="Закрыть меню"
          tabIndex={drawerOpen ? 0 : -1}
          onClick={() => setDrawerOpen(false)}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        {/* Drawer panel */}
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Меню навигации"
          className={`absolute left-0 top-0 bottom-0 w-[80%] max-w-[18rem] flex flex-col transform transition-transform duration-200 ${
            drawerOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{ background: 'var(--sidebar-bg)' }}
        >
          <button
            onClick={() => setDrawerOpen(false)}
            aria-label="Закрыть меню"
            className="absolute top-3 right-3 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 z-10 focus:outline-none focus:ring-2 focus:ring-rose-400/40"
          >
            <X size={18} />
          </button>
          <SidebarBody onItemClick={() => setDrawerOpen(false)} />
        </aside>
      </div>

      {/* ══ MAIN ══ */}
      <main className="lg:ml-56 min-h-screen">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
