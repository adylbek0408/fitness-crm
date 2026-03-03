import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'

export default function GroupForm() {
  const { id } = useParams()
  const isEdit = id && id !== 'add'
  const nav = useNavigate()
  const { user } = useOutletContext()
  const [trainers, setTrainers] = useState([])
  const [form, setForm] = useState({ number: '', group_type: '', trainer: '', schedule: '', start_date: '', end_date: '', status: 'recruitment' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    api.get('/trainers/?page_size=100').then(r => setTrainers(r.data.results || []))
    if (isEdit) {
      api.get(`/groups/${id}/`).then(r => {
        const g = r.data
        setForm({ number: g.number, group_type: g.group_type, trainer: g.trainer?.id || '', schedule: g.schedule || '', start_date: g.start_date || '', end_date: g.end_date || '', status: g.status })
      })
    }
  }, [id])

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setSuccess('')
    const body = { ...form, number: parseInt(form.number), start_date: form.start_date || null, end_date: form.end_date || null }
    try {
      if (isEdit) await api.put(`/groups/${id}/`, body)
      else await api.post('/groups/', body)
      setSuccess(isEdit ? 'Поток обновлён!' : 'Поток создан!')
      setTimeout(() => nav('/admin/groups'), 1200)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k,v]) => `${k}: ${v}`).join(' | ') : 'Ошибка')
    }
  }

  const set = (k, v) => setForm(f => ({...f, [k]: v}))

  return (
    <AdminLayout user={user}>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/groups" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</Link>
        <h2 className="text-2xl font-bold text-gray-800">{isEdit ? 'Редактировать поток' : 'Новый поток'}</h2>
      </div>
      {error && <div className="bg-red-50 text-red-600 rounded-xl p-4 mb-4 text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 rounded-xl p-4 mb-4 text-sm">{success}</div>}
      <div className="bg-white rounded-2xl shadow-sm border p-6 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Номер потока *</label>
              <input type="number" required value={form.number} onChange={e => set('number', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Тип группы *</label>
              <select required value={form.group_type} onChange={e => set('group_type', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">Выберите тип</option>
                <option value="1.5h">1.5 часа</option>
                <option value="2.5h">2.5 часа</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Тренер *</label>
            <select required value={form.trainer} onChange={e => set('trainer', e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">Выберите тренера</option>
              {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">График занятий</label>
            <textarea rows={3} value={form.schedule} onChange={e => set('schedule', e.target.value)}
              placeholder="Пример: Пн, Ср, Пт 10:00-11:30"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата старта</label>
              <input type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата окончания</label>
              <input type="date" value={form.end_date} onChange={e => set('end_date', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Статус</label>
            <select value={form.status} onChange={e => set('status', e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="recruitment">Набор</option>
              <option value="active">Активный</option>
              <option value="completed">Завершён</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-xl text-sm transition">Сохранить</button>
            <Link to="/admin/groups" className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-6 py-3 rounded-xl text-sm transition">Отмена</Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
