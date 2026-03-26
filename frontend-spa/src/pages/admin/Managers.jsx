import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  UserPlus, Users, PowerOff, Eye, Shield,
  Phone, AtSign, X, ChevronRight
} from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL } from '../../utils/format'

function ManagerAvatar({ name }) {
  const parts = (name || '').split(' ')
  const initials = parts.slice(0, 2).map(p => p[0] || '').join('').toUpperCase()
  const colors = ['from-sky-500 to-blue-600', 'from-indigo-500 to-violet-600', 'from-teal-500 to-emerald-600', 'from-rose-500 to-pink-600']
  const idx = name ? name.charCodeAt(0) % colors.length : 0
  return (
    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${colors[idx]} flex items-center justify-center text-white font-bold text-sm shadow-md shrink-0`}>
      {initials || '?'}
    </div>
  )
}

export default function Managers() {
  const { user } = useOutletContext()
  const [managers, setManagers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [selectedManager, setSelectedManager] = useState(null)
  const [managerClients, setManagerClients] = useState([])
  const [showClients, setShowClients] = useState(false)
  const [clientsLoading, setClientsLoading] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', first_name: '', last_name: '', phone: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const load = async () => {
    const r = await api.get('/accounts/managers/')
    setManagers(r.data.results || r.data || [])
  }

  useEffect(() => { load() }, [])

  const handleCreate = async e => {
    e.preventDefault(); setError(''); setSuccess('')
    try {
      await api.post('/accounts/managers/', form)
      setSuccess('Менеджер создан!')
      setShowForm(false)
      setForm({ username: '', password: '', first_name: '', last_name: '', phone: '' })
      load()
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join(' | ') : 'Ошибка')
    }
  }

  const deactivate = async (id, name) => {
    if (!confirm(`Деактивировать ${name}?`)) return
    await api.post(`/accounts/managers/${id}/deactivate/`)
    load()
  }

  const viewClients = async (mgr) => {
    setSelectedManager(mgr)
    setManagerClients([])
    setShowClients(true)
    setClientsLoading(true)
    try {
      const r = await api.get(`/accounts/managers/${mgr.id}/clients/`)
      setManagerClients(r.data.results || r.data || [])
    } finally { setClientsLoading(false) }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const countByStatus = (clients) => {
    const map = {}
    clients.forEach(c => { map[c.status] = (map[c.status] || 0) + 1 })
    return Object.entries(map)
  }

  return (
    <AdminLayout user={user}>
      {/* Заголовок */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">Персонал</p>
          <h2 className="crm-page-title">Менеджеры</h2>
          <p className="crm-page-subtitle">Регистраторы и их клиентская база</p>
        </div>
        <button onClick={() => { setShowForm(v => !v); setError(''); setSuccess('') }}
          className="crm-btn-primary">
          <UserPlus size={16} /> Новый менеджер
        </button>
      </div>

      {success && <div className="crm-toast-success mb-5 animate-fade-in">{success}</div>}

      {/* Форма создания */}
      {showForm && (
        <div className="crm-card p-6 mb-6 max-w-lg animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-800">Новый менеджер</h3>
            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 transition">
              <X size={18} />
            </button>
          </div>
          {error && <div className="crm-toast-error mb-4">{error}</div>}
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input required placeholder="Фамилия *" value={form.last_name}
                onChange={e => set('last_name', e.target.value)} className="crm-input" />
              <input required placeholder="Имя *" value={form.first_name}
                onChange={e => set('first_name', e.target.value)} className="crm-input" />
            </div>
            <div className="relative">
              <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input placeholder="Телефон" value={form.phone}
                onChange={e => set('phone', e.target.value)} className="crm-input pl-8" />
            </div>
            <div className="relative">
              <AtSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input required placeholder="Логин *" value={form.username}
                onChange={e => set('username', e.target.value)} className="crm-input pl-8" />
            </div>
            <input required type="password" placeholder="Пароль * (мин. 6 символов)" value={form.password}
              onChange={e => set('password', e.target.value)} className="crm-input" />
            <div className="flex gap-3 pt-1">
              <button type="submit" className="crm-btn-primary flex-1">Создать</button>
              <button type="button" onClick={() => setShowForm(false)} className="crm-btn-secondary">Отмена</button>
            </div>
          </form>
        </div>
      )}

      {/* Список менеджеров */}
      {managers.length === 0 ? (
        <div className="crm-card p-16 text-center">
          <Shield size={32} className="mx-auto mb-3 text-slate-200" />
          <p className="text-slate-500 font-medium mb-1">Менеджеров пока нет</p>
          <p className="text-slate-400 text-sm mb-5">Добавьте первого регистратора</p>
          <button onClick={() => setShowForm(true)} className="crm-btn-primary">
            <UserPlus size={15} /> Добавить менеджера
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {managers.map(m => (
            <div key={m.id} className="crm-card p-5 hover:shadow-md transition-all duration-200 group">
              {/* Верх */}
              <div className="flex items-start gap-3 mb-4">
                <ManagerAvatar name={`${m.last_name} ${m.first_name}`} />
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                    {m.last_name} {m.first_name}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">@{m.username}</p>
                </div>
                <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-semibold ${
                  m.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                }`}>
                  {m.is_active ? '● Активен' : '○ Неактивен'}
                </span>
              </div>

              {/* Детали */}
              {m.phone && (
                <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                  <Phone size={13} className="text-slate-400" />
                  {m.phone}
                </div>
              )}

              {/* Клиенты */}
              <button onClick={() => viewClients(m)}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition mb-3">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-indigo-500" />
                  <span className="text-sm text-indigo-700 font-semibold">{m.clients_count} клиентов</span>
                </div>
                <ChevronRight size={14} className="text-indigo-400" />
              </button>

              {/* Деактивировать */}
              {m.is_active && (
                <button onClick={() => deactivate(m.id, `${m.last_name} ${m.first_name}`)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-red-50 text-red-500 text-xs font-medium hover:bg-red-100 transition border border-red-100">
                  <PowerOff size={13} /> Деактивировать
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Модалка клиентов */}
      {showClients && selectedManager && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col animate-fade-in">
            {/* Шапка */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <ManagerAvatar name={`${selectedManager.last_name} ${selectedManager.first_name}`} />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-slate-900">{selectedManager.last_name} {selectedManager.first_name}</h3>
                <p className="text-xs text-slate-400">@{selectedManager.username} · {selectedManager.clients_count} клиентов</p>
              </div>
              <button onClick={() => setShowClients(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <X size={18} />
              </button>
            </div>

            {/* Счётчики по статусам */}
            {managerClients.length > 0 && (
              <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap gap-2">
                {countByStatus(managerClients).map(([st, cnt]) => (
                  <span key={st} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[st] || 'bg-slate-100 text-slate-600'}`}>
                    {STATUS_LABEL[st] || st}: {cnt}
                  </span>
                ))}
              </div>
            )}

            {/* Список */}
            <div className="overflow-auto flex-1">
              {clientsLoading ? (
                <div className="p-12 text-center">
                  <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : managerClients.length === 0 ? (
                <div className="p-12 text-center text-slate-400">
                  <Users size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Нет клиентов</p>
                </div>
              ) : (
                <>
                  {/* Мобиль */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {managerClients.map(c => (
                      <div key={c.id} className="p-4 hover:bg-slate-50 transition">
                        <div className="flex items-start justify-between gap-2">
                          <Link to={`/admin/clients/${c.id}`} onClick={() => setShowClients(false)}
                            className="font-semibold text-slate-800 hover:text-indigo-600 transition">
                            {c.full_name}
                          </Link>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold shrink-0 ${STATUS_BADGE[c.status]}`}>
                            {STATUS_LABEL[c.status]}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">{c.phone}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{c.registered_at}</p>
                      </div>
                    ))}
                  </div>
                  {/* Десктоп */}
                  <table className="hidden md:table w-full text-sm">
                    <thead className="bg-slate-50 border-b sticky top-0">
                      <tr>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Клиент</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Телефон</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Дата рег.</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Статус</th>
                        <th className="px-5 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {managerClients.map(c => (
                        <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50 transition">
                          <td className="px-5 py-3">
                            <Link to={`/admin/clients/${c.id}`} onClick={() => setShowClients(false)}
                              className="font-semibold text-slate-900 hover:text-indigo-600 transition">
                              {c.full_name}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-slate-500">{c.phone}</td>
                          <td className="px-5 py-3 text-slate-400 text-xs">{c.registered_at}</td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_BADGE[c.status]}`}>
                              {STATUS_LABEL[c.status]}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <Link to={`/admin/clients/${c.id}`} onClick={() => setShowClients(false)}
                              className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition">
                              <Eye size={12} /> Открыть
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
