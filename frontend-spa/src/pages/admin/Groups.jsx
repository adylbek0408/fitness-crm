import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL } from '../../utils/format'

export default function Groups() {
  const { user } = useOutletContext()
  const [groups, setGroups] = useState([])
  const [trainers, setTrainers] = useState([])
  const [status, setStatus] = useState('')
  const [trainer, setTrainer] = useState('')

  const load = async () => {
    const params = new URLSearchParams()
    if (status) params.append('status', status)
    if (trainer) params.append('trainer', trainer)
    params.append('page_size', '100')
    const r = await api.get(`/groups/?${params}`)
    setGroups(r.data.results || [])
  }

  useEffect(() => {
    api.get('/trainers/?page_size=100').then(r => setTrainers(r.data.results || []))
  }, [])

  useEffect(() => { load() }, [status, trainer])

  const closeGroup = async (id) => {
    if (!confirm('Закрыть поток? Все активные клиенты станут \"Завершили\"')) return
    try {
      await api.post(`/groups/${id}/close/`)
      load()
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка')
    }
  }

  return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="crm-page-title">Потоки</h2>
        <Link to="/admin/groups/add" className="crm-btn-primary">
          + Новый поток
        </Link>
      </div>
      <div className="crm-card p-4 mb-5 flex gap-3 flex-wrap">
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="crm-input w-full sm:w-auto">
          <option value="">Все статусы</option>
          <option value="recruitment">Набор</option>
          <option value="active">Активные</option>
          <option value="completed">Завершённые</option>
        </select>
        <select value={trainer} onChange={e => setTrainer(e.target.value)}
          className="crm-input w-full sm:w-auto">
          <option value="">Все тренеры</option>
          {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
        </select>
      </div>
      <div className="crm-card overflow-hidden">
        <div className="crm-table-wrap">
        <table className="crm-table min-w-[860px]">
          <thead>
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Поток</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Тип</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Тренер</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">График</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Старт</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Клиенты</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Статус</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0
              ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">Потоки не найдены</td></tr>
              : groups.map(g => (
                <tr key={g.id}>
                  <td className="px-5 py-4 font-medium text-gray-800">Поток #{g.number}</td>
                  <td className="px-5 py-4 text-gray-600">{g.group_type}</td>
                  <td className="px-5 py-4 text-gray-600">{g.trainer?.full_name || '—'}</td>
                  <td className="px-5 py-4 text-gray-500 max-w-xs truncate">{g.schedule || '—'}</td>
                  <td className="px-5 py-4 text-gray-600">{g.start_date || '—'}</td>
                  <td className="px-5 py-4 text-gray-600">{g.client_count}</td>
                  <td className="px-5 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[g.status]}`}>
                      {STATUS_LABEL[g.status]}
                    </span>
                  </td>
                  <td className="px-5 py-4 flex gap-2 flex-wrap">
                    <Link to={`/admin/groups/${g.id}/detail`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Клиенты</Link>
                    <Link to={`/admin/groups/${g.id}`} className="text-slate-600 hover:text-slate-800 text-xs font-medium">Изменить</Link>
                    {g.status !== 'completed' && (
                      <button onClick={() => closeGroup(g.id)} className="text-red-500 hover:text-red-700 text-xs font-medium">Закрыть</button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        </div>
      </div>
    </AdminLayout>
  )
}
