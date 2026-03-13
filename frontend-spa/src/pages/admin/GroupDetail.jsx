import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useOutletContext } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL, GROUP_TYPE_LABEL } from '../../utils/format'

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useOutletContext()
  const [group, setGroup] = useState(null)
  const [groupClients, setGroupClients] = useState([])
  const [availableClients, setAvailableClients] = useState([])
  const [tab, setTab] = useState('current')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState(null)

  const loadGroup = useCallback(async () => {
    const r = await api.get(`/groups/${id}/`)
    setGroup(r.data)
  }, [id])

  const loadGroupClients = useCallback(async () => {
    const r = await api.get(`/groups/${id}/clients/`)
    setGroupClients(Array.isArray(r.data) ? r.data : r.data.results || [])
  }, [id])

  const loadAvailableClients = useCallback(async () => {
    if (!group) return
    const params = new URLSearchParams()
    params.append('group_type', filterType || group.group_type)
    if (search) params.append('search', search)
    params.append('page_size', '100')
    const r = await api.get(`/clients/?${params}`)
    const currentIds = new Set(groupClients.map(c => c.id))
    setAvailableClients((r.data.results || []).filter(c => !currentIds.has(c.id)))
  }, [group, search, filterType, groupClients])

  useEffect(() => { loadGroup() }, [loadGroup])
  useEffect(() => { if (group) loadGroupClients() }, [group])
  useEffect(() => { if (tab === 'add' && group) loadAvailableClients() }, [tab, group, search, filterType])

  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 3000) }

  const addClient = async (clientId) => {
    try {
      await api.post(`/groups/${id}/add-client/`, { client_id: clientId })
      showMsg('success', 'Клиент добавлен в поток')
      loadGroupClients()
      loadAvailableClients()
    } catch (e) { showMsg('error', e.response?.data?.detail || 'Ошибка') }
  }

  const removeClient = async (clientId) => {
    if (!confirm('Убрать клиента из потока?')) return
    await api.post(`/groups/${id}/remove-client/`, { client_id: clientId })
    loadGroupClients()
  }

  if (!group) return <AdminLayout user={user}><div className="text-center py-20 text-gray-400">Загрузка...</div></AdminLayout>

  return (
    <AdminLayout user={user}>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link to="/admin/groups" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</Link>
        <h2 className="text-2xl font-bold text-gray-800 break-words">Поток #{group.number} — {GROUP_TYPE_LABEL[group.group_type]}</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[group.status]}`}>{STATUS_LABEL[group.status]}</span>
        <Link to={`/admin/groups/${id}`} className="ml-auto text-sm text-blue-500 hover:underline">Редактировать</Link>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border mb-6 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 text-sm">
        <div><span className="text-gray-500">Тренер: </span><span className="font-medium">{group.trainer?.full_name || '—'}</span></div>
        <div><span className="text-gray-500">Старт: </span><span className="font-medium">{group.start_date || '—'}</span></div>
        <div><span className="text-gray-500">Клиентов: </span><span className="font-medium">{groupClients.length}</span></div>
      </div>
      {msg && (
        <div className={`mb-4 p-3 rounded-xl text-sm ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>
      )}
      <div className="flex gap-2 mb-5">
        {[['current', `Клиенты потока (${groupClients.length})`], ['add', '+ Добавить клиентов']].map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition ${tab === t ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'current' && (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Клиент</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Телефон</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Тип группы</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Статус</th>
                <th className="text-left px-5 py-3 font-medium text-gray-600">Менеджер</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {groupClients.length === 0
                ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">В потоке нет клиентов</td></tr>
                : groupClients.map(c => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-5 py-4 font-medium"><Link to={`/admin/clients/${c.id}`} className="text-gray-800 hover:text-blue-600">{c.full_name}</Link></td>
                    <td className="px-5 py-4 text-gray-600">{c.phone}</td>
                    <td className="px-5 py-4 text-gray-600">{GROUP_TYPE_LABEL[c.group_type]}</td>
                    <td className="px-5 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{c.registered_by_name || '—'}</td>
                    <td className="px-5 py-4"><button onClick={() => removeClient(c.id)} className="text-red-400 hover:text-red-600 text-xs">Убрать</button></td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
      {tab === 'add' && (
        <div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border mb-4 flex gap-3 flex-wrap items-center">
            <input type="text" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full sm:w-64" />
            <div className="flex gap-2">
              {[{ val: '', label: 'Все' }, { val: '1.5h', label: '1.5 часа' }, { val: '2.5h', label: '2.5 часа' }].map(opt => (
                <button key={opt.val} onClick={() => setFilterType(opt.val)}
                  className={`px-4 py-2 rounded-xl text-sm transition ${(filterType || group.group_type) === (opt.val || group.group_type) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 ml-auto">Поток типа <strong>{GROUP_TYPE_LABEL[group.group_type]}</strong></p>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Клиент</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Телефон</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Тип группы</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Текущий поток</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Менеджер</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {availableClients.length === 0
                  ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">Клиенты не найдены</td></tr>
                  : availableClients.map(c => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="px-5 py-4 font-medium text-gray-800">{c.full_name}</td>
                      <td className="px-5 py-4 text-gray-600">{c.phone}</td>
                      <td className="px-5 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${c.group_type === group.group_type ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-600'}`}>
                          {GROUP_TYPE_LABEL[c.group_type]}{c.group_type !== group.group_type && <AlertTriangle className="inline-block ml-1 text-amber-500" size={14} />}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500">{c.group ? `Поток #${c.group.number}` : '—'}</td>
                      <td className="px-5 py-4 text-gray-500 text-xs">{c.registered_by_name || '—'}</td>
                      <td className="px-5 py-4">
                        <button onClick={() => addClient(c.id)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg transition">Добавить</button>
                      </td>
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

