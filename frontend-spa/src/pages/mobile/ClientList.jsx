import { useState, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'
import { CheckCircle, Clock, Globe, Dumbbell, ChevronDown, ChevronUp } from 'lucide-react'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, fmtDate, GROUP_TYPE_LABEL } from '../../utils/format'

export default function ClientList() {
  const { user } = useOutletContext()
  const [clients, setClients] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [format, setFormat] = useState('')
  const [paymentStatus, setPaymentStatus] = useState('')
  const [registeredFrom, setRegisteredFrom] = useState('')
  const [registeredTo, setRegisteredTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const totalPages = Math.ceil(count / 25)
  const timer = useRef(null)

  useRefresh(() => load(1))

  const load = async (p = page) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p })
      if (search) params.append('search', search)
      if (status) params.append('status', status)
      if (format) params.append('training_format', format)
      if (paymentStatus) params.append('payment_status', paymentStatus)
      if (registeredFrom) params.append('registered_from', registeredFrom)
      if (registeredTo) params.append('registered_to', registeredTo)
      const r = await api.get(`/clients/?${params}`)
      setClients(r.data.results || []); setCount(r.data.count || 0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPage(1); load(1) }, 300)
  }, [search, status, format, paymentStatus, registeredFrom, registeredTo])

  useEffect(() => { load() }, [page])

  const resetFilters = () => {
    setSearch('')
    setStatus('')
    setFormat('')
    setPaymentStatus('')
    setRegisteredFrom('')
    setRegisteredTo('')
    setPage(1)
    setTimeout(() => load(1), 0)
  }

  const paymentLabel = (c) => {
    if (c.payment_type === 'full' && c.full_payment) {
      return c.full_payment.is_paid
        ? { text: 'Оплачено', cls: 'text-green-600', sub: fmtMoney(c.full_payment.amount), Icon: CheckCircle }
        : { text: 'Не оплачено', cls: 'text-red-600', sub: fmtMoney(c.full_payment.amount), Icon: Clock }
    }
    if (c.payment_type === 'installment' && c.installment_plan) {
      const plan = c.installment_plan
      const remaining = Number(plan.remaining)
      return remaining <= 0
        ? { text: 'Закрыта', cls: 'text-green-600', sub: `Оплачено ${fmtMoney(plan.total_paid)}`, Icon: CheckCircle }
        : { text: `Остаток ${fmtMoney(remaining)}`, cls: 'text-orange-600', sub: `из ${fmtMoney(plan.total_cost)} · дедлайн ${plan.deadline}`, Icon: Clock }
    }
    return null
  }

  return (
    <MobileLayout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Клиенты</h2>
        <Link to="/mobile/clients/register" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-xl">+ Добавить</Link>
      </div>
      <div className="space-y-3 mb-4">
        <input type="text" placeholder="Поиск по имени или телефону..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        <button type="button" onClick={() => setFiltersOpen(o => !o)}
          className="w-full flex items-center justify-between py-3 px-4 rounded-xl border border-gray-300 bg-white text-sm font-medium text-gray-700 touch-manipulation min-h-[44px]">
          <span>Фильтры</span>
          {filtersOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
        {filtersOpen && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
            <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
              <option value="">Все по оплате</option>
              <option value="paid">Оплатили полностью</option>
              <option value="unpaid">Есть остаток</option>
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Регистрация с</label>
                <input type="date" value={registeredFrom} onChange={e => setRegisteredFrom(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Регистрация по</label>
                <input type="date" value={registeredTo} onChange={e => setRegisteredTo(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
            </div>
            <button type="button" onClick={resetFilters}
              className="w-full py-2.5 rounded-xl text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 border border-gray-300 transition touch-manipulation min-h-[44px]">
              Сбросить фильтры
            </button>
          </div>
        )}
      </div>
      <div className="space-y-3">
        {loading
          ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : clients.length === 0
          ? <div className="text-center text-gray-400 py-8">Клиенты не найдены</div>
          : clients.map(c => {
              const pay = paymentLabel(c)
              const PayIcon = pay?.Icon
              return (
                <Link key={c.id} to={`/mobile/clients/${c.id}`} className="block bg-white rounded-2xl p-4 shadow-sm border hover:border-blue-300 transition">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 break-words">{c.full_name}</p>
                      <p className="text-sm text-gray-500">{c.phone}</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        {c.training_format === 'online' ? <Globe size={12} /> : <Dumbbell size={12} />}
                        {c.training_format === 'online' ? 'Онлайн' : 'Оффлайн'} · {GROUP_TYPE_LABEL[c.group_type] || c.group_type}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Рег.: {fmtDate(c.registered_at)}</p>
                      {pay && (
                        <p className={`text-xs font-medium mt-1.5 flex items-center gap-1 ${pay.cls}`}>
                          {PayIcon && <PayIcon size={12} />}
                          {pay.text} {pay.sub && <span className="text-gray-500 font-normal">— {pay.sub}</span>}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full shrink-0 ml-2 ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                  </div>
                </Link>
              )
            })}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4 gap-2">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-blue-600 disabled:text-gray-300 disabled:opacity-60 touch-manipulation">
            ← Назад
          </button>
          <span className="text-sm text-gray-500 shrink-0">стр. {page} из {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
            className="min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium text-blue-600 disabled:text-gray-300 disabled:opacity-60 touch-manipulation">
            Вперёд →
          </button>
        </div>
      )}
    </MobileLayout>
  )
}
