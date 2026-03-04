import { useState, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, fmtDate } from '../../utils/format'

export default function Clients() {
  const { user } = useOutletContext()
  const [clients, setClients] = useState([])
  const [groups, setGroups] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [format, setFormat] = useState('')
  const [group, setGroup] = useState('')
  const [isRepeat, setIsRepeat] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState('')
  const [registeredFrom, setRegisteredFrom] = useState('')
  const [registeredTo, setRegisteredTo] = useState('')
  const totalPages = Math.ceil(count / 25)
  const timer = useRef(null)

  const load = async (p = page) => {
    const params = new URLSearchParams({ page: p })
    if (search) params.append('search', search)
    if (status) params.append('status', status)
    if (format) params.append('training_format', format)
    if (group) params.append('group', group)
    if (isRepeat) params.append('is_repeat', 'true')
    if (paymentStatus) params.append('payment_status', paymentStatus)
    if (registeredFrom) params.append('registered_from', registeredFrom)
    if (registeredTo) params.append('registered_to', registeredTo)
    const r = await api.get(`/clients/?${params}`)
    setClients(r.data.results || [])
    setCount(r.data.count || 0)
  }

  useEffect(() => {
    api.get('/groups/?page_size=100').then(r => setGroups(r.data.results || []))
  }, [])

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); load(1) }, 300)
  }, [search, status, format, group, isRepeat, paymentStatus, registeredFrom, registeredTo])

  useEffect(() => { load() }, [page])

  const resetFilters = () => {
    setSearch('')
    setStatus('')
    setFormat('')
    setGroup('')
    setIsRepeat(false)
    setPaymentStatus('')
    setRegisteredFrom('')
    setRegisteredTo('')
    setPage(1)
    setTimeout(() => load(1), 0)
  }

  return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">База клиентов</h2>
      </div>
      <div className="bg-white rounded-2xl p-4 shadow-sm border mb-5 flex gap-3 flex-wrap items-center">
        <input type="text" placeholder="Поиск по имени, телефону..." value={search} onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-56" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="completed">Завершили</option>
          <option value="expelled">Отчислены</option>
        </select>
        <select value={format} onChange={e => setFormat(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
          <option value="">Онлайн + Оффлайн</option>
          <option value="online">Онлайн</option>
          <option value="offline">Оффлайн</option>
        </select>
        <select value={group} onChange={e => setGroup(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
          <option value="">Все потоки</option>
          {groups.map(g => <option key={g.id} value={g.id}>Поток #{g.number}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={isRepeat} onChange={e => setIsRepeat(e.target.checked)} className="rounded" />
          Только повторные
        </label>
        <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
          <option value="">Все по оплате</option>
          <option value="paid">Оплатили полностью</option>
          <option value="unpaid">Есть остаток</option>
        </select>
        <span className="text-gray-400 text-sm">Рег.:</span>
        <input type="date" value={registeredFrom} onChange={e => setRegisteredFrom(e.target.value)} placeholder="с"
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none w-40" />
        <input type="date" value={registeredTo} onChange={e => setRegisteredTo(e.target.value)} placeholder="по"
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none w-40" />
        <button type="button" onClick={resetFilters}
          className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-300 transition">
          Сбросить фильтры
        </button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Клиент</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Телефон</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Формат</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Поток</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Оплата</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Дата рег.</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Менеджер</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Статус</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0
              ? <tr><td colSpan={9} className="text-center py-10 text-gray-400">Клиенты не найдены</td></tr>
              : clients.map(c => {
                const payStatus = c.payment_type === 'full'
                  ? (c.full_payment?.is_paid ? <span className="text-green-600 text-xs">✅ Оплачено</span> : <span className="text-red-500 text-xs">⏳ Не оплачено</span>)
                  : (c.installment_plan && Number(c.installment_plan.remaining) <= 0 ? <span className="text-green-600 text-xs">✅ Закрыта</span> : <span className="text-orange-500 text-xs">⏳ {fmtMoney(c.installment_plan?.remaining || 0)} остаток</span>)
                return (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-800">{c.full_name}</p>
                      {c.is_repeat && <p className="text-xs text-gray-400">🔁 Повторный</p>}
                    </td>
                    <td className="px-5 py-4 text-gray-600">{c.phone}</td>
                    <td className="px-5 py-4 text-gray-600">{c.training_format === 'online' ? '🌐' : '🏋️'} {c.group_type}</td>
                    <td className="px-5 py-4 text-gray-600">{c.group ? `Поток #${c.group.number}` : '—'}</td>
                    <td className="px-5 py-4">{payStatus}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{fmtDate(c.registered_at)}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{c.registered_by_name || '—'}</td>
                    <td className="px-5 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                    <td className="px-5 py-4"><Link to={`/admin/clients/${c.id}`} className="text-blue-500 hover:text-blue-700 text-xs font-medium">Открыть</Link></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-300">← Назад</button>
          <span className="text-sm text-gray-500">{count} клиентов · стр. {page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages} className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-300">Вперёд →</button>
        </div>
      )}
    </AdminLayout>
  )
}
