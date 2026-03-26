import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Plus, Users, ChevronRight, X, Search, Clock, CheckCircle, Loader } from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL, GROUP_TYPE_LABEL } from '../../utils/format'

const DAY_LABELS = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' }
function fmtSchedule(s) {
  if (!s) return '—'
  const parts = s.split(' ')
  const days = parts[0].split(',').map(d => DAY_LABELS[d] || d).join(', ')
  return days + (parts[1] ? ` · ${parts[1]}` : '')
}

const STATUS_CONFIG = {
  active:      { gradient: 'linear-gradient(135deg,#be185d,#db2777)', label: 'Активный',  dot: '#be185d' },
  recruitment: { gradient: 'linear-gradient(135deg,#d97706,#f59e0b)', label: 'Набор',     dot: '#d97706' },
  completed:   { gradient: 'linear-gradient(135deg,#6b7280,#9ca3af)', label: 'Завершён',  dot: '#6b7280' },
}

function GroupCard({ g, onClose }) {
  const cfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.completed
  return (
    <div className="rounded-2xl overflow-hidden transition-all active:scale-[0.99]"
         style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(120,40,80,0.05)' }}>

      {/* Цветная полоска */}
      <div className="h-1" style={{ background: cfg.gradient }} />

      <div className="p-4">
        {/* Заголовок */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-tight" style={{ color: 'var(--text)' }}>
                Поток #{g.number}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                    style={{ background: '#f5f5f5', color: 'var(--text-soft)' }}>
                {GROUP_TYPE_LABEL[g.group_type] || g.group_type}
              </span>
            </div>
            {/* Статус-точка */}
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
              <span className="text-xs font-medium" style={{ color: cfg.dot }}>
                {cfg.label}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl shrink-0"
               style={{ background: '#fce7f3' }}>
            <Users size={12} style={{ color: '#be185d' }} />
            <span className="text-xs font-bold" style={{ color: '#be185d' }}>{g.client_count}</span>
          </div>
        </div>

        {/* Детали — горизонтально на мобиле */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
          {g.trainer?.full_name && (
            <div className="col-span-2">
              <p className="text-xs" style={{ color: 'var(--text-xs)' }}>Тренер</p>
              <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                {g.trainer.full_name}
              </p>
            </div>
          )}
          <div>
            <p className="text-xs" style={{ color: 'var(--text-xs)' }}>График</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{fmtSchedule(g.schedule)}</p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--text-xs)' }}>Старт</p>
            <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{g.start_date || '—'}</p>
          </div>
        </div>

        {/* Кнопки */}
        <div className="flex gap-2">
          <Link to={`/admin/groups/${g.id}/detail`}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold text-white transition"
            style={{ background: 'linear-gradient(135deg,#be185d,#9d174d)' }}>
            НБ и клиенты <ChevronRight size={12} />
          </Link>
          <Link to={`/admin/groups/${g.id}`}
            className="px-3.5 py-2.5 rounded-xl text-xs font-medium transition"
            style={{ background: '#f5f5f5', color: 'var(--text-soft)' }}>
            Изменить
          </Link>
          {g.status !== 'completed' && (
            <button onClick={() => onClose(g.id)}
              className="px-3 py-2.5 rounded-xl text-xs font-medium transition"
              style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Groups() {
  const { user } = useOutletContext()
  const [groups, setGroups] = useState([])
  const [trainers, setTrainers] = useState([])
  const [status, setStatus] = useState('')
  const [trainer, setTrainer] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('active')

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    if (trainer) params.append('trainer', trainer)
    params.append('page_size', '200')
    const r = await api.get(`/groups/?${params}`)
    setGroups(r.data.results || [])
    setLoading(false)
  }

  useEffect(() => {
    api.get('/trainers/?page_size=100').then(r => setTrainers(r.data.results || []))
  }, [])
  useEffect(() => { load() }, [status, trainer])

  const closeGroup = async (id) => {
    if (!confirm('Закрыть поток? Все активные клиенты станут «Завершили»')) return
    try { await api.post(`/groups/${id}/close/`); load() }
    catch (e) { alert(e.response?.data?.detail || 'Ошибка') }
  }

  const filtered = groups.filter(g => {
    if (search && !String(g.number).includes(search) &&
        !(g.trainer?.full_name || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const active      = filtered.filter(g => g.status === 'active')
  const recruitment = filtered.filter(g => g.status === 'recruitment')
  const completed   = filtered.filter(g => g.status === 'completed')

  const TABS = [
    { key: 'active',      label: 'Активные',    count: active.length,      dot: '#be185d' },
    { key: 'recruitment', label: 'Набор',        count: recruitment.length, dot: '#d97706' },
    { key: 'completed',   label: 'Завершённые',  count: completed.length,   dot: '#6b7280' },
  ]
  const tabData = { active, recruitment, completed }
  const shown = tabData[activeTab] || []

  return (
    <AdminLayout user={user}>

      {/* ── Заголовок ── */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="crm-page-title">Потоки</h2>
          <p className="crm-page-subtitle">{groups.length} групп всего</p>
        </div>
        <Link to="/admin/groups/add" className="crm-btn-primary shrink-0">
          <Plus size={15} /> Новый
        </Link>
      </div>

      {/* ── Поиск + фильтр тренера ── */}
      <div className="crm-card p-3 mb-4 flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xs)' }} />
          <input type="text" placeholder="Поиск потока..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="crm-input pl-8" />
        </div>
        <select value={trainer} onChange={e => setTrainer(e.target.value)}
          className="crm-input w-full sm:w-44">
          <option value="">Все тренеры</option>
          {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
        {(search || trainer) && (
          <button onClick={() => { setSearch(''); setTrainer('') }}
            className="flex items-center gap-1 text-xs transition" style={{ color: 'var(--text-xs)' }}>
            <X size={13} /> Сброс
          </button>
        )}
      </div>

      {/* ── Табы ── */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar pb-0.5">
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition shrink-0"
            style={activeTab === tab.key
              ? { background: '#fce7f3', color: '#be185d', border: '1px solid #fbcfe8' }
              : { background: '#fff', color: 'var(--text-soft)', border: '1px solid var(--border)' }
            }>
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tab.dot }} />
            {tab.label}
            <span className="px-1.5 py-0.5 rounded-md text-xs font-bold"
                  style={activeTab === tab.key
                    ? { background: '#be185d', color: '#fff' }
                    : { background: '#f3f4f6', color: 'var(--text-xs)' }
                  }>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── Контент ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="rounded-2xl p-4 animate-pulse" style={{ background: '#fff', border: '1px solid var(--border)' }}>
              <div className="h-1 w-full rounded-full skeleton mb-4" />
              <div className="h-4 skeleton rounded w-1/3 mb-2" />
              <div className="h-3 skeleton rounded w-2/3 mb-1" />
              <div className="h-3 skeleton rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <div className="crm-card p-12 text-center">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
               style={{ background: '#fce7f3' }}>
            <Plus size={20} style={{ color: '#be185d' }} />
          </div>
          <p className="font-medium mb-1" style={{ color: 'var(--text-soft)' }}>
            {search ? 'Ничего не найдено' : `Нет потоков в статусе "${TABS.find(t=>t.key===activeTab)?.label}"`}
          </p>
          {!search && (
            <Link to="/admin/groups/add" className="crm-btn-primary mt-4 inline-flex">
              <Plus size={14} /> Создать поток
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map(g => (
            <GroupCard key={g.id} g={g} onClose={closeGroup} />
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
