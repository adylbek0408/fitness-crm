import { useEffect, useState } from 'react'
import { Video, Copy, MessageCircle, X, Plus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'

export default function ConsultationsAdmin() {
  const { user } = useOutletContext()
  const [items, setItems] = useState([])
  const [trainers, setTrainers] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title: '', trainer: '', client: '', expires_in_hours: 24, max_uses: 2,
  })

  const reload = () => {
    setLoading(true)
    api.get('/education/consultations/')
      .then(r => setItems(r.data?.results || r.data || []))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    api.get('/trainers/').then(r => setTrainers(r.data?.results || r.data || [])).catch(() => {})
    api.get('/clients/?limit=200').then(r => setClients(r.data?.results || r.data || [])).catch(() => {})
  }, [])

  const create = async () => {
    setError('')
    try {
      const expires = new Date(Date.now() + form.expires_in_hours * 3600 * 1000).toISOString()
      await api.post('/education/consultations/', {
        title: form.title || 'Консультация',
        trainer: form.trainer || null,
        client: form.client || null,
        expires_at: expires,
        max_uses: Number(form.max_uses) || 2,
      })
      setForm({ title: '', trainer: '', client: '', expires_in_hours: 24, max_uses: 2 })
      reload()
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка создания')
    }
  }

  const cancel = id => api.post(`/education/consultations/${id}/cancel/`).then(reload)
  const fullUrl = uuid => `${window.location.origin}/room/${uuid}`
  const copy = t => navigator.clipboard?.writeText(t)
  const wa = url => `https://wa.me/?text=${encodeURIComponent(`Ссылка на онлайн-консультацию: ${url}`)}`

  return (
    <AdminLayout user={user}>
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Video /> Онлайн консультации
      </h1>

      <div className="bg-white rounded-2xl border p-6 mb-6 shadow-sm">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Plus size={18} /> Создать ссылку
        </h2>
        {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mb-3">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Название (необязательно)"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="px-3 py-2 border rounded-lg"
          />
          <select
            value={form.trainer}
            onChange={e => setForm({ ...form, trainer: e.target.value })}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">Тренер не выбран</option>
            {trainers.map(t => (
              <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
            ))}
          </select>
          <select
            value={form.client}
            onChange={e => setForm({ ...form, client: e.target.value })}
            className="px-3 py-2 border rounded-lg"
          >
            <option value="">Клиент не выбран (открытая ссылка)</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500">Срок (часы)</label>
              <input
                type="number"
                value={form.expires_in_hours}
                onChange={e => setForm({ ...form, expires_in_hours: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Макс. заходов</label>
              <input
                type="number"
                value={form.max_uses}
                onChange={e => setForm({ ...form, max_uses: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
          </div>
        </div>
        <button
          onClick={create}
          className="mt-4 px-5 py-2.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600"
        >
          Создать ссылку
        </button>
      </div>

      <div className="space-y-3">
        {loading && <div className="text-gray-400">Загрузка…</div>}
        {items.map(c => {
          const url = fullUrl(c.room_uuid)
          return (
            <div key={c.id} className="bg-white rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{c.title || 'Консультация'}</div>
                  <div className="text-xs text-gray-500">
                    Статус: <b>{c.status}</b> · Использовано {c.used_count}/{c.max_uses} ·
                    Истекает {new Date(c.expires_at).toLocaleString('ru')}
                  </div>
                  <div className="mt-1 text-xs font-mono text-rose-600 truncate">{url}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => copy(url)} className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm flex items-center gap-1">
                    <Copy size={14} /> Копировать
                  </button>
                  <a
                    href={wa(url)}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm flex items-center gap-1"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                  {c.status === 'active' && (
                    <button onClick={() => cancel(c.id)} className="px-3 py-1.5 rounded-lg bg-rose-100 text-rose-700 text-sm flex items-center gap-1">
                      <X size={14} /> Отменить
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        {!loading && items.length === 0 && (
          <div className="text-center py-12 text-gray-400">Ссылок ещё нет.</div>
        )}
      </div>
    </div>
    </AdminLayout>
  )
}
