import { useState, useEffect, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Trash2, Users, Layers2, UserCog, AlertTriangle,
  Search, RefreshCw, X, CheckSquare, Square, ShieldAlert, RotateCcw,
  Archive, FolderInput, Play, Radio, Video, Headphones,
} from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import ConfirmModal from '../../components/ConfirmModal'

const STATUS_LABEL = {
  active: 'Активный', completed: 'Завершил',
  expelled: 'Отчислен', frozen: 'Заморозка',
}
const STATUS_COLOR = {
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-slate-100 text-slate-600',
  expelled: 'bg-red-100 text-red-600',
  frozen: 'bg-sky-100 text-sky-700',
}
const GROUP_STATUS_LABEL = {
  recruitment: 'Набор', active: 'Активный', completed: 'Завершён',
}
const GROUP_STATUS_COLOR = {
  recruitment: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-slate-100 text-slate-600',
}

const TABS = [
  { key: 'clients',       label: 'Клиенты',      Icon: Users    },
  { key: 'groups',        label: 'Группы',       Icon: Layers2  },
  { key: 'managers',      label: 'Менеджеры',    Icon: UserCog  },
  { key: 'lessons',       label: 'Уроки',        Icon: Play, group: 'edu' },
  { key: 'streams',       label: 'Эфиры',        Icon: Radio, group: 'edu' },
  { key: 'consultations', label: 'Консультации', Icon: Video, group: 'edu' },
]

const EDU_TABS = ['lessons', 'streams', 'consultations']

function mapActiveClients(results) {
  return (results || []).map(c => ({
    id:     c.id,
    name:   c.full_name,
    phone:  c.phone,
    status: c.status,
    group:  c.group ? `Группа ${c.group.number}` : null,
  }))
}

function mapActiveGroups(results) {
  return (results || []).map(g => ({
    id:      g.id,
    number:  g.number,
    type:    g.group_type,
    trainer: g.trainer?.full_name || '—',
    status:  g.status,
    clients: typeof g.client_count === 'number' ? g.client_count : 0,
  }))
}

function mapActiveManagers(results) {
  return (results || []).map(m => ({
    id:       m.id,
    username: m.username,
    name:     `${m.last_name || ''} ${m.first_name || ''}`.trim() || m.username,
    active:   m.is_active,
  }))
}

function mapLessons(results) {
  return (results || []).map(l => ({
    id:    l.id,
    title: l.title || '—',
    type:  l.lesson_type,
    is_published: l.is_published,
  }))
}

function mapStreams(results) {
  return (results || []).map(s => ({
    id:     s.id,
    title:  s.title || '—',
    status: s.status,
  }))
}

function mapConsultations(results) {
  return (results || []).map(c => ({
    id:     c.id,
    title:  c.title || 'Консультация',
    status: c.status,
  }))
}

