import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Plus, Users, ChevronRight, X, Search, CalendarDays, Clock3, Wifi, MapPin } from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { GROUP_TYPE_LABEL } from '../../utils/format'
import AppSelect from '../../components/ui/AppSelect'

const DAY_LABELS = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' }
function fmtDays(s) {
  if (!s) return '—'
  const parts = s.split(' ')
  return parts[0].split(',').map(d => DAY_LABELS[d] || d).join(' · ')
}
function fmtTime(s) {
  if (!s) return ''
  const parts = s.split(' ')
  return parts[1] || ''
}

const STATUS_CONFIG = {
  active:      { gradient: 'linear-gradient(90deg,#be185d,#db2777)', label: 'Активный',  dot: '#be185d', bg: '#fdf2f8', text: '#be185d' },
  recruitment: { gradient: 'linear-gradient(90deg,#d97706,#f59e0b)', label: 'Набор',     dot: '#d97706', bg: '#fffbeb', text: '#b45309' },
  completed:   { gradient: 'linear-gradient(90deg,#9ca3af,#d1d5db)', label: 'Завершён',  dot: '#9ca3af', bg: '#f9fafb', text: '#6b7280' },
}

function trainerInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : name[0].toUpperCase()
}

function GroupCard({ g }) {
  const cfg = STATUS_CONFIG[g.status] || STATUS_CONFIG.completed
  const days = fmtDays(g.schedule)
  const time = fmtTime(g.schedule)
  const isOnline = g.training_format === 'online'

  return (
    <div className="rounded-2xl overflow-hidden transition-all hover:shadow-md active:scale-[0.99]"
         style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 6px rgba(120,40,80,0.06)' }}>

      {/* Status gradient top bar */}
      <div className="h-[3px]" style={{ background: cfg.gradient }} />

      <div className="p-4 pb-3">
        {/* Row 1: title + client badge */}
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold leading-tight truncate" style={{ color: 'var(--text)' }}>
              Группа {g.number}
            </h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {/* Status pill */}
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: cfg.bg, color: cfg.text }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.dot }} />
                {cfg.label}
              </span>
              {/* Format pill */}
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: isOnline ? '#eff6ff' : '#f0fdf4', color: isOnline ? '#1d4ed8' : '#15803d' }}>
                {isOnline ? <Wifi size={9} /> : <MapPin size={9} />}
                {isOnline ? 'Онлайн' : 'Оффлайн'}
              </span>
              {/* Group type */}
              {g.group_type && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: '#f5f5f5', color: 'var(--text-soft)' }}>
                  {GROUP_TYPE_LABEL[g.group_type] || g.group_type}
                </span>
              )}
            </div>
          </div>

          {/* Client count */}
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl shrink-0"
               style={{ background: '#fce7f3' }}>
            <Users size={11} style={{ color: '#be185d' }} />
            <span className="text-xs font-bold tabular-nums" style={{ color: '#be185d' }}>{g.client_count}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px mb-3" style={{ background: 'var(--border)' }} />

        {/* Row 2: Trainer + schedule */}
        <div className="flex items-center gap-3 mb-3">
          {/* Trainer avatar */}
          {g.trainer?.full_name ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 text-white"
                   style={{ background: 'linear-gradient(135deg,#be185d,#9d174d)' }}>
                {trainerInitials(g.trainer.full_name)}
              </div>
              <span className="text-[12.5px] font-medium truncate" style={{ color: 'var(--text)' }}>
                {g.trainer.full_name}
              </span>
            </div>
          ) : (
            <span className="text-xs text-gray-300 flex-1">Нет тренера</span>
          )}
        </div>

        {/* Row 3: schedule + start */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-1.5 min-w-0">
            <CalendarDays size={11} className="text-gray-300 shrink-0" />
            <span className="text-[11.5px] text-gray-500 truncate">{days}</span>
            {time && (
              <>
                <span className="text-gray-200">·</span>
                <Clock3 size={11} className="text-gray-300 shrink-0" />
                <span className="text-[11.5px] font-semibold" style={{ color: 'var(--text-soft)' }}>{time}</span>
              </>
            )}
          </div>
          {g.start_date && (
            <span className="text-[11px] text-gray-400 shrink-0 ml-auto">
              с {g.start_date}
            </span>
          )}
        </div>
      </div>

      {/* Bottom action row */}
      <div className="flex gap-2 px-4 pb-4">
        <Link
          to={`/admin/groups/${g.id}/detail`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12.5px] font-semibold text-white transition hover:opacity-90"
          style={{ background: 'linear-gradient(135deg,#be185d,#9d174d)' }}
        >
          НБ и клиенты <ChevronRight size={12} />
        </Link>
        <Link
          to={`/admin/groups/${g.id}`}
          className="px-4 py-2.5 rounded-xl text-[12.5px] font-medium transition hover:bg-gray-100"
          style={{ background: '#f5f5f5', color: 'var(--text-soft)' }}
        >
          Изменить
        </Link>
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
  const [format, setFormat] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('active')

  const load = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    if (trainer) params.append('trainer', trainer)
    if (format) params.append('training_format', format)
    params.append('page_size', '200')
    const r = await api.get(`/groups/?${params}`)
    setGroups(r.data.results || [])
    setLoading(false)
  }

  useEffect(() => {
    api.get('/trainers/?page_size=100').then(r => setTrainers(r.data.results || []))
  }, [])
  useEffect(() => { load() }, [status, trainer, format])

  const resetFilters = () => { setSearch(''); setTrainer(''); setFormat('') }
  const hasFilters = !!(search || trainer || format)

  const closeGroup = async (id) => {
    if (!confirm('Закрыть группу? Все активные клиенты станут «Завершили»')) return
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
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="crm-page-title">Группы</h2>
          <p className="crm-page-subtitle">{groups.length} групп всего</p>
        </div>
        <Link to="/admin/groups/add" className="crm-btn-primary shrink-0">
          <Plus size={15} /> Новый
        </Link>
      </div>

      {/* ── Stats strip ── */}
      {!loading && groups.length > 0 && (
        <div className="grid grid-cols-3 gap-px bg-gray-100 rounded-2xl overflow-hidden mb-4 shadow-sm">
          {[
            { label: 'Активных', value: active.length, color: '#be185d', bg: '#fdf2f8' },
            { label: 'В наборе', value: recruitment.length, color: '#b45309', bg: '#fffbeb' },
            { label: 'Студентов', value: groups.reduce((s, g) => s + (g.client_count || 0), 0), color: '#1d4ed8', bg: '#eff6ff' },
          ].map(m => (
            <div key={m.label} className="flex flex-col gap-0.5 px-4 py-3" style={{ background: m.bg }}>
              <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: m.color, opacity: 0.7 }}>{m.label}</span>
              <span className="text-2xl font-black leading-none" style={{ color: m.color }}>{m.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Фильтры ── */}
      <div className="crm-card p-3 mb-4">
        <div className="flex flex-wrap gap-2 items-end">

          {/* Поиск */}
          <div className="crm-filter-group flex-1 min-w-[180px]">
            <span className="crm-filter-label">Поиск</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xs)' }} />
              <input type="text" placeholder="Номер группы, тренер..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="crm-input pl-8" />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 transition"
                  style={{ color: 'var(--text-xs)' }}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Тренер */}
          <div className="crm-filter-group">
            <span className="crm-filter-label">Тренер</span>
            <AppSelect value={trainer} onChange={e => setTrainer(e.target.value)}
              className="w-44">
              <option value="">Все тренеры</option>
              {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </AppSelect>
          </div>

          {/* Формат */}
          <div className="crm-filter-group">
            <span className="crm-filter-label">Формат</span>
            <AppSelect value={format} onChange={e => setFormat(e.target.value)}
              className="w-36">
              <option value="">Все форматы</option>
              <option value="online">Онлайн</option>
              <option value="offline">Оффлайн</option>
            </AppSelect>
          </div>

          {/* Сброс */}
          {hasFilters && (
            <button onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs transition pb-[1px]"
              style={{ color: 'var(--text-xs)' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-xs)'}>
              <X size={13} /> Сброс
            </button>
          )}
        </div>
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
            {search ? 'Ничего не найдено' : `Нет групп в статусе "${TABS.find(t=>t.key===activeTab)?.label}"`}
          </p>
          {!search && (
            <Link to="/admin/groups/add" className="crm-btn-primary mt-4 inline-flex">
              <Plus size={14} /> Создать группу
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {shown.map(g => (
            <GroupCard key={g.id} g={g} />
          ))}
        </div>
      )}
    </AdminLayout>
  )
}
