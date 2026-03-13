import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL } from '../../utils/format'

export default function Managers() {
  const { user } = useOutletContext()
  const [managers, setManagers] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [selectedManager, setSelectedManager] = useState(null)
  const [managerClients, setManagerClients] = useState([])
  const [showClients, setShowClients] = useState(false)
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
      setError(typeof d === 'object' ? Object.entries(d).map(([k,v]) => `${k}: ${v}`).join(' | ') : 'Ошибка')
    }
  }

  const deactivate = async (id, name) => {
    if (!confirm(`Деактивировать ${name}?`)) return
    await api.post(`/accounts/managers/${id}/deactivate/`)
    load()
  }

  const viewClients = async (mgr) => {
    setSelectedManager(mgr)
    const r = await api.get(`/accounts/managers/${mgr.id}/clients/`)
    setManagerClients(r.data.results || [])
    setShowClients(true)
  }

  const set = (k, v) => setForm(f => ({...f, [k]: v}))

  return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="text-2xl font-bold text-gray-800">Менеджеры (Регистраторы)</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2.5 rounded-xl transition">+ Новый менеджер</button>
      </div>
      {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-xl text-sm">{success}</div>}
      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-xl text-sm">{error}</div>}
      {showForm && (
        <div className="bg-white rounded-2xl shadow-sm border p-6 mb-6 max-w-lg">
          <h3 className="font-medium text-gray-700 mb-4">Новый менеджер</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input required placeholder="Фамилия *" value={form.last_name} onChange={e => set('last_name', e.target.value)} className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <input required placeholder="Имя *" value={form.first_name} onChange={e => set('first_name', e.target.value)} className="border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <input placeholder="Телефон" value={form.phone} onChange={e => set('phone', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <input required placeholder="Логин (username) *" value={form.username} onChange={e => set('username', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <input required type="password" placeholder="Пароль * (мин. 6 символов)" value={form.password} onChange={e => set('password', e.target.value)} className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <div className="flex gap-3 pt-1">
              <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-5 py-2.5 rounded-xl text-sm">Создать</button>
              <button type="button" onClick={() => setShowForm(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-5 py-2.5 rounded-xl text-sm">Отмена</button>
            </div>
          </form>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-600">ФИО</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Логин</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Телефон</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Клиентов добавил</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Статус</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {managers.length === 0
              ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Менеджеры не найдены</td></tr>
              : managers.map(m => (
                <tr key={m.id} className="border-b hover:bg-gray-50">
                  <td className="px-5 py-4 font-medium text-gray-800">{m.last_name} {m.first_name}</td>
                  <td className="px-5 py-4 text-gray-600">{m.username}</td>
                  <td className="px-5 py-4 text-gray-500">{m.phone || '—'}</td>
                  <td className="px-5 py-4"><button onClick={() => viewClients(m)} className="text-blue-500 hover:underline text-sm">{m.clients_count} клиентов →</button></td>
                  <td className="px-5 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${m.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{m.is_active ? 'Активен' : 'Деактивирован'}</span></td>
                  <td className="px-5 py-4">{m.is_active && <button onClick={() => deactivate(m.id, `${m.last_name} ${m.first_name}`)} className="text-red-400 hover:text-red-600 text-xs font-medium">Деактивировать</button>}</td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </div>
      {showClients && selectedManager && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h3 className="font-semibold text-gray-800 break-words pr-3">Клиенты: {selectedManager.last_name} {selectedManager.first_name}</h3>
              <button onClick={() => setShowClients(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Клиент</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Телефон</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Дата регистрации</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {managerClients.length === 0
                    ? <tr><td colSpan={4} className="text-center py-8 text-gray-400">Нет клиентов</td></tr>
                    : managerClients.map(c => (
                      <tr key={c.id} className="border-b hover:bg-gray-50">
                        <td className="px-5 py-3"><Link to={`/admin/clients/${c.id}`} onClick={() => setShowClients(false)} className="font-medium text-gray-800 hover:text-blue-600">{c.full_name}</Link></td>
                        <td className="px-5 py-3 text-gray-500">{c.phone}</td>
                        <td className="px-5 py-3 text-gray-500">{c.registered_at}</td>
                        <td className="px-5 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
