import { useEffect, useState } from 'react'
import { Radio, Copy, Play, Square, Plus } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'

export default function StreamsAdmin() {
  const { user } = useOutletContext()
  const [streams, setStreams] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ title: '', description: '', group_ids: [] })

  const reload = () => {
    setLoading(true)
    api.get('/education/streams/')
      .then(r => setStreams(r.data?.results || r.data || []))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    reload()
    api.get('/groups/').then(r => setGroups(r.data?.results || r.data || [])).catch(() => {})
  }, [])

  const create = async () => {
    if (!form.title) { setError('Введите название'); return }
    setError('')
    try {
      await api.post('/education/streams/', {
        title: form.title,
        description: form.description,
        groups: form.group_ids,
      })
      setForm({ title: '', description: '', group_ids: [] })
      reload()
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка создания')
    }
  }

  const start = id => api.post(`/education/streams/${id}/start/`).then(reload)
  const end   = id => api.post(`/education/streams/${id}/end/`).then(reload)
  const copy  = t => navigator.clipboard?.writeText(t)

  return (
    <AdminLayout user={user}>
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Radio /> Прямые эфиры
      </h1>

      <div className="bg-white rounded-2xl border p-6 mb-6 shadow-sm">
        <h2 className="font-semibold mb-4 flex items-center gap-2">
          <Plus size={18} /> Создать новый эфир
        </h2>
        {error && <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mb-3">{error}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="Название"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            className="px-3 py-2 border rounded-lg"
          />
          <input
            type="text"
            placeholder="Описание"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            className="px-3 py-2 border rounded-lg"
          />
          <select
            multiple
            value={form.group_ids}
            onChange={e => setForm({
              ...form,
              group_ids: Array.from(e.target.selectedOptions).map(o => o.value),
            })}
            className="md:col-span-2 px-3 py-2 border rounded-lg h-32"
          >
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <button
          onClick={create}
          className="mt-4 px-5 py-2.5 bg-rose-500 text-white rounded-lg hover:bg-rose-600"
        >
          Создать эфир
        </button>
      </div>

      <div className="space-y-4">
        {loading && <div className="text-gray-400">Загрузка…</div>}
        {streams.map(s => (
          <div key={s.id} className="bg-white rounded-2xl border p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{s.title}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    s.status === 'live' ? 'bg-rose-100 text-rose-700' :
                    s.status === 'ended' ? 'bg-gray-100 text-gray-600' :
                    s.status === 'archived' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-blue-50 text-blue-600'
                  }`}>{s.status}</span>
                </div>
                {s.description && <p className="text-sm text-gray-500 mt-1">{s.description}</p>}
              </div>
              <div className="flex gap-2">
                {s.status === 'scheduled' && (
                  <button onClick={() => start(s.id)} className="px-3 py-1.5 rounded-lg bg-emerald-500 text-white text-sm flex items-center gap-1">
                    <Play size={14} /> Старт
                  </button>
                )}
                {s.status === 'live' && (
                  <button onClick={() => end(s.id)} className="px-3 py-1.5 rounded-lg bg-rose-500 text-white text-sm flex items-center gap-1">
                    <Square size={14} /> Завершить
                  </button>
                )}
              </div>
            </div>

            {(s.cf_rtmp_url || s.cf_stream_key) && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <CredField label="RTMP URL для OBS" value={s.cf_rtmp_url} onCopy={() => copy(s.cf_rtmp_url)} />
                <CredField label="Stream Key (секрет)" value={s.cf_stream_key} secret onCopy={() => copy(s.cf_stream_key)} />
              </div>
            )}
          </div>
        ))}
        {!loading && streams.length === 0 && <div className="text-gray-400 text-center py-12">Эфиров ещё нет.</div>}
      </div>
    </div>
    </AdminLayout>
  )
}

function CredField({ label, value, secret, onCopy }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border">
        <code className="flex-1 truncate text-xs">
          {secret ? '•'.repeat(Math.min(20, (value || '').length)) : value}
        </code>
        <button onClick={onCopy} className="p-1 hover:bg-gray-200 rounded">
          <Copy size={14} />
        </button>
      </div>
    </div>
  )
}
