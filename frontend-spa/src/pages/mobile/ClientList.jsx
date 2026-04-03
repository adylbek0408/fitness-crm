import { useState, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import MobileDateField from '../../components/MobileDateField'
import { useRefresh } from '../../contexts/RefreshContext'
import { CheckCircle, Clock, Globe, Dumbbell, ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react'
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

  const activeFiltersCount = [
    status,
    format,
    paymentStatus,
    registeredFrom,
    registeredTo,
  ].filter(Boolean).length

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
        <div>
          <h2 className="text-xl font-bold tracking-tight" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>Клиенты</h2>
          {count > 0 && <p className="text-xs mt-0.5" style={{ color: 'var(--text-xs)' }}>{count} клиентов</p>}
        </div>
        <Link to="/mobile/clients/register"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0"
          style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)', boxShadow: '0 3px 10px rgba(190,24,93,0.25)' }}>
          + Добавить
        </Link>
      </div>

      <div className="space-y-3 mb-4">
        <input type="text" placeholder="Поиск по имени или телефону..." value={search} onChange={e => setSearch(e.target.value)}
          className="crm-mobile-input" />

        <button type="button" onClick={() => setFiltersOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 px-4 rounded-2xl touch-manipulation min-h-[48px] transition"
          style={{ background: '#fff', border: '1px solid var(--border)', color: 'var(--text)', fontWeight: 600, fontSize: 15 }}>
          <span className="inline-flex items-center gap-2">
            <SlidersHorizontal size={18} />
            Фильтры
            {activeFiltersCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-blue-600 text-white text-xs font-semibold">
                {activeFiltersCount}
              </span>
            )}
          </span>
          {filtersOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {!filtersOpen && activeFiltersCount > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {status && <span className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#fce7f3', color: '#be185d' }}>Статус: {STATUS_LABEL[status]}</span>}
            {format && <span className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#fce7f3', color: '#be185d' }}>Формат: {format === 'online' ? 'Онлайн' : 'Оффлайн'}</span>}
            {paymentStatus && <span className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#fce7f3', color: '#be185d' }}>Оплата: {paymentStatus === 'paid' ? 'Оплачено' : 'Есть остаток'}</span>}
            {registeredFrom && <span className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#fce7f3', color: '#be185d' }}>С: {registeredFrom}</span>}
            {registeredTo && <span className="px-2.5 py-1 rounded-lg text-xs font-medium" style={{ background: '#fce7f3', color: '#be185d' }}>По: {registeredTo}</span>}
          </div>
        )}

        {filtersOpen && (
          <div className="space-y-3 pt-1 bg-white border border-slate-200 rounded-2xl p-3 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="crm-mobile-select">
                <option value="">Все статусы</option>
                <option value="new">Новые</option>
                <option value="active">Активные</option>
                <option value="frozen">Заморозка</option>
                <option value="completed">Завершили</option>
                <option value="expelled">Отчислены</option>
              </select>
              <select value={format} onChange={e => setFormat(e.target.value)}
                className="crm-mobile-select">
                <option value="">Онлайн и Оффлайн</option>
                <option value="online">Онлайн</option>
                <option value="offline">Оффлайн</option>
              </select>
            </div>
            <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
              className="crm-mobile-select">
              <option value="">Все по оплате</option>
              <option value="paid">Оплатили полностью</option>
              <option value="unpaid">Есть остаток</option>
            </select>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <MobileDateField label="Регистрация с" value={registeredFrom} onChange={setRegisteredFrom} />
              <MobileDateField label="Регистрация по" value={registeredTo} onChange={setRegisteredTo} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setFiltersOpen(false)}
                className="crm-btn-primary flex-1 min-h-[48px]">
                Применить
              </button>
              <button type="button" onClick={resetFilters}
                className="crm-btn-secondary flex-1 min-h-[48px]">
                Сбросить
              </button>
            </div>
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
                <Link key={c.id} to={`/mobile/clients/${c.id}`}
                  className="block rounded-2xl p-4 active:scale-[0.99] transition-transform"
                  style={{ background: '#fff', border: '1px solid var(--border)', boxShadow: '0 1px 4px rgba(120,40,80,0.04)' }}>
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
                    <span className={`text-xs px-2 py-1 rounded-full shrink-0 ml-2 ${STATUS_BADGE[c.status] || 'bg-gray-100 text-gray-600'}`}>{STATUS_LABEL[c.status] || c.status}</span>
                  </div>
                </Link>
              )
            })}
      </div>
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4 gap-2">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1}
            className="min-h-[44px] px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 touch-manipulation transition"
            style={{ background: page <= 1 ? '#f3f4f6' : '#fce7f3', color: page <= 1 ? '#9ca3af' : '#be185d' }}>
            ← Назад
          </button>
          <span className="text-xs shrink-0" style={{ color: 'var(--text-soft)' }}>стр. {page} из {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
            className="min-h-[44px] px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 touch-manipulation transition"
            style={{ background: page >= totalPages ? '#f3f4f6' : '#fce7f3', color: page >= totalPages ? '#9ca3af' : '#be185d' }}>
            Вперёд →
          </button>
        </div>
      )}
    </MobileLayout>
  )
}
