import { useState, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  CheckCircle, Clock, Globe, Dumbbell, RotateCcw,
  ChevronDown, Search, SlidersHorizontal, X, ChevronLeft, ChevronRight
} from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, fmtDate } from '../../utils/format'

const STATUS_OPTIONS = [
  { value: 'active',    label: 'Активный',  dot: 'bg-emerald-500' },
  { value: 'frozen',    label: 'Заморозка', dot: 'bg-blue-500'    },
  { value: 'completed', label: 'Завершил',  dot: 'bg-slate-400'   },
  { value: 'expelled',  label: 'Отчислен',  dot: 'bg-red-500'     },
]

function StatusDropdown({ clientId, currentStatus, onChanged }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => { if (error) { const t = setTimeout(() => setError(''), 3000); return () => clearTimeout(t) } }, [error])

  if (currentStatus === 'new') {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE.new}`}>
        {STATUS_LABEL.new}
      </span>
    )
  }

  const changeStatus = async (newStatus) => {
    if (newStatus === currentStatus) { setOpen(false); return }
    setLoading(true); setOpen(false); setError('')
    try {
      const r = await api.post(`/clients/${clientId}/change_status/`, { status: newStatus })
      onChanged(clientId, r.data.status)
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка') }
    finally { setLoading(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition
          ${STATUS_BADGE[currentStatus] || 'bg-slate-100 text-slate-600'} hover:opacity-80 disabled:opacity-50 cursor-pointer`}
      >
        {loading ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : STATUS_LABEL[currentStatus] || currentStatus}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute z-50 top-8 left-0 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 min-w-[150px] animate-fade-in">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => changeStatus(opt.value)}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-50 transition flex items-center gap-2.5
                ${opt.value === currentStatus ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
              {opt.label}
              {opt.value === currentStatus && <CheckCircle size={12} className="ml-auto text-indigo-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function PayBadge({ c }) {
  if (c.payment_type === 'full') {
    return c.full_payment?.is_paid
      ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle size={12} /> Оплачено</span>
      : <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium"><Clock size={12} /> Не оплачено</span>
  }
  return c.installment_plan && Number(c.installment_plan.remaining) <= 0
    ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle size={12} /> Закрыта</span>
    : <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
        <Clock size={12} /> {fmtMoney(c.installment_plan?.remaining || 0)}
      </span>
}

export default function Clients() {
  const { user } = useOutletContext()
  const [clients, setClients] = useState([])
  const [groups, setGroups] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [format, setFormat] = useState('')
  const [group, setGroup] = useState('')
  const [groupType, setGroupType] = useState('')
  const [isRepeat, setIsRepeat] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('')
  const [registeredFrom, setRegisteredFrom] = useState('')
  const [registeredTo, setRegisteredTo] = useState('')
  const [registeredBy, setRegisteredBy] = useState('')
  const [trainerFilter, setTrainerFilter] = useState('')
  const [managersList, setManagersList] = useState([])
  const [trainersList, setTrainersList] = useState([])
  const [summary, setSummary] = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading, setLoading] = useState(false)
  /** Поиск с задержкой; остальные фильтры применяются сразу (менеджер, статус и т.д.). */
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const totalPages = Math.ceil(count / 25)
  /** Отмена устаревших запросов — иначе старый ответ перезаписывает новый (неверные строки и счётчики). */
  const loadAbortRef = useRef(null)
  const loadGenRef = useRef(0)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const buildFilterParams = (pageNum) => {
    const params = new URLSearchParams()
    if (pageNum != null) params.set('page', String(pageNum))
    if (debouncedSearch) params.append('search', debouncedSearch)
    if (status) params.append('status', status)
    if (format) params.append('training_format', format)
    if (group) params.append('group', group)
    if (groupType) params.append('group_type', groupType)
    if (isRepeat) params.append('is_repeat', 'true')
    if (paymentStatus) params.append('payment_status', paymentStatus)
    if (registeredFrom) params.append('registered_from', registeredFrom)
    if (registeredTo) params.append('registered_to', registeredTo)
    if (registeredBy) params.append('registered_by', registeredBy)
    if (trainerFilter) params.append('trainer', trainerFilter)
    return params
  }

  const load = async (p = page) => {
    loadAbortRef.current?.abort()
    const ac = new AbortController()
    loadAbortRef.current = ac
    const gen = ++loadGenRef.current
    setLoading(true)
    const params = buildFilterParams(p)
    try {
      const [r, s] = await Promise.all([
        api.get(`/clients/?${params}`, { signal: ac.signal }),
        api.get(`/clients/stats-summary/?${buildFilterParams(null)}`, { signal: ac.signal }),
      ])
      if (gen !== loadGenRef.current) return
      setClients(r.data.results || [])
      setCount(r.data.count || 0)
      setSummary(s.data)
    } catch (e) {
      const canceled = e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.message === 'canceled'
      if (canceled) return
      setSummary(null)
    } finally {
      if (gen === loadGenRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    api.get('/groups/?page_size=100').then(r => setGroups(r.data.results || []))
    api.get('/accounts/managers/?page_size=200').then(r => setManagersList(r.data.results || r.data || []))
    api.get('/trainers/?page_size=200').then(r => setTrainersList(r.data.results || []))
  }, [])

  useEffect(() => {
    setPage(1)
    load(1)
  }, [debouncedSearch, status, format, group, groupType, isRepeat, paymentStatus, registeredFrom, registeredTo, registeredBy, trainerFilter])

  useEffect(() => { load() }, [page])

  useEffect(() => () => { loadAbortRef.current?.abort() }, [])

  const resetFilters = () => {
    setSearch(''); setDebouncedSearch(''); setStatus(''); setFormat(''); setGroup('')
    setGroupType(''); setIsRepeat(false); setPaymentStatus(''); setRegisteredFrom(''); setRegisteredTo('')
    setRegisteredBy(''); setTrainerFilter('')
    setPage(1); setTimeout(() => load(1), 0)
  }

  const handleStatusChanged = (id, newStatus) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c))
  }

  const hasFilters = search || debouncedSearch || status || format || group || groupType || isRepeat || paymentStatus || registeredFrom || registeredTo || registeredBy || trainerFilter

  return (
    <AdminLayout user={user}>
      {/* Заголовок */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">CRM</p>
          <h2 className="crm-page-title">База клиентов</h2>
          <p className="crm-page-subtitle">
            {count > 0 ? `${count} клиентов` : 'Поиск, фильтры и статусы'}
          </p>
        </div>
      </div>

      {/* Фильтры */}
      {summary && (summary.total > 0 || hasFilters) && (
        <div className="crm-card p-4 mb-4 flex flex-wrap gap-2 items-center text-sm">
          <span className="text-slate-500 font-medium">По фильтрам:</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold">Всего: {summary.total}</span>
          {Object.entries(summary.by_status || {}).map(([st, n]) => (
            <span key={st} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[st] || 'bg-slate-100 text-slate-600'}`}>
              {STATUS_LABEL[st] || st}: {n}
            </span>
          ))}
        </div>
      )}

      <div className="crm-card p-4 mb-5">
        {/* Основные */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Поиск по имени, телефону..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="crm-input pl-9 w-full" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>
          <select value={status} onChange={e => setStatus(e.target.value)} className="crm-input w-full sm:w-40">
            <option value="">Все статусы</option>
            <option value="new">Новые</option>
            <option value="active">Активные</option>
            <option value="frozen">Заморозка</option>
            <option value="completed">Завершили</option>
            <option value="expelled">Отчислены</option>
          </select>
          <select value={format} onChange={e => setFormat(e.target.value)} className="crm-input w-full sm:w-40">
            <option value="">Все форматы</option>
            <option value="online">Онлайн</option>
            <option value="offline">Оффлайн</option>
          </select>
          <select value={groupType} onChange={e => setGroupType(e.target.value)} className="crm-input w-full sm:w-36">
            <option value="">Все типы</option>
            <option value="1.5h">1.5 ч</option>
            <option value="2.5h">2.5 ч</option>
          </select>
          <button onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition ${
              showAdvanced ? 'bg-indigo-50 text-indigo-600 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}>
            <SlidersHorizontal size={13} /> Ещё фильтры
          </button>
          {hasFilters && (
            <button onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition">
              <X size={13} /> Сбросить
            </button>
          )}
        </div>

        {/* Расширенные */}
        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-3 items-center animate-fade-in">
            <select value={group} onChange={e => setGroup(e.target.value)} className="crm-input w-full sm:w-44">
              <option value="">Все группы</option>
              {groups.map(g => <option key={g.id} value={g.id}>Группа {g.number}</option>)}
            </select>
            <select value={trainerFilter} onChange={e => setTrainerFilter(e.target.value)} className="crm-input w-full sm:w-44">
              <option value="">Все тренеры</option>
              {trainersList.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <select value={registeredBy} onChange={e => setRegisteredBy(e.target.value)} className="crm-input w-full sm:w-48">
              <option value="">Все менеджеры</option>
              {managersList.filter(m => m.user_id).map(m => (
                <option key={m.id} value={String(m.user_id)}>
                  {[m.last_name, m.first_name].filter(Boolean).join(' ') || m.username}
                </option>
              ))}
            </select>
            <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="crm-input w-full sm:w-44">
              <option value="">Все по оплате</option>
              <option value="paid">Оплачено</option>
              <option value="unpaid">Есть остаток</option>
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={isRepeat} onChange={e => setIsRepeat(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30" />
              Повторные
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-400">Рег. от</span>
              <input type="date" value={registeredFrom} onChange={e => setRegisteredFrom(e.target.value)}
                className="crm-input w-full sm:w-36" />
              <span className="text-xs text-slate-400">до</span>
              <input type="date" value={registeredTo} onChange={e => setRegisteredTo(e.target.value)}
                className="crm-input w-full sm:w-36" />
            </div>
          </div>
        )}
      </div>

      {/* Таблица */}
      <div className="crm-card overflow-hidden">
        {/* Мобильный вид */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading && (
            <div className="p-8 text-center">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}
          {!loading && clients.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              <Search size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Клиенты не найдены</p>
            </div>
          )}
          {!loading && clients.map(c => (
            <div key={c.id} className="p-4 hover:bg-slate-50 transition">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-slate-900">{c.full_name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{c.phone}</p>
                </div>
                <StatusDropdown clientId={c.id} currentStatus={c.status} onChanged={handleStatusChanged} />
              </div>
              <div className="flex flex-wrap gap-2 items-center text-xs text-slate-500 mb-3">
                <span className="flex items-center gap-1">
                  {c.training_format === 'online' ? <Globe size={12} /> : <Dumbbell size={12} />}
                  {c.training_format === 'online' ? 'Онлайн' : 'Оффлайн'}
                </span>
                {c.group && <span className="text-slate-400">· Группа {c.group.number}</span>}
                {c.is_repeat && (
                  <span className="flex items-center gap-0.5 text-indigo-500">
                    <RotateCcw size={11} /> Повторный
                  </span>
                )}
                <span className="ml-auto"><PayBadge c={c} /></span>
              </div>
              <Link to={`/admin/clients/${c.id}`}
                className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition">
                Открыть карточку →
              </Link>
            </div>
          ))}
        </div>

        {/* Десктоп */}
        <div className="hidden md:block">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <div className="crm-table-wrap">
              <table className="crm-table min-w-[1080px]">
                <thead>
                  <tr>
                    <th>Клиент</th>
                    <th>Телефон</th>
                    <th>Формат</th>
                    <th>Группа</th>
                    <th>Оплата</th>
                    <th>Дата рег.</th>
                    <th>Менеджер</th>
                    <th>Статус</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-slate-400">
                      <Search size={24} className="mx-auto mb-2 opacity-30" />
                      Клиенты не найдены
                    </td></tr>
                  ) : clients.map(c => (
                    <tr key={c.id}>
                      <td>
                        <p className="font-semibold text-slate-900">{c.full_name}</p>
                        {c.is_repeat && (
                          <p className="text-xs text-indigo-500 flex items-center gap-1 mt-0.5">
                            <RotateCcw size={11} /> Повторный
                          </p>
                        )}
                      </td>
                      <td className="text-slate-600">{c.phone}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium
                          ${c.training_format === 'online' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'}`}>
                          {c.training_format === 'online' ? <Globe size={11} /> : <Dumbbell size={11} />}
                          {c.training_format === 'online' ? 'Онлайн' : 'Оффлайн'}
                        </span>
                      </td>
                      <td className="text-slate-600 text-sm">
                        {c.group ? <span className="font-medium">#{c.group.number}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td><PayBadge c={c} /></td>
                      <td className="text-slate-500 text-xs">{fmtDate(c.registered_at)}</td>
                      <td className="text-slate-500 text-xs">{c.registered_by_name || '—'}</td>
                      <td>
                        <StatusDropdown clientId={c.id} currentStatus={c.status} onChanged={handleStatusChanged} />
                      </td>
                      <td>
                        <Link to={`/admin/clients/${c.id}`}
                          className="text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition">
                          Открыть →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="crm-btn-secondary disabled:opacity-40">
            <ChevronLeft size={16} /> Назад
          </button>
          <span className="text-sm text-slate-500">
            Страница <span className="font-semibold text-slate-800">{page}</span> из {totalPages}
            <span className="text-slate-400 ml-2">· {count} клиентов</span>
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="crm-btn-secondary disabled:opacity-40">
            Вперёд <ChevronRight size={16} />
          </button>
        </div>
      )}
    </AdminLayout>
  )
}
