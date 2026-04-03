import { useState, useEffect, useCallback } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  Globe, Dumbbell, CheckCircle, Clock, Plus,
  UserCircle, BarChart2, TrendingUp, Users, Layers2,
  ArrowUpRight, Calendar, Activity, Gift, RotateCcw,
  ArrowDownLeft, ArrowUpLeft, ChevronDown, ChevronUp, Filter, X, Info
} from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { fmtMoney, fmtDateTime } from '../../utils/format'

function StatCard({ label, value, icon: Icon, gradient, trend }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white shadow-lg ${gradient}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/70 text-xs font-medium uppercase tracking-widest mb-2">{label}</p>
          <p className="text-3xl font-bold leading-none">{value ?? '—'}</p>
          {trend && <p className="text-white/60 text-xs mt-2">{trend}</p>}
        </div>
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center">
          <Icon size={22} strokeWidth={2} className="text-white" />
        </div>
      </div>
      <div className="absolute -right-4 -bottom-4 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl p-5 bg-white border border-slate-200 animate-pulse">
      <div className="h-3 bg-slate-200 rounded w-1/2 mb-3" />
      <div className="h-8 bg-slate-200 rounded w-2/3" />
    </div>
  )
}

const EVENT_CONFIG = {
  income_full: {
    label: 'Полная оплата', sign: '+',
    colorSign: 'text-emerald-600', colorBg: 'bg-emerald-50', colorBorder: 'border-emerald-100',
    Icon: ArrowDownLeft, iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600',
    verb: 'Получено от', dot: 'bg-emerald-500',
  },
  income_install: {
    label: 'Рассрочка', sign: '+',
    colorSign: 'text-teal-600', colorBg: 'bg-teal-50', colorBorder: 'border-teal-100',
    Icon: ArrowDownLeft, iconBg: 'bg-teal-100', iconColor: 'text-teal-600',
    verb: 'Получено от', dot: 'bg-teal-500',
  },
  bonus_out: {
    label: 'Бонус начислен', sign: '−',
    colorSign: 'text-amber-600', colorBg: 'bg-amber-50', colorBorder: 'border-amber-100',
    Icon: Gift, iconBg: 'bg-amber-100', iconColor: 'text-amber-600',
    verb: 'Бонус выплачен', dot: 'bg-amber-500',
  },
  bonus_returned: {
    label: 'Возврат бонуса', sign: '+',
    colorSign: 'text-indigo-600', colorBg: 'bg-indigo-50', colorBorder: 'border-indigo-100',
    Icon: RotateCcw, iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600',
    verb: 'Бонус возвращён от', dot: 'bg-indigo-500',
  },
  refund: {
    label: 'Возврат денег', sign: '−',
    colorSign: 'text-red-600', colorBg: 'bg-red-50', colorBorder: 'border-red-100',
    Icon: ArrowUpLeft, iconBg: 'bg-red-100', iconColor: 'text-red-600',
    verb: 'Возврат клиенту', dot: 'bg-red-500',
  },
}

