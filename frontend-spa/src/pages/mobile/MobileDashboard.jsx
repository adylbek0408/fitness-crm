import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { UserPlus, Users, TrendingUp, UserCheck, Layers2, ChevronRight } from 'lucide-react'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'
import api from '../../api/axios'
import { fmtMoney } from '../../utils/format'

export default function MobileDashboard() {
  const { user } = useOutletContext()
  const [stats, setStats] = useState(null)
  const [recent, setRecent] = useState([])
  const [regFrom, setRegFrom] = useState('')
  const [regTo, setRegTo] = useState('')

  const loadRecent = () => {
    if (!user?.id || user?.role !== 'registrar') {
      setRecent([])
      return
    }
    const params = new URLSearchParams({ page_size: '5', ordering: '-registered_at', registered_by: user.id })
    if (regFrom) params.append('registered_from', regFrom)
    if (regTo) params.append('registered_to', regTo)
    api.get(`/clients/?${params}`)
      .then(r => setRecent(r.data.results || []))
      .catch(() => setRecent([]))
  }

  useRefresh(() => {
    if (user?.role === 'admin') {
      api.get('/statistics/dashboard/').then(r => setStats(r.data)).catch(() => setStats(null))
    }
    loadRecent()
  })

  useEffect(() => {
    if (user?.role !== 'admin') {
      setStats(null)
      return
    }
    api.get('/statistics/dashboard/').then(r => setStats(r.data)).catch(() => setStats(null))
  }, [user?.role])

  useEffect(() => {
    loadRecent()
  }, [user?.id, user?.role, regFrom, regTo])

  const roleMap = { admin: 'Администратор', registrar: 'Регистратор' }
  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Доброе утро'
    if (h < 18) return 'Добрый день'
    return 'Добрый вечер'
  }

  return (
    <MobileLayout>
      <div className="mb-6">
        <p className="text-sm mb-0.5" style={{ color: 'var(--text-xs)' }}>{greeting()},</p>
        <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>
          {user?.username}
        </h2>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-xs)' }}>
          {roleMap[user?.role] || user?.role}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link to="/mobile/clients/register"
          className="relative overflow-hidden rounded-2xl p-5 flex flex-col items-center justify-center text-center text-white min-h-[110px] active:scale-[0.97] transition-transform"
          style={{ background: 'linear-gradient(135deg, #be185d, #7c3aed)', boxShadow: '0 6px 20px rgba(190,24,93,0.30)' }}>
          <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-20"
               style={{ background: 'radial-gradient(circle,#fff,transparent)' }} />
          <UserPlus size={28} strokeWidth={2} className="mb-2 relative z-10" />
          <span className="text-sm font-semibold relative z-10">Регистрация</span>
          <span className="text-xs opacity-70 mt-0.5 relative z-10">нового клиента</span>
        </Link>

        <Link to="/mobile/clients"
          className="rounded-2xl p-5 flex flex-col items-center justify-center text-center min-h-[110px] active:scale-[0.97] transition-transform"
          style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(120,40,80,0.05)' }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-2"
               style={{ background: '#fce7f3' }}>
            <Users size={20} style={{ color: '#be185d' }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>База клиентов</span>
          {stats && (
            <span className="text-xs mt-0.5" style={{ color: 'var(--text-xs)' }}>
              {stats.active_clients} активных
            </span>
          )}
        </Link>
      </div>

      {user?.role === 'registrar' && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#fff', border: '1px solid var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-xs)' }}>
            Последние регистрации
          </p>
          <div className="flex gap-2 mb-3 flex-wrap">
            <input type="date" value={regFrom} onChange={e => setRegFrom(e.target.value)}
              className="text-xs rounded-lg border px-2 py-1.5 flex-1 min-w-[120px]" style={{ borderColor: 'var(--border)' }} />
            <input type="date" value={regTo} onChange={e => setRegTo(e.target.value)}
              className="text-xs rounded-lg border px-2 py-1.5 flex-1 min-w-[120px]" style={{ borderColor: 'var(--border)' }} />
          </div>
          {recent.length === 0 ? (
            <p className="text-sm text-center py-4" style={{ color: 'var(--text-xs)' }}>Нет записей за выбранный период</p>
          ) : (
            <ul className="space-y-2">
              {recent.map(c => (
                <li key={c.id}>
                  <Link to={`/mobile/clients/${c.id}`}
                    className="flex items-center justify-between gap-2 p-3 rounded-xl active:scale-[0.99] transition"
                    style={{ background: '#fdf2f8', border: '1px solid #fce7f3' }}>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: 'var(--text)' }}>{c.full_name}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--text-xs)' }}>{c.phone} · {c.registered_at}</p>
                    </div>
                    <ChevronRight size={16} style={{ color: '#be185d' }} className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stats && (
        <div className="rounded-2xl overflow-hidden mb-4"
             style={{ background: '#fff', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-soft)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-xs)' }}>
              Сводка
            </p>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y" style={{ borderColor: 'var(--border-soft)' }}>
            {[
              { icon: TrendingUp, label: 'Общий доход', value: fmtMoney(stats.total_revenue), color: '#be185d', bg: '#fce7f3' },
              { icon: UserCheck, label: 'Активных', value: stats.active_clients, color: '#7c3aed', bg: '#ede9fe' },
              { icon: Layers2, label: 'Групп', value: stats.active_groups_count, color: '#d97706', bg: '#fef3c7' },
              { icon: Users, label: 'Пропусков', value: stats.total_absences, color: '#6b7280', bg: '#f3f4f6' },
            ].map(({ icon: Icon, label, value, color, bg }) => (
              <div key={label} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                     style={{ background: bg }}>
                  <Icon size={16} style={{ color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs truncate" style={{ color: 'var(--text-xs)' }}>{label}</p>
                  <p className="font-bold text-sm leading-tight" style={{ color: 'var(--text)' }}>{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </MobileLayout>
  )
}
