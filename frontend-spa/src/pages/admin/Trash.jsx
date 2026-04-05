import { useState, useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  Trash2, Users, Layers2, UserCog, AlertTriangle,
  Search, RefreshCw, X, CheckSquare, Square, ShieldAlert
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
  { key: 'clients',  label: 'Клиенты',   Icon: Users    },
  { key: 'groups',   label: 'Потоки',    Icon: Layers2  },
  { key: 'managers', label: 'Менеджеры', Icon: UserCog  },
]

export default function Trash() {
  const { user } = useOutletContext()
  const [tab,         setTab]         = useState('clients')
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [selected,    setSelected]    = useState(new Set())
  const [confirmItem, setConfirmItem] = useState(null)  // { entity, id, name }
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [toast,       setToast]       = useState(null)  // { type, msg }

  const load = () => {
    setLoading(true)
    setSelected(new Set())
    api.get('/statistics/trash-data/')
      .then(r => setData(r.data))
      .catch(() => showToast('error', 'Ошибка загрузки данных'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const showToast = (type, msg) => {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 4000)
  }

  // ── Текущий список ─────────────────────────────────────────────────────────
  const currentList = () => {
    if (!data) return []
    const items = data[tab] || []
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(item => {
      if (tab === 'clients')  return item.name.toLowerCase().includes(q) || item.phone?.includes(q)
      if (tab === 'groups')   return String(item.number).includes(q) || item.trainer.toLowerCase().includes(q)
      if (tab === 'managers') return item.username.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
      return true
    })
  }

  const list = currentList()

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === list.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(list.map(i => i.id)))
    }
  }

  // ── Удаление одного ────────────────────────────────────────────────────────
  const doDelete = async (entity, id) => {
    setDeleting(true)
    try {
      await api.post('/statistics/trash-delete/', { entity, id })
      showToast('success', 'Объект удалён')
      load()
    } catch (e) {
      showToast('error', e.response?.data?.detail || 'Ошибка удаления')
    } finally {
      setDeleting(false)
      setConfirmItem(null)
    }
  }

  // ── Массовое удаление ──────────────────────────────────────────────────────
  const doBulkDelete = async () => {
    setDeleting(true)
    const entity = tab === 'clients' ? 'client' : tab === 'groups' ? 'group' : 'manager'
    let errors = 0
    for (const id of selected) {
      try {
        await api.post('/statistics/trash-delete/', { entity, id })
      } catch {
        errors++
      }
    }
    setDeleting(false)
    setConfirmBulk(false)
    showToast(errors === 0 ? 'success' : 'error',
      errors === 0
        ? `Удалено ${selected.size} объектов`
        : `Удалено с ошибками: ${errors} из ${selected.size}`
    )
    load()
  }

  const entityLabel = tab === 'clients' ? 'client' : tab === 'groups' ? 'group' : 'manager'

  return (
    <AdminLayout user={user}>
      {/* Тост */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl shadow-xl text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)}><X size={14} /></button>
        </div>
      )}

      {/* Заголовок */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
          <Trash2 size={20} className="text-red-600" />
        </div>
        <div className="flex-1">
          <h2 className="crm-page-title">Корзина</h2>
          <p className="crm-page-subtitle">Безвозвратное удаление объектов — только для администратора</p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Обновить
        </button>
      </div>

      {/* Предупреждение */}
      <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl mb-6">
        <ShieldAlert size={18} className="text-red-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-red-700">Внимание — удаление необратимо!</p>
          <p className="text-xs text-red-600 mt-0.5">
            Удалённые данные восстановить невозможно. Клиент удаляется вместе со всеми оплатами и историей.
            Поток — с привязанными данными. Будьте осторожны.
          </p>
        </div>
      </div>

      {/* Вкладки */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => {
          const { Icon } = t
          const count = data?.[t.key]?.length ?? 0
          return (
            <button key={t.key} onClick={() => { setTab(t.key); setSelected(new Set()); setSearch('') }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border-2 transition ${
                tab === t.key
                  ? 'bg-red-50 border-red-400 text-red-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}>
              <Icon size={15} />
              {t.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                tab === t.key ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Тулбар — поиск + массовое удаление */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder={`Поиск по ${tab === 'clients' ? 'имени или телефону' : tab === 'groups' ? 'номеру или тренеру' : 'имени'}`}
            className="crm-input pl-9 w-full text-sm" />
        </div>

        {selected.size > 0 && (
          <button onClick={() => setConfirmBulk(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition">
            <Trash2 size={14} /> Удалить выбранные ({selected.size})
          </button>
        )}
      </div>

      {/* Таблица */}
      <div className="crm-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Trash2 size={36} className="mb-3 opacity-40" />
            <p className="text-sm">
              {search ? 'Ничего не найдено' : 'Список пуст'}
            </p>
          </div>
        ) : (
          <>
            {/* Шапка */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
              <button onClick={toggleAll} className="text-slate-400 hover:text-slate-700 transition">
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

            {/* Строки */}
            <div className="divide-y divide-slate-50">
              {list.map(item => (
                <div key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition ${
                    selected.has(item.id) ? 'bg-red-50' : ''
                  }`}>
                  <button onClick={() => toggleSelect(item.id)}
                    className="text-slate-400 hover:text-red-500 transition shrink-0">
                    {selected.has(item.id)
                      ? <CheckSquare size={16} className="text-red-500" />
                      : <Square size={16} />
                    }
                  </button>

                  {/* Клиент */}
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

                  {/* Поток */}
                  {tab === 'groups' && (
                    <div className="flex-1 flex items-center gap-4 flex-wrap min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800">Поток #{item.number}</p>
                        <p className="text-xs text-slate-400">{item.trainer} · {item.type === '1.5h' ? '1.5 ч' : '2.5 ч'}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${GROUP_STATUS_COLOR[item.status] || 'bg-slate-100 text-slate-500'}`}>
                        {GROUP_STATUS_LABEL[item.status] || item.status}
                      </span>
                      <span className="text-xs text-slate-400">{item.clients} клиентов</span>
                    </div>
                  )}

                  {/* Менеджер */}
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

                  {/* Кнопка удаления */}
                  <button
                    onClick={() => setConfirmItem({
                      entity: entityLabel,
                      id:     item.id,
                      name:   tab === 'clients' ? item.name
                            : tab === 'groups'   ? `Поток #${item.number}`
                            : item.name,
                    })}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition shrink-0">
                    <Trash2 size={12} /> Удалить
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Модалка одиночного удаления */}
      {confirmItem && (
        <ConfirmModal
          open={true}
          title="Удалить навсегда?"
          message={`Удалить «${confirmItem.name}» без возможности восстановления?\n\nВсе связанные данные (оплаты, история) также будут удалены.`}
          variant="danger"
          confirmText="Удалить навсегда"
          onConfirm={() => doDelete(confirmItem.entity, confirmItem.id)}
          onClose={() => setConfirmItem(null)}
        />
      )}

      {/* Модалка массового удаления */}
      {confirmBulk && (
        <ConfirmModal
          open={true}
          title={`Удалить ${selected.size} объектов?`}
          message={`Это действие безвозвратно удалит ${selected.size} выбранных объектов вместе со всеми связанными данными.`}
          variant="danger"
          confirmText={`Удалить ${selected.size} объектов`}
          onConfirm={doBulkDelete}
          onClose={() => setConfirmBulk(false)}
        />
      )}
    </AdminLayout>
  )
}
