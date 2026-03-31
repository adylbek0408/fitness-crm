import { NavLink, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Users, UserPlus, LogOut, Activity } from 'lucide-react'
import PullToRefresh from './PullToRefresh'
import { useRefreshFn } from '../contexts/RefreshContext'

export default function MobileLayout({ children }) {
  const nav = useNavigate()
  const refreshFn = useRefreshFn()
  const logout = () => { localStorage.clear(); nav('/login') }

  const tabBarHeight = 'calc(64px + env(safe-area-inset-bottom, 0px))'

  const tabClass = (isActive) =>
    `flex flex-col items-center justify-center gap-1 py-2 px-3 min-w-0 flex-1 text-xs font-medium transition-all ${
      isActive ? 'text-rose-600' : 'text-slate-400'
    }`

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'var(--bg)' }}>

      {/* Top bar */}
      <header className="bg-white border-b flex items-center justify-between shrink-0 z-20 px-4"
        style={{
          borderColor: 'var(--border)',
          paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
          paddingBottom: '0.75rem',
        }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #be185d, #7c3aed)' }}>
            <Activity size={13} className="text-white" strokeWidth={2} />
          </div>
          <span className="font-semibold text-sm" style={{ color: 'var(--text)', letterSpacing: '-0.015em' }}>
            Асылзада CRM
          </span>
        </div>
        <button type="button" onClick={logout}
          className="p-2 -m-2 rounded-full touch-manipulation transition"
          style={{ color: 'var(--text-xs)' }}
          aria-label="Выйти">
          <LogOut size={20} />
        </button>
      </header>

      {/* Content */}
      <main className="max-w-lg mx-auto w-full flex-1 min-h-0 px-4 py-4 flex flex-col">
        <PullToRefresh onRefresh={refreshFn}>
          <div className="min-h-full" style={{ paddingBottom: tabBarHeight }}>
            {children}
          </div>
        </PullToRefresh>
      </main>

      {/* Bottom tab bar */}
      <nav className="fixed left-0 right-0 bottom-0 z-30 w-full flex items-stretch bg-white border-t"
           style={{
             borderColor: 'var(--border)',
             paddingBottom: 'env(safe-area-inset-bottom)',
             minHeight: '60px',
             boxShadow: '0 -4px 20px rgba(120,40,80,0.06)',
           }}>
        <NavLink to="/mobile" end className={({ isActive }) => tabClass(isActive)}>
          {({ isActive }) => (
            <>
              <LayoutDashboard size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span>Главная</span>
            </>
          )}
        </NavLink>
        <NavLink to="/mobile/clients" className={({ isActive }) => tabClass(isActive)}>
          {({ isActive }) => (
            <>
              <Users size={22} strokeWidth={isActive ? 2.5 : 1.8} />
              <span>Клиенты</span>
            </>
          )}
        </NavLink>
        <NavLink to="/mobile/clients/register" className={({ isActive }) => tabClass(isActive)}>
          {({ isActive }) => (
            <>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isActive ? 'shadow-lg' : ''
              }`} style={isActive
                  ? { background: 'linear-gradient(135deg,#be185d,#7c3aed)', boxShadow: '0 4px 14px rgba(190,24,93,0.3)' }
                  : { background: '#f5e8ef' }
                }>
                <UserPlus size={18} strokeWidth={2}
                  style={{ color: isActive ? '#fff' : '#be185d' }} />
              </div>
            </>
          )}
        </NavLink>
      </nav>
    </div>
  )
}
