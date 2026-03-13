import { useState, useEffect } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'

export default function Trainers() {
  const { user } = useOutletContext()
  const [trainers, setTrainers] = useState([])

  const load = async () => {
    const r = await api.get('/trainers/?page_size=100')
    setTrainers(r.data.results || [])
  }

  useEffect(() => { load() }, [])

  const deactivate = async (id, name) => {
    if (!confirm(`Деактивировать тренера ${name}?`)) return
    try { await api.delete(`/trainers/${id}/`); load() }
    catch (e) { alert(e.response?.data?.detail || 'Ошибка') }
  }

  return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h2 className="crm-page-title">Тренеры</h2>
        <Link to="/admin/trainers/add" className="crm-btn-primary">+ Новый тренер</Link>
      </div>
      <div className="crm-card overflow-hidden">
        <div className="crm-table-wrap">
        <table className="crm-table min-w-[760px]">
          <thead>
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-600">ФИО</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Телефон</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Расписание</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {trainers.length === 0
              ? <tr><td colSpan={4} className="text-center py-10 text-gray-400">Нет тренеров</td></tr>
              : trainers.map(t => (
                <tr key={t.id}>
                  <td className="px-5 py-4 font-medium text-gray-800">{t.full_name}</td>
                  <td className="px-5 py-4 text-gray-600">{t.phone || '—'}</td>
                  <td className="px-5 py-4 text-gray-500 max-w-xs truncate">{t.schedule || '—'}</td>
                  <td className="px-5 py-4 flex gap-3">
                    <Link to={`/admin/trainers/${t.id}`} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Изменить</Link>
                    <button onClick={() => deactivate(t.id, t.full_name)} className="text-red-500 hover:text-red-700 text-xs font-medium">Деактивировать</button>
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
