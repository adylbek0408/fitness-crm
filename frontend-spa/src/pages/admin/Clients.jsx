import { useState, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { CheckCircle, Clock, Globe, Dumbbell, RotateCcw } from 'lucide-react'
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
        <div>
          <h2 className="crm-page-title">База клиентов</h2>
          <p className="crm-page-subtitle mt-1">Поиск, фильтры и статусы оплат по всей клиентской базе</p>
        </div>
      </div>
      <div className="crm-card p-4 mb-5 flex gap-3 flex-wrap items-center">
        <input type="text" placeholder="Поиск по имени, телефону..." value={search} onChange={e => setSearch(e.target.value)}
          className="crm-input w-full sm:w-56" />
        <select value={status} onChange={e => setStatus(e.target.value)}
          className="crm-input w-full sm:w-auto">
          <option value="">Все статусы</option>
          <option value="active">Активные</option>
          <option value="completed">Завершили</option>
          <option value="expelled">Отчислены</option>
        </select>
        <select value={format} onChange={e => setFormat(e.target.value)}
          className="crm-input w-full sm:w-auto">
          <option value="">Онлайн + Оффлайн</option>
          <option value="online">Онлайн</option>
          <option value="offline">Оффлайн</option>
        </select>
        <select value={group} onChange={e => setGroup(e.target.value)}
          className="crm-input w-full sm:w-auto">
          <option value="">Все потоки</option>
          {groups.map(g => <option key={g.id} value={g.id}>Поток #{g.number}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={isRepeat} onChange={e => setIsRepeat(e.target.checked)} className="rounded" />
          Только повторные
        </label>
        <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}
          className="crm-input w-full sm:w-auto">
          <option value="">Все по оплате</option>
          <option value="paid">Оплатили полностью</option>
          <option value="unpaid">Есть остаток</option>
        </select>
        <span className="text-gray-400 text-sm">Рег.:</span>
        <input type="date" value={registeredFrom} onChange={e => setRegisteredFrom(e.target.value)} placeholder="с"
          className="crm-input w-full sm:w-40" />
        <input type="date" value={registeredTo} onChange={e => setRegisteredTo(e.target.value)} placeholder="по"
          className="crm-input w-full sm:w-40" />
        <button type="button" onClick={resetFilters}
          className="crm-btn-secondary">
          Сбросить фильтры
        </button>
      </div>
      <div className="crm-card overflow-hidden">
        <div className="md:hidden p-3 space-y-3">
          {clients.length === 0
            ? <div className="text-center py-10 text-gray-400">Клиенты не найдены</div>
            : clients.map(c => {
              const payStatus = c.payment_type === 'full'
                ? (c.full_payment?.is_paid ? <span className="text-green-600 text-xs inline-flex items-center gap-1"><CheckCircle size={12} /> Оплачено</span> : <span className="text-red-500 text-xs inline-flex items-center gap-1"><Clock size={12} /> Не оплачено</span>)
                : (c.installment_plan && Number(c.installment_plan.remaining) <= 0 ? <span className="text-green-600 text-xs inline-flex items-center gap-1"><CheckCircle size={12} /> Закрыта</span> : <span className="text-orange-500 text-xs inline-flex items-center gap-1"><Clock size={12} /> Остаток {fmtMoney(c.installment_plan?.remaining || 0)}</span>)
              return (
                <div key={c.id} className="rounded-2xl border border-slate-200 p-4 bg-white">
                  <div className="flex justify-between items-start gap-2">
                    <p className="font-semibold text-slate-900 break-words">{c.full_name}</p>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-600 space-y-1">
                    <p>{c.phone}</p>
                    <p className="inline-flex items-center gap-1">
                      {c.training_format === 'online' ? <Globe size={14} /> : <Dumbbell size={14} />}
                      {c.group_type}
                    </p>
                    <p>Поток: {c.group ? `#${c.group.number}` : '—'}</p>
                    <p>Регистрация: {fmtDate(c.registered_at)}</p>
                    <p>Менеджер: {c.registered_by_name || '—'}</p>
                    {c.is_repeat && <p className="text-xs text-slate-500 inline-flex items-center gap-1"><RotateCcw size={12} /> Повторный</p>}
                    <div>{payStatus}</div>
                  </div>
                  <div className="mt-3">
                    <Link to={`/admin/clients/${c.id}`} className="crm-link-action-primary">Открыть карточку</Link>
                  </div>
                </div>
              )
            })}
        </div>

        <div className="crm-table-wrap hidden md:block">
        <table className="crm-table min-w-[1080px]">
          <thead>
            <tr>
              <th>Клиент</th>
              <th>Телефон</th>
              <th>Формат</th>
              <th>Поток</th>
              <th>Оплата</th>
              <th>Дата рег.</th>
              <th>Менеджер</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0
              ? <tr><td colSpan={9} className="text-center py-10 text-gray-400">Клиенты не найдены</td></tr>
              : clients.map(c => {
                const payStatus = c.payment_type === 'full'
                  ? (c.full_payment?.is_paid ? <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle size={12} /> Оплачено</span> : <span className="text-red-500 text-xs flex items-center gap-1"><Clock size={12} /> Не оплачено</span>)
                  : (c.installment_plan && Number(c.installment_plan.remaining) <= 0 ? <span className="text-green-600 text-xs flex items-center gap-1"><CheckCircle size={12} /> Закрыта</span> : <span className="text-orange-500 text-xs flex items-center gap-1"><Clock size={12} /> {fmtMoney(c.installment_plan?.remaining || 0)} остаток</span>)
                return (
                  <tr key={c.id}>
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-800">{c.full_name}</p>
                      {c.is_repeat && <p className="text-xs text-gray-400 flex items-center gap-1"><RotateCcw size={12} /> Повторный</p>}
                    </td>
                    <td className="px-5 py-4 text-gray-600">{c.phone}</td>
                    <td className="px-5 py-4 text-gray-600">
                      <span className="inline-flex items-center gap-1">
                        {c.training_format === 'online' ? <Globe size={14} /> : <Dumbbell size={14} />}
                        {c.group_type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-600">{c.group ? `Поток #${c.group.number}` : '—'}</td>
                    <td className="px-5 py-4">{payStatus}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{fmtDate(c.registered_at)}</td>
                    <td className="px-5 py-4 text-gray-500 text-xs">{c.registered_by_name || '—'}</td>
                    <td className="px-5 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                    <td className="px-5 py-4"><Link to={`/admin/clients/${c.id}`} className="crm-link-action-primary">Открыть</Link></td>
                  </tr>
                )
              })}
          </tbody>
        </table>
        </div>
      </div>
      {totalPages > 1 && (
        <div className="flex justify-between items-center mt-4">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page <= 1} className="crm-link-action-primary disabled:text-gray-300">← Назад</button>
          <span className="text-sm text-gray-500">{count} клиентов · стр. {page}/{totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages} className="crm-link-action-primary disabled:text-gray-300">Вперёд →</button>
        </div>
      )}
    </AdminLayout>
  )
}
