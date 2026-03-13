import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, UserPlus, LogOut } from 'lucide-react'
import PullToRefresh from './PullToRefresh'
import { useRefreshFn } from '../contexts/RefreshContext'

export default function MobileLayout({ children }) {
  const nav = useNavigate()
  const refreshFn = useRefreshFn()
  const logout = () => { localStorage.clear(); nav('/login') }

  const tabClass = (isActive) =>
    `flex flex-col items-center justify-center gap-1 py-2 px-3 min-w-0 flex-1 text-xs font-medium transition ${
      isActive ? 'text-blue-600' : 'text-gray-500'
    }`

  const tabBarHeight = 'calc(56px + env(safe-area-inset-bottom, 0px))'

  return (
    <div className="bg-gray-50 min-h-[100dvh] flex flex-col">
      {/* Top bar: compact, safe area */}
      <header
        className="bg-white shadow-sm px-4 flex items-center justify-between shrink-0 z-20"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: '0.75rem' }}
      >
        <span className="font-bold text-blue-600 text-lg">Асылзада CRM</span>
        <button
          type="button"
          onClick={logout}
          className="p-2 -m-2 text-gray-500 hover:text-red-600 rounded-full touch-manipulation"
          aria-label="Выйти"
        >
          <LogOut size={22} />
        </button>
      </header>

      {/* Scrollable content with pull-to-refresh; padding so content doesn't hide under fixed tab bar */}
      <main className="max-w-lg mx-auto w-full flex-1 min-h-0 px-4 py-4 flex flex-col">
        <PullToRefresh onRefresh={refreshFn}>
          <div className="min-h-full" style={{ paddingBottom: tabBarHeight }}>
            {children}
          </div>
        </PullToRefresh>
      </main>

      {/* Fixed bottom tab bar — always visible */}
      <nav
        className="bg-white border-t border-gray-200 flex items-stretch fixed left-0 right-0 bottom-0 z-30 w-full"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', minHeight: '56px' }}
      >
        <NavLink to="/mobile" end className={({ isActive }) => tabClass(isActive)}>
          {({ isActive }) => (
            <>
              <LayoutDashboard size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span>Главная</span>
            </>
          )}
        </NavLink>
        <NavLink to="/mobile/clients" className={({ isActive }) => tabClass(isActive)}>
          {({ isActive }) => (
            <>
              <Users size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span>Клиенты</span>
            </>
          )}
        </NavLink>
        <NavLink to="/mobile/clients/register" className={({ isActive }) => tabClass(isActive)}>
          {({ isActive }) => (
            <>
              <UserPlus size={24} strokeWidth={isActive ? 2.5 : 2} />
              <span>Регистрация</span>
            </>
          )}
        </NavLink>
      </nav>
    </div>
  )
}