// ── Строка события (с поддержкой раскрытия sub_items) ────────────────────────
function EventRow({ ev }) {
  const [open, setOpen] = useState(false)
  const cfg   = EVENT_CONFIG[ev.type] || EVENT_CONFIG.income_full
  const { Icon } = cfg
  const hasSubItems = ev.sub_items?.length > 0

  return (
    <div className={`rounded-xl border overflow-hidden ${cfg.colorBorder}`}>
      {/* Главная строка */}
      <div className={`flex items-center gap-3 p-3 ${cfg.colorBg} ${hasSubItems ? 'cursor-pointer' : ''}`}
           onClick={() => hasSubItems && setOpen(v => !v)}>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${cfg.iconBg}`}>
          <Icon size={14} className={cfg.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">
            <span className="text-slate-400">{cfg.verb} </span>
            <span className="font-semibold">{ev.client_name}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {fmtDateTime(ev.date)} · {cfg.label}
            {hasSubItems && (
              <span className="ml-2 px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-600 font-semibold">
                {ev.sub_items.length + 1} платежей
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-sm font-bold crm-money ${cfg.colorSign}`}>
            {cfg.sign} {fmtMoney(ev.amount)}
          </span>
          {hasSubItems && (
            open
              ? <ChevronUp size={13} className="text-slate-400" />
              : <ChevronDown size={13} className="text-slate-400" />
          )}
        </div>
      </div>

      {/* Раскрытые sub_items */}
      {open && hasSubItems && (
        <div className="border-t border-teal-100 bg-white divide-y divide-teal-50">
          {ev.sub_items.map((s, si) => (
            <div key={si} className="flex items-center justify-between px-4 py-2 text-xs">
              <span className="text-slate-400">{fmtDateTime(s.date)}</span>
              <span className="font-semibold text-teal-700 crm-money">+ {fmtMoney(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function IncomeHistorySection() {
  const [events,      setEvents]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [limit,       setLimit]       = useState(20)
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [showFilter,  setShowFilter]  = useState(false)
  const [appliedFrom, setAppliedFrom] = useState('')
  const [appliedTo,   setAppliedTo]   = useState('')

  const fetchEvents = useCallback((from, to, lim) => {
    setLoading(true)
    const params = new URLSearchParams({ limit: lim })
    if (from) params.set('date_from', from)
    if (to)   params.set('date_to', to)
    api.get(`/statistics/income-history/?${params}`)
      .then(r => setEvents(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchEvents(appliedFrom, appliedTo, limit)
  }, [appliedFrom, appliedTo, limit, fetchEvents])

  const applyFilter = () => {
    setLimit(20); setAppliedFrom(dateFrom); setAppliedTo(dateTo); setShowFilter(false)
  }
  const clearFilter = () => {
    setDateFrom(''); setDateTo(''); setAppliedFrom(''); setAppliedTo(''); setLimit(20); setShowFilter(false)
  }

  const hasFilter = !!(appliedFrom || appliedTo)
  const totalIn  = hasFilter ? events.filter(e => EVENT_CONFIG[e.type]?.sign === '+').reduce((s, e) => s + Number(e.amount), 0) : 0
  const totalOut = hasFilter ? events.filter(e => EVENT_CONFIG[e.type]?.sign === '−').reduce((s, e) => s + Number(e.amount), 0) : 0
  const netTotal = totalIn - totalOut
  const periodLabel = hasFilter ? `${appliedFrom || '…'} → ${appliedTo || '…'}` : null

  return (
    <div className="crm-card p-5">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
            <Activity size={16} className="text-slate-600" />
          </div>
          <h3 className="font-semibold text-slate-800">История операций</h3>
          {hasFilter && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
              {periodLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(EVENT_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
              <span className="text-xs text-slate-400">{cfg.label}</span>
            </div>
          ))}
          <button onClick={() => setShowFilter(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
              hasFilter ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
            }`}>
            <Filter size={12} />
            {hasFilter ? 'Изменить' : 'Фильтр по дате'}
          </button>
        </div>
      </div>

      {/* Подсказка без фильтра */}
      {!hasFilter && (
        <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl mb-4">
          <Info size={14} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Лента показывает последние <strong>{limit}</strong> операций.
            Сумма «Приход / Расход / Итого» доступна при выборе периода —
            нажмите <strong>«Фильтр по дате»</strong>. Общий доход за всё время — в карточке выше.
          </p>
        </div>
      )}

      {/* Панель фильтра */}
      {showFilter && (
        <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Выберите период</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">От</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="crm-input text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">До</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="crm-input text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={applyFilter} className="crm-btn-primary text-sm py-2">Применить</button>
              {hasFilter && (
                <button onClick={clearFilter}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border border-slate-200 text-slate-500 hover:bg-slate-100 transition">
                  <X size={13} /> Сбросить
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Итого за период */}
      {hasFilter && events.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
            <p className="text-xs text-slate-500 mb-0.5">Приход за период</p>
            <p className="font-bold text-emerald-600 text-sm crm-money">+ {fmtMoney(totalIn)}</p>
          </div>
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-center">
            <p className="text-xs text-slate-500 mb-0.5">Расход за период</p>
            <p className="font-bold text-red-500 text-sm crm-money">− {fmtMoney(totalOut)}</p>
          </div>
          <div className={`p-3 border rounded-xl text-center ${netTotal >= 0 ? 'bg-indigo-50 border-indigo-100' : 'bg-amber-50 border-amber-100'}`}>
            <p className="text-xs text-slate-500 mb-0.5">Итого за период</p>
            <p className={`font-bold text-sm crm-money ${netTotal >= 0 ? 'text-indigo-600' : 'text-amber-600'}`}>
              {netTotal >= 0 ? '+' : '−'} {fmtMoney(Math.abs(netTotal))}
            </p>
          </div>
        </div>
      )}

      {/* Список */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="animate-pulse flex gap-3 p-3 rounded-xl bg-slate-50">
              <div className="w-8 h-8 rounded-lg bg-slate-200 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 bg-slate-200 rounded w-3/4" />
                <div className="h-2 bg-slate-200 rounded w-1/2" />
              </div>
              <div className="h-4 bg-slate-200 rounded w-24 shrink-0" />
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          {hasFilter ? 'Нет операций за выбранный период' : 'Операций пока нет'}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {events.map((ev, i) => <EventRow key={i} ev={ev} />)}
          </div>
          {events.length >= limit && (
            <button onClick={() => setLimit(l => l + 20)}
              className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition">
              <ChevronDown size={15} /> Показать ещё
            </button>
          )}
        </>
      )}
    </div>
  )
}

export default function Dashboard() {
  const { user } = useOutletContext()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    api.get('/statistics/dashboard/').then(r => setStats(r.data))
  }, [])

  const today = new Date().toLocaleDateString('ru-RU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <AdminLayout user={user}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">Обзор системы</p>
          <h2 className="crm-page-title">Дашборд</h2>
          <p className="crm-page-subtitle">Оперативные метрики Асылзада CRM</p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
          <Calendar size={15} className="text-indigo-500" />
          <span className="text-sm text-slate-600 capitalize">{today}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {stats ? (
          <>
            <StatCard label="Общий доход" value={fmtMoney(stats.total_revenue)}
              gradient="bg-gradient-to-br from-rose-500 to-pink-600" icon={TrendingUp} trend="Все оплаты за всё время" />
            <StatCard label="Активных клиентов" value={stats.active_clients}
              gradient="bg-gradient-to-br from-violet-500 to-purple-600" icon={Users} trend="Сейчас обучаются" />
            <StatCard label="Активных потоков" value={stats.active_groups_count}
              gradient="bg-gradient-to-br from-amber-500 to-orange-600" icon={Layers2} trend="Идут занятия" />
            <StatCard label="Всего НБ" value={stats.total_absences}
              gradient="bg-gradient-to-br from-slate-500 to-slate-700" icon={Activity} trend="Пропуски" />
          </>
        ) : [1,2,3,4].map(i => <SkeletonCard key={i} />)}
      </div>

      {stats && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">
          <div className="crm-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center"><Globe size={16} className="text-indigo-600" /></div>
              <h3 className="font-semibold text-slate-800">Доход по формату</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center"><Globe size={16} className="text-blue-600" /></div>
                  <div><p className="text-sm font-medium text-slate-700">Онлайн</p><p className="text-xs text-slate-400">Удалённый формат</p></div>
                </div>
                <p className="font-bold text-blue-600 crm-money">{fmtMoney(stats.online_revenue)}</p>
              </div>
              <div className="flex items-center justify-between p-3 bg-violet-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center"><Dumbbell size={16} className="text-violet-600" /></div>
                  <div><p className="text-sm font-medium text-slate-700">Оффлайн</p><p className="text-xs text-slate-400">Очный формат</p></div>
                </div>
                <p className="font-bold text-violet-600 crm-money">{fmtMoney(stats.offline_revenue)}</p>
              </div>
            </div>
          </div>
          <div className="crm-card p-5">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><CheckCircle size={16} className="text-emerald-600" /></div>
              <h3 className="font-semibold text-slate-800">Статус оплат</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: 'Полная оплата (закрыта)', value: stats.closed_full_payments, color: 'text-emerald-600', bg: 'bg-emerald-50', iconBg: 'bg-emerald-100', icon: CheckCircle, iconColor: 'text-emerald-600' },
                { label: 'Рассрочка (закрыта)',     value: stats.closed_installment_plans, color: 'text-teal-600', bg: 'bg-teal-50', iconBg: 'bg-teal-100', icon: CheckCircle, iconColor: 'text-teal-600' },
                { label: 'Рассрочка (частичная)',   value: stats.partial_installment_plans, color: 'text-amber-600', bg: 'bg-amber-50', iconBg: 'bg-amber-100', icon: Clock, iconColor: 'text-amber-600' },
              ].map(item => {
                const Icon = item.icon
                return (
                  <div key={item.label} className={`flex items-center justify-between p-3 ${item.bg} rounded-xl`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 ${item.iconBg} rounded-lg flex items-center justify-center`}>
                        <Icon size={14} className={item.iconColor} />
                      </div>
                      <p className="text-sm text-slate-700">{item.label}</p>
                    </div>
                    <span className={`text-lg font-bold ${item.color}`}>{item.value}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      <div className="mb-8"><IncomeHistorySection /></div>

      <div>
        <p className="crm-section-title">Быстрые действия</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/admin/groups/add" className="group crm-card p-5 hover:border-indigo-300 hover:shadow-md transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200 shrink-0 group-hover:scale-105 transition-transform">
              <Plus size={22} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">Новый поток</p>
              <p className="text-xs text-slate-400 mt-0.5">Создать учебную группу</p>
            </div>
            <ArrowUpRight size={16} className="text-slate-300 group-hover:text-indigo-400 transition-colors shrink-0" />
          </Link>
          <Link to="/admin/trainers/add" className="group crm-card p-5 hover:border-emerald-300 hover:shadow-md transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-200 shrink-0 group-hover:scale-105 transition-transform">
              <UserCircle size={22} className="text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 group-hover:text-emerald-600 transition-colors">Новый тренер</p>
              <p className="text-xs text-slate-400 mt-0.5">Добавить в команду</p>
            </div>
            <ArrowUpRight size={16} className="text-slate-300 group-hover:text-emerald-400 transition-colors shrink-0" />
          </Link>
          <Link to="/admin/statistics" className="group crm-card p-5 hover:border-rose-300 hover:shadow-md transition-all flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500 flex items-center justify-center shadow-lg shadow-rose-200 shrink-0 group-hover:scale-105 transition-transform">
              <BarChart2 size={22} className="text-white" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-800 group-hover:text-rose-600 transition-colors">Статистика</p>
              <p className="text-xs text-slate-400 mt-0.5">Финансовый отчёт</p>
            </div>
            <ArrowUpRight size={16} className="text-slate-300 group-hover:text-rose-400 transition-colors shrink-0" />
          </Link>
        </div>
      </div>
    </AdminLayout>
  )
}
