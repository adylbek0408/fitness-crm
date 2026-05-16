/**
 * CabinetNav — fixed bottom navigation for student cabinet.
 * Shows a red dot on "Уроки" when there are lessons published after the
 * student's last visit to /cabinet/lessons (tracked via localStorage).
 */
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Home, BookOpen, Radio, Archive } from 'lucide-react'
import api from '../api/axios'

const TABS = [
  { to: '/cabinet/profile',  icon: Home,     label: 'Главная',   dot: false },
  { to: '/cabinet/lessons',  icon: BookOpen, label: 'Уроки',     dot: true  },
  { to: '/cabinet/archive',  icon: Archive,  label: 'Записи',    dot: false },
  { to: '/cabinet/stream',   icon: Radio,    label: 'Эфир',      dot: false },
]

const LS_KEY = 'cabinet_lessons_seen_at'

export default function CabinetNav() {
  const { pathname } = useLocation()
  const [hasNew, setHasNew] = useState(false)

  // When user visits lessons page — mark as seen
  useEffect(() => {
    if (pathname === '/cabinet/lessons' || pathname.startsWith('/cabinet/lessons/')) {
      localStorage.setItem(LS_KEY, Date.now().toString())
      setHasNew(false)
    }
  }, [pathname])

  // Check for new lessons once on mount (lightweight: only first item)
  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) return
    let mounted = true
    const seenAt = parseInt(localStorage.getItem(LS_KEY) || '0', 10)
    api.get('/cabinet/education/lessons/?page_size=1')
      .then(r => {
        if (!mounted) return
        const items = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        if (items.length > 0) {
          const newestAt = new Date(items[0].published_at || items[0].created_at).getTime()
          setHasNew(newestAt > seenAt)
        }
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-100 safe-area-inset-bottom">
      <div className="flex items-stretch max-w-md mx-auto">
        {TABS.map(({ to, icon: Icon, label, dot }) => {
          const active = pathname === to || pathname.startsWith(to + '/')
          const showDot = dot && hasNew && !active
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 transition-colors relative ${
                active ? 'text-rose-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <div className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                {showDot && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white" />
                )}
              </div>
              <span className={`text-[10px] font-medium leading-none ${active ? 'text-rose-600' : ''}`}>
                {label}
              </span>
              {active && (
                <span className="absolute bottom-0 w-10 h-0.5 bg-rose-500 rounded-t-full" />
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
