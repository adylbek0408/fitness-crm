import { useState, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { STATUS_BADGE, STATUS_LABEL } from '../../utils/format'

export default function ClientList() {
  const { user } = useOutletContext()
  const [clients, setClients] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [format, setFormat] = useState('')
  const totalPages = Math.ceil(count / 25)
  const timer = useRef(null)

  const load = async (p = page) => {
    const params = new URLSearchParams({ page: p })
    if (search) params.append('search', search)
    if (status) params.append('status', status)
    if (format) params.append('training_format', format)
    const r = await api.get(`/clients/?${params}`)
    setClients(r.data.results || []); setCount(r.data.count || 0)
  }

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); load(1) }, 300)
  }, [search, status, format])

  useEffect(() => { load() }, [page])

  return (
    <MobileLayout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Клиенты</h2>
        <Link to="/mobile/clients/register" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl">+ Добавить</Link>
      </div>
      <div className="space-y-3 mb-4">
        <input type="text" placeholder="Поиск по имени или телефону..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="completed">Завершили</option>
          <option value="expelled">Отчислены</option>
        </select>
        <select value={format} onChange={e => setFormat(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
          <option value="">Онлайн и Оффлайн</option>
          <option value="online">Онлайн</option>
          <option value="offline">Оффлайн</option>
        </select>
      </div>
      <div className="space-y-3">
        {clients.length === 0
          ? <div className="text-center text-gray-400 py-8">Клиенты не найдены</div>
          : clients.map(c => (
            <Link key={c.id} to={`/mobile/clients/${c.id}`} className="block bg-white rounded-2xl p-4 shadow-sm border hover:border-blue-300 transition">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-800">{c.full_name}</p>
                  <p className="text-sm text-gray-500">{c.phone}</p>
                  <p className="text-xs text-gray-400 mt-1">{c.training_format === 'online' ? '🌐 Онлайн' : '🏋️ Оффлайн'} · {c.group_type}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
              </div>
            </Link>
          ))}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-between mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="text-sm text-blue-600 disabled:text-gray-300">← Назад</button>
          <span className="text-sm text-gray-500">стр. {page} из {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages} className="text-sm text-blue-600 disabled:text-gray-300">Вперёд →</button>
        </div>
      )}
    </MobileLayout>
  )
}