export default function Trash() {
  const { user } = useOutletContext()
  /** Раздел: перенос в корзину (soft) vs содержимое корзины */
  const [section, setSection]     = useState('delete')
  const [tab, setTab]             = useState('clients')
  const [deletedData, setDeletedData] = useState(null)
  const [activeData, setActiveData]   = useState({
    clients: [], groups: [], managers: [],
    lessons: [], streams: [], consultations: [],
  })
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [selected, setSelected]   = useState(new Set())
  const [confirmPermanent, setConfirmPermanent] = useState(null)
  const [confirmBulkPermanent, setConfirmBulkPermanent] = useState(false)
  const [confirmSoft, setConfirmSoft] = useState(null)
  const [confirmBulkSoft, setConfirmBulkSoft] = useState(false)
  const [busy, setBusy]           = useState(false)
  const [toast, setToast]         = useState(null)

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  const loadDeleted = useCallback(() => {
    return Promise.all([
      api.get('/statistics/trash-data/'),
      api.get('/education/lessons/trash/').catch(() => ({ data: [] })),
      api.get('/education/streams/trash/').catch(() => ({ data: [] })),
      api.get('/education/consultations/trash/').catch(() => ({ data: [] })),
    ]).then(([base, lessons, streams, consultations]) => {
      setDeletedData({
        ...(base.data || {}),
        lessons:       mapLessons(lessons.data || []),
        streams:       mapStreams(streams.data || []),
        consultations: mapConsultations(consultations.data || []),
      })
    }).catch(() => showToast('error', 'Ошибка загрузки корзины'))
  }, [])

  const loadActive = useCallback(() => {
    return Promise.all([
      api.get('/clients/', { params: { page_size: 500 } }),
      api.get('/groups/', { params: { page_size: 500 } }),
      api.get('/accounts/managers/', { params: { page_size: 500 } }),
      api.get('/education/lessons/').catch(() => ({ data: [] })),
      api.get('/education/streams/').catch(() => ({ data: [] })),
      api.get('/education/consultations/').catch(() => ({ data: [] })),
    ]).then(([c, g, m, lessons, streams, consultations]) => {
      const cr = c.data.results ?? c.data ?? []
      const gr = g.data.results ?? g.data ?? []
      const mr = m.data.results ?? m.data ?? []
      const lr = lessons.data?.results ?? lessons.data ?? []
      const sr = streams.data?.results ?? streams.data ?? []
      const csr = consultations.data?.results ?? consultations.data ?? []
      setActiveData({
        clients:       mapActiveClients(cr),
        groups:        mapActiveGroups(gr),
        managers:      mapActiveManagers(mr),
        lessons:       mapLessons(lr),
        streams:       mapStreams(sr),
        consultations: mapConsultations(csr),
      })
    }).catch(() => showToast('error', 'Ошибка загрузки списков'))
  }, [])

  const refreshAll = useCallback(() => {
    setLoading(true)
    setSelected(new Set())
    Promise.all([loadDeleted(), loadActive()])
      .finally(() => setLoading(false))
  }, [loadDeleted, loadActive])

  useEffect(() => { refreshAll() }, [refreshAll])

  const matchByTab = (item, q) => {
    if (tab === 'clients')  return item.name.toLowerCase().includes(q) || item.phone?.includes(q)
    if (tab === 'groups')   return String(item.number).toLowerCase().includes(q) || item.trainer.toLowerCase().includes(q)
    if (tab === 'managers') return item.username.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
    if (EDU_TABS.includes(tab)) return (item.title || '').toLowerCase().includes(q)
    return true
  }

  const currentDeletedList = () => {
    if (!deletedData) return []
    const items = deletedData[tab] || []
    if (!search.trim()) return items
    return items.filter(item => matchByTab(item, search.toLowerCase()))
  }

  const currentActiveList = () => {
    const items = activeData[tab] || []
    if (!search.trim()) return items
    return items.filter(item => matchByTab(item, search.toLowerCase()))
  }

  const list = section === 'deleted' ? currentDeletedList() : currentActiveList()

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === list.length) setSelected(new Set())
    else setSelected(new Set(list.map(i => i.id)))
  }

  const entitySoft = tab === 'clients' ? 'client' : tab === 'groups' ? 'group' : 'manager'
  const entityLabel = entitySoft

  // Education routes use a separate REST API path (no shared trash-restore).
  const eduPath = (t) => ({ lessons: 'lessons', streams: 'streams', consultations: 'consultations' })[t]

  const apiSoftDelete = (id) => {
    if (tab === 'clients')  return api.delete(`/clients/${id}/`)
    if (tab === 'groups')   return api.delete(`/groups/${id}/`)
    if (tab === 'managers') return api.delete(`/accounts/managers/${id}/`)
    if (EDU_TABS.includes(tab)) return api.delete(`/education/${eduPath(tab)}/${id}/`)
    return Promise.reject(new Error('unknown tab'))
  }

  const apiRestore = (id) => {
    if (EDU_TABS.includes(tab)) return api.post(`/education/${eduPath(tab)}/${id}/restore/`)
    return api.post('/statistics/trash-restore/', { entity: entityLabel, id })
  }

  const apiPermanentDelete = (id) => {
    if (EDU_TABS.includes(tab)) return api.delete(`/education/${eduPath(tab)}/${id}/permanent/`)
    return api.post('/statistics/trash-delete/', { entity: entityLabel, id })
  }

  const doSoftDelete = async (id) => {
    setBusy(true)
    try {
      await apiSoftDelete(id)
      showToast('success', 'Перемещено в корзину')
      await Promise.all([loadDeleted(), loadActive()])
    } catch (e) {
      showToast('error', e.response?.data?.detail || 'Не удалось удалить')
    } finally {
      setBusy(false)
      setConfirmSoft(null)
    }
  }

  const doBulkSoftDelete = async () => {
    setBusy(true)
    let errors = 0
    const total = selected.size
    for (const id of selected) {
      try { await apiSoftDelete(id) } catch { errors++ }
    }
    setBusy(false)
    setConfirmBulkSoft(false)
    setSelected(new Set())
    showToast(
      errors === 0 ? 'success' : 'error',
      errors === 0 ? `В корзину: ${total} объект(ов)` : `Ошибок: ${errors} из ${total}`
    )
    await Promise.all([loadDeleted(), loadActive()])
  }

  const doRestore = async (_entity, id) => {
    setBusy(true)
    try {
      await apiRestore(id)
      showToast('success', 'Объект восстановлен')
      await Promise.all([loadDeleted(), loadActive()])
    } catch (e) {
      showToast('error', e.response?.data?.detail || 'Ошибка восстановления')
    } finally {
      setBusy(false)
    }
  }

  const doDeleteForever = async (_entity, id) => {
    setBusy(true)
    try {
      await apiPermanentDelete(id)
      showToast('success', 'Объект удалён навсегда')
      await loadDeleted()
    } catch (e) {
      showToast('error', e.response?.data?.detail || 'Ошибка удаления')
    } finally {
      setBusy(false)
      setConfirmPermanent(null)
    }
  }

  const doBulkDeleteForever = async () => {
    setBusy(true)
    const ids = [...selected]
    let errors = 0
    for (const id of ids) {
      try { await apiPermanentDelete(id) } catch { errors++ }
    }
    const n = ids.length
    setBusy(false)
    setConfirmBulkPermanent(false)
    setSelected(new Set())
    showToast(
      errors === 0 ? 'success' : 'error',
      errors === 0 ? `Удалено навсегда: ${n}` : `Ошибок: ${errors} из ${n}`
    )
    await loadDeleted()
  }

  const deletedCount = (deletedData?.clients?.length ?? 0)
    + (deletedData?.groups?.length ?? 0)
    + (deletedData?.managers?.length ?? 0)
    + (deletedData?.lessons?.length ?? 0)
    + (deletedData?.streams?.length ?? 0)
    + (deletedData?.consultations?.length ?? 0)
  const activeCount = activeData.clients.length + activeData.groups.length + activeData.managers.length
    + activeData.lessons.length + activeData.streams.length + activeData.consultations.length

  return (
    <AdminLayout user={user}>
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.msg}
          <button type="button" onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
          <Trash2 size={20} className="text-red-600" />
        </div>
        <div className="flex-1">
          <h2 className="crm-page-title">Корзина и удаление</h2>
          <p className="crm-page-subtitle">
            Перенос объектов в корзину (можно восстановить) и окончательное удаление из базы
          </p>
        </div>
        <button type="button" onClick={refreshAll} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Обновить
        </button>
      </div>

      {/* Два раздела */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button type="button" onClick={() => { setSection('delete'); setSelected(new Set()); setSearch('') }}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold border-2 transition ${
            section === 'delete'
              ? 'bg-amber-50 border-amber-400 text-amber-900 shadow-sm'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}>
          <FolderInput size={18} />
          Удалить
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
            section === 'delete' ? 'bg-amber-200 text-amber-900' : 'bg-slate-100 text-slate-500'
          }`}>
            {activeCount}
          </span>
        </button>
        <button type="button" onClick={() => { setSection('deleted'); setSelected(new Set()); setSearch('') }}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-semibold border-2 transition ${
            section === 'deleted'
              ? 'bg-red-50 border-red-400 text-red-800 shadow-sm'
              : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
          }`}>
          <Archive size={18} />
          Удалённые
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
            section === 'deleted' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-500'
          }`}>
            {deletedCount}
          </span>
        </button>
      </div>

      {section === 'delete' && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl mb-6">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">Раздел «Удалить»</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Выберите клиентов, группы или менеджеров и нажмите «В корзину» — запись скроется из списков CRM, но останется в разделе «Удалённые» до окончательного удаления.
            </p>
          </div>
        </div>
      )}

      {section === 'deleted' && (
        <div className="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl mb-6">
          <ShieldAlert size={18} className="text-slate-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-slate-800">Раздел «Удалённые»</p>
            <p className="text-xs text-slate-600 mt-0.5">
              «Восстановить» вернёт объект в работу. «Удалить навсегда» сотрёт запись из базы (для менеджера — учётную запись).
            </p>
          </div>
        </div>
      )}

      {/* Вкладки типов */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => {
          const { Icon } = t
          const count = section === 'deleted'
            ? (deletedData?.[t.key]?.length ?? 0)
            : (activeData[t.key]?.length ?? 0)
          return (
            <button key={t.key} type="button" onClick={() => { setTab(t.key); setSelected(new Set()); setSearch('') }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                tab === t.key
                  ? section === 'deleted'
                    ? 'bg-red-50 border-red-400 text-red-700'
                    : 'bg-amber-50 border-amber-400 text-amber-900'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}>
              <Icon size={15} />
              {t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                tab === t.key
                  ? section === 'deleted' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-900'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Поиск: ${tab === 'clients' ? 'имя или телефон' : tab === 'groups' ? 'номер или тренер' : 'имя или логин'}`}
            className="crm-input pl-9 w-full text-sm" />
        </div>

        {section === 'delete' && selected.size > 0 && (
          <button type="button" onClick={() => setConfirmBulkSoft(true)} disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition disabled:opacity-50">
            <Archive size={14} /> В корзину ({selected.size})
          </button>
        )}

        {section === 'deleted' && selected.size > 0 && (
          <button type="button" onClick={() => setConfirmBulkPermanent(true)} disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50">
            <Trash2 size={14} /> Удалить навсегда ({selected.size})
          </button>
        )}
      </div>

      <div className="crm-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            {section === 'deleted' ? <Trash2 size={36} className="mb-3 opacity-40" /> : <FolderInput size={36} className="mb-3 opacity-40" />}
            <p className="text-sm font-medium">{search ? 'Ничего не найдено' : (section === 'deleted' ? 'Корзина пуста' : 'Нет записей в этом списке')}</p>
            {section === 'deleted' && !search && (
              <p className="text-xs text-slate-400 mt-2 max-w-md text-center">
                Сюда попадают объекты после удаления из карточек или из раздела «Удалить» выше.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <button type="button" onClick={toggleAll} className="text-slate-400 hover:text-slate-700 transition">
                {selected.size === list.length && list.length > 0
                  ? <CheckSquare size={16} className="text-red-500" />
                  : <Square size={16} />
                }
              </button>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex-1">
                {selected.size > 0 ? `Выбрано: ${selected.size}` : `Всего: ${list.length}`}
              </span>
              <span className="text-xs text-slate-400">Действие</span>
            </div>

            <div className="divide-y divide-slate-50">
              {list.map(item => (
                <div key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition ${
                    selected.has(item.id)
                      ? (section === 'deleted' ? 'bg-red-50/80' : 'bg-amber-50/80')
                      : ''
                  }`}>
                  <button type="button" onClick={() => toggleSelect(item.id)}
                    className={`transition shrink-0 ${section === 'deleted' ? 'text-slate-400 hover:text-red-500' : 'text-slate-400 hover:text-amber-600'}`}>
                    {selected.has(item.id)
                      ? <CheckSquare size={16} className={section === 'deleted' ? 'text-red-500' : 'text-amber-600'} />
                      : <Square size={16} />
                    }
                  </button>

                  {tab === 'clients' && (
                    <div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.phone}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLOR[item.status] || 'bg-slate-100 text-slate-500'}`}>
                        {STATUS_LABEL[item.status] || item.status}
                      </span>
                      {item.group && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-700 font-medium">
                          {item.group}
                        </span>
                      )}
                    </div>
                  )}

                  {tab === 'groups' && (
                    <div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">Группа {item.number}</p>
                        <p className="text-xs text-slate-400">{item.trainer} · {item.type === '1.5h' ? '1.5 ч' : '2.5 ч'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${GROUP_STATUS_COLOR[item.status] || 'bg-slate-100 text-slate-500'}`}>
                        {GROUP_STATUS_LABEL[item.status] || item.status}
                      </span>
                      <span className="text-xs text-slate-400">{item.clients} клиентов</span>
                    </div>
                  )}

                  {tab === 'managers' && (
                    <div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.name}</p>
                        <p className="text-xs text-slate-400">@{item.username}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        item.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                      }`}>
                        {item.active ? 'Активен' : 'Деактивирован'}
                      </span>
                    </div>
                  )}

                  {tab === 'lessons' && (
                    <div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                        {item.type === 'audio' ? <Headphones size={15} /> : <Play size={15} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                        <p className="text-xs text-slate-400">{item.type === 'audio' ? 'Аудио' : 'Видео'}</p>
                      </div>
                      {item.is_published && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700 font-medium">
                          Опубликовано
                        </span>
                      )}
                    </div>
                  )}

                  {tab === 'streams' && (
                    <div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                        <Radio size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                        <p className="text-xs text-slate-400">{item.status}</p>
                      </div>
                    </div>
                  )}

                  {tab === 'consultations' && (
                    <div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-violet-500 shrink-0">
                        <Video size={15} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                        <p className="text-xs text-slate-400">{item.status}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 shrink-0">
                    {section === 'delete' && (
                      <button type="button" disabled={busy}
                        onClick={() => setConfirmSoft({
                          id: item.id,
                          name: tab === 'clients' ? item.name
                            : tab === 'groups' ? `Группа ${item.number}`
                            : EDU_TABS.includes(tab) ? item.title
                            : item.name,
                        })}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition">
                        <Archive size={12} /> В корзину
                      </button>
                    )}
                    {section === 'deleted' && (
                      <>
                        <button type="button" disabled={busy}
                          onClick={() => doRestore(entityLabel, item.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition">
                          <RotateCcw size={12} /> Восстановить
                        </button>
                        <button type="button" disabled={busy}
                          onClick={() => setConfirmPermanent({
                            entity: entityLabel,
                            id: item.id,
                            name: tab === 'clients' ? item.name
                              : tab === 'groups' ? `Группа ${item.number}`
                              : EDU_TABS.includes(tab) ? item.title
                              : item.name,
                          })}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition">
                          <Trash2 size={12} /> Навсегда
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {confirmSoft && (
        <ConfirmModal
          open
          title="Переместить в корзину?"
          message={`«${confirmSoft.name}» будет скрыт из CRM и появится во вкладке «Удалённые».`}
          variant="warning"
          confirmText="В корзину"
          onConfirm={() => doSoftDelete(confirmSoft.id)}
          onClose={() => setConfirmSoft(null)}
        />
      )}

      {confirmBulkSoft && (
        <ConfirmModal
          open
          title={`Переместить ${selected.size} объект(ов) в корзину?`}
          message="Выбранные записи будут скрыты из списков и доступны для восстановления в разделе «Удалённые»."
          variant="warning"
          confirmText={`В корзину (${selected.size})`}
          onConfirm={doBulkSoftDelete}
          onClose={() => setConfirmBulkSoft(false)}
        />
      )}

      {confirmPermanent && (
        <ConfirmModal
          open
          title="Удалить навсегда?"
          message={`Удалить «${confirmPermanent.name}» без возможности восстановления?\n\nВсе связанные данные (оплаты, история) также будут удалены.`}
          variant="danger"
          confirmText="Удалить навсегда"
          onConfirm={() => doDeleteForever(confirmPermanent.entity, confirmPermanent.id)}
          onClose={() => setConfirmPermanent(null)}
        />
      )}

      {confirmBulkPermanent && (
        <ConfirmModal
          open
          title={`Удалить ${selected.size} объектов навсегда?`}
          message={`Это действие безвозвратно удалит ${selected.size} выбранных объектов вместе со всеми связанными данными.`}
          variant="danger"
          confirmText={`Удалить ${selected.size} объектов`}
          onConfirm={doBulkDeleteForever}
          onClose={() => setConfirmBulkPermanent(false)}
        />
      )}
    </AdminLayout>
  )
}
