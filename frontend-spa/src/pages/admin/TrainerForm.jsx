import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'

export default function TrainerForm() {
  const { id } = useParams()
  const isEdit = id && id !== 'add'
  const nav = useNavigate()
  const { user } = useOutletContext()
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', schedule: '' })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (isEdit) {
      api.get(`/trainers/${id}/`).then(r => {
        const t = r.data
        setForm({ first_name: t.first_name, last_name: t.last_name, phone: t.phone || '', schedule: t.schedule || '' })
      })
    }
  }, [id])

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setSuccess('')
    try {
      if (isEdit) await api.put(`/trainers/${id}/`, form)
      else await api.post('/trainers/', form)
      setSuccess(isEdit ? 'Тренер обновлён!' : 'Тренер создан!')
      setTimeout(() => nav('/admin/trainers'), 1200)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k,v]) => `${k}: ${v}`).join(' | ') : 'Ошибка')
    }
  }

  const set = (k, v) => setForm(f => ({...f, [k]: v}))

  return (
    <AdminLayout user={user}>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link to="/admin/trainers" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</Link>
        <h2 className="text-2xl font-bold text-gray-800">{isEdit ? 'Редактировать тренера' : 'Новый тренер'}</h2>
      </div>
      {error && <div className="bg-red-50 text-red-600 rounded-xl p-4 mb-4 text-sm">{error}</div>}
      {success && <div className="bg-green-50 text-green-700 rounded-xl p-4 mb-4 text-sm">{success}</div>}
      <div className="bg-white rounded-2xl shadow-sm border p-6 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Фамилия *</label>
              <input required value={form.last_name} onChange={e => set('last_name', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Имя *</label>
              <input required value={form.first_name} onChange={e => set('first_name', e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Телефон</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+996..."
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Рабочее расписание</label>
            <textarea rows={4} value={form.schedule} onChange={e => set('schedule', e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          </div>
          <div className="flex gap-3 pt-2 flex-wrap">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-xl text-sm transition">Сохранить</button>
            <Link to="/admin/trainers" className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-6 py-3 rounded-xl text-sm transition">Отмена</Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  )
}
