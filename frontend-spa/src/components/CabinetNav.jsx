/**
 * CabinetNav — fixed bottom navigation for student cabinet.
 * Used on: CabinetProfile, LessonsList, StreamArchive.
 */
import { Link, useLocation } from 'react-router-dom'
import { Home, BookOpen, Radio, Archive } from 'lucide-react'

const TABS = [
  { to: '/cabinet/profile',  icon: Home,     label: 'Главная' },
  { to: '/cabinet/lessons',  icon: BookOpen, label: 'Уроки'   },
  { to: '/cabinet/archive',  icon: Archive,  label: 'Записи'  },
  { to: '/cabinet/stream',   icon: Radio,    label: 'Эфир'    },
]

export default function CabinetNav() {
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-gray-100 safe-area-inset-bottom">
      <div className="flex items-stretch max-w-md mx-auto">
        {TABS.map(({ to, icon: Icon, label }) => {
          const active = pathname === to || (to !== '/cabinet/profile' && pathname.startsWith(to))
          return (
            <Link
              key={to}
              to={to}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 transition-colors ${
                active ? 'text-rose-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
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
