import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useOutletContext, useLocation } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'
import { Globe, Dumbbell, CreditCard, CheckCircle, Clock, Receipt, ArrowLeft, AlertCircle, ChevronDown } from 'lucide-react'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, toAbsoluteUrl } from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'

export default function MobileClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useOutletContext()
  useRefresh(null)
  const [client, setClient] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [planId, setPlanId] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [fullAmount, setFullAmount] = useState('')
  const [newPassword, setNewPassword] = useState(null)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)

  const load = async () => {
    setLoadError(null)
    try {
      const r = await api.get(`/clients/${id}/`)
      setClient(r.data)
      if (r.data.installment_plan) setPlanId(r.data.installment_plan.id)
    } catch (e) {
      setClient(null)
      const status = e.response?.status
      const msg = status === 404 ? 'Клиент не найден' : (e.response?.data?.detail || e.message || 'Ошибка загрузки')
      setLoadError(msg)
    }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => setNewPassword(null), [id])

  const STATUS_OPTIONS = [
    { value: 'active',    label: 'Активный',  dot: 'bg-emerald-500' },
    { value: 'frozen',    label: 'Заморозка', dot: 'bg-blue-500'    },
    { value: 'completed', label: 'Завершил',  dot: 'bg-slate-400'   },
    { value: 'expelled',  label: 'Отчислен',  dot: 'bg-red-500'     },
  ]

  const changeStatus = async (newStatus) => {
    if (newStatus === client.status) { setStatusMenuOpen(false); return }
    setStatusLoading(true); setStatusMenuOpen(false)
    try {
      await api.post(`/clients/${id}/change_status/`, { status: newStatus })
      setClient(c => ({ ...c, status: newStatus }))
    } catch (e) {
      alert(e.response?.data?.detail || 'Ошибка смены статуса')
    } finally { setStatusLoading(false) }
  }

  const [resetError, setResetError] = useState('')

  const resetCabinetPassword = async () => {
    setResetPasswordLoading(true)
    setNewPassword(null)
    setResetError('')
    try {
      const r = await api.post(`/clients/${id}/reset_cabinet_password/`)
      setNewPassword(r.data.password)
      load() // обновить password_plain
    } catch (e) {
      setResetError(e.response?.data?.detail || e.message || 'Ошибка сброса')
    } finally {
      setResetPasswordLoading(false)
    }
  }

  const uploadReceipt = async e => {
    e.preventDefault()
    if (!receipt) return
    const fd = new FormData()
    fd.append('receipt', receipt)
    if (fullAmount && Number(fullAmount) > 0) fd.append('amount', fullAmount)
    await api.post(`/payments/full/${id}/receipt/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    setReceipt(null)
    setFullAmount('')
    load()
  }

  if (loadError) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <AlertCircle className="text-red-500 mb-4" size={48} />
          <p className="text-gray-700 font-medium mb-1">Не удалось загрузить карточку</p>
          <p className="text-sm text-gray-500 mb-6">{loadError}</p>
          <div className="flex gap-3">
            <button type="button" onClick={() => navigate('/mobile/clients')}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white text-sm font-medium touch-manipulation min-h-[44px]">
              <ArrowLeft size={18} /> К списку
            </button>
            <button type="button" onClick={load}
              className="px-4 py-3 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium touch-manipulation min-h-[44px]">
              Повторить
            </button>
          </div>
        </div>
      </MobileLayout>
    )
  }

  if (!client) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
          <p>Загрузка...</p>
        </div>
      </MobileLayout>
    )
  }

  const plan = client.installment_plan
  const full = client.full_payment
  const pct = plan && Number(plan.total_cost) > 0 ? Math.min(Math.round((Number(plan.total_paid) / Number(plan.total_cost)) * 100), 100) : 0
  const justCreatedCreds = location.state?.cabinet

  const allReceipts = []
  if (client.payment_type === 'full' && full?.receipt) {
    allReceipts.push({ id: full.id, date: full.paid_at || client.registered_at, amount: full.amount, label: 'Полная оплата', receipt: full.receipt })
  }
  if (client.payment_type === 'installment' && plan?.payments?.length) {
    plan.payments.forEach((p, i) => {
      allReceipts.push({
        id: p.id,
        date: p.paid_at,
        amount: p.amount,
        label: `Платёж ${i + 1}`,
        receipt: p.receipt || null
      })
    })
  }

  return (
    <MobileLayout>
      <div className="space-y-4">
        {justCreatedCreds && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-emerald-800 font-semibold text-[15px]">Клиент успешно создан</p>
            <p className="text-emerald-700 text-sm mt-1">Данные для входа в кабинет клиента:</p>
            <p className="text-emerald-700 text-sm mt-1 break-all">Логин: <span className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded">{justCreatedCreds.login}</span></p>
            <p className="text-emerald-700 text-sm mt-1 break-all">Пароль: <span className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded">{justCreatedCreds.password}</span></p>
          </div>
        )}

        <Link to="/mobile/clients" className="inline-flex items-center gap-2 text-sm text-blue-600 font-medium touch-manipulation min-h-[44px] -mb-1">
          <ArrowLeft size={18} /> К списку клиентов
        </Link>
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{client.full_name}</h2>
              <p className="text-sm text-gray-500 mt-1">{client.phone}</p>
              {/* Смена статуса */}
              <div className="relative mt-2" style={{ zIndex: 10 }}>
                <button
                  type="button"
                  onClick={() => setStatusMenuOpen(o => !o)}
                  disabled={statusLoading}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${STATUS_BADGE[client.status]} disabled:opacity-60`}
                >
                  {statusLoading
                    ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : STATUS_LABEL[client.status]
                  }
                  <ChevronDown size={11} />
                </button>
                {statusMenuOpen && (
                  <div className="absolute left-0 top-9 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[160px] animate-fade-in">
                    {STATUS_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => changeStatus(opt.value)}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition
                          ${opt.value === client.status ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-600 hover:bg-gray-50'}`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                {client.training_format === 'online' ? <Globe size={12} /> : <Dumbbell size={12} />}
                {client.training_format === 'online' ? 'Онлайн' : 'Оффлайн'} · {client.group_type}
              </p>
              {client.bonus_balance != null && Number(client.bonus_balance) > 0 && (
                <p className="text-sm text-green-600 mt-1">Бонусы: {fmtMoney(client.bonus_balance)}</p>
              )}
              {client.cabinet_username && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-400 break-all">Логин: <span className="font-mono font-bold">{client.cabinet_username}</span></p>
                  {(newPassword || client.cabinet_password) && (
                    <p className={`text-xs break-all ${newPassword ? 'text-green-700' : 'text-gray-400'}`}>
                      {newPassword ? 'Новый пароль: ' : 'Пароль: '}
                      <span className={`font-mono font-bold px-1 rounded ${newPassword ? 'bg-green-100' : 'bg-gray-100'}`}>
                        {newPassword || client.cabinet_password}
                      </span>
                    </p>
                  )}
                  <p className="text-xs text-gray-500">Вход: <a href="/cabinet" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">/cabinet</a></p>
                  {resetError && <p className="text-xs text-red-500">{resetError}</p>}
                  <button type="button" onClick={resetCabinetPassword} disabled={resetPasswordLoading}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-60">
                    {resetPasswordLoading ? 'Создаём...' : 'Сбросить пароль'}
                  </button>
                </div>
              )}
            </div>
            <span className={`text-xs px-3 py-1 rounded-full ${STATUS_BADGE[client.status]}`}>{STATUS_LABEL[client.status]}</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <CreditCard size={18} /> Оплата
          </h3>
          {client.payment_type === 'full' && full && (
            <div className="space-y-3">
              {full.is_paid ? (
                <>
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Сумма</span><span className="crm-money">{fmtMoney(full.amount)}</span></div>
                  <div className="flex justify-between text-sm items-center"><span className="text-gray-500">Статус</span><span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle size={14} /> Оплачено</span></div>
                  {full.receipt && <a href={toAbsoluteUrl(full.receipt)} target="_blank" rel="noreferrer" className="text-blue-500 text-sm block">Открыть чек →</a>}
                </>
              ) : (
                <>
                  <div className="flex justify-between text-sm items-center"><span className="text-gray-500">Статус</span><span className="text-red-500 font-medium flex items-center gap-1"><Clock size={14} /> Не оплачено</span></div>
                  <div className="pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-600 mb-2">Укажите сумму и загрузите чек — платёж будет отмечен как оплаченный.</p>
                    <form onSubmit={uploadReceipt} className="space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Сумма (сом) *</label>
                        <input type="number" min="1" step="1" required value={fullAmount} onChange={e => setFullAmount(e.target.value)} placeholder="Введите сумму"
                          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Чек *</label>
                        <input type="file" accept="image/*" required onChange={e => setReceipt(e.target.files[0])}
                          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
                      </div>
                      <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl text-sm">Загрузить чек</button>
                    </form>
                  </div>
                </>
              )}
            </div>
          )}
          {client.payment_type === 'installment' && plan && (() => {
            const cost = Number(plan.total_cost)
            const paid = Number(plan.total_paid)
            const rem  = Number(plan.remaining)
            const isOverpaid = rem < 0
            const isDone     = rem <= 0
            return (
              <div className="space-y-3 text-sm">

                {/* Сводка */}
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Общая стоимость</span>
                    <span className="crm-money text-gray-800">{fmtMoney(plan.total_cost)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Оплачено</span>
                    <span className="crm-money text-green-600">{fmtMoney(plan.total_paid)}</span>
                  </div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                    {isOverpaid ? (
                      <>
                        <span className="text-gray-500">Переплата</span>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg text-xs font-semibold border border-amber-200">
                          +{fmtMoney(Math.abs(rem))} сверх нормы
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-gray-500">Остаток</span>
                        <span className={`crm-money ${isDone ? 'text-green-600' : 'text-red-500'}`}>
                          {isDone ? '—' : fmtMoney(rem)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Прогресс */}
                <div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${isOverpaid ? 'bg-amber-400' : isDone ? 'bg-green-500' : 'bg-blue-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">{pct}% оплачено</span>
                    {isOverpaid && <span className="text-xs text-amber-600 font-medium">Сверх стоимости</span>}
                    {isDone && !isOverpaid && <span className="text-xs text-green-600 font-medium">Полностью закрыто</span>}
                  </div>
                </div>

                {/* Дедлайн */}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-500">Дедлайн</span>
                  <span className="text-gray-700">{plan.deadline}</span>
                </div>

                {/* История платежей */}
                {plan.payments?.length > 0 && (
                  <div className="pt-1 border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">История платежей</p>
                    <div className="space-y-1">
                      {plan.payments.map((p, i) => (
                        <div key={p.id} className="flex justify-between items-center text-xs py-1.5 px-2 rounded-lg hover:bg-gray-50 gap-3">
                          <span className="text-gray-400 shrink-0">{p.paid_at}</span>
                          <span className="crm-money text-gray-700 flex-1 text-right">{fmtMoney(p.amount)}</span>
                          {p.receipt
                            ? <a href={toAbsoluteUrl(p.receipt)} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 shrink-0">Чек</a>
                            : <span className="text-gray-300 shrink-0">—</span>
                          }
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>
        {allReceipts.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
              <Receipt size={18} /> История чеков
            </h3>
            <div className="space-y-2">
              {allReceipts.map((r, i) => (
                <div key={`receipt-${r.id}-${i}`} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-gray-50 rounded-xl text-sm gap-2">
                  <span className="text-gray-600">{r.date}</span>
                  <span className="crm-money break-words">{r.label} — {fmtMoney(r.amount)}</span>
                  {r.receipt ? (
                    <a href={toAbsoluteUrl(r.receipt)} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 font-medium">Открыть чек →</a>
                  ) : (
                    <span className="text-gray-400 text-xs">Чек не прикреплён</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {client.payment_type === 'installment' && plan && Number(plan.remaining) > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-medium text-gray-700 mb-3">Добавить платёж</h3>
            <AddPaymentForm planId={planId} onSuccess={load} />
          </div>
        )}

      </div>
    </MobileLayout>
  )
}
