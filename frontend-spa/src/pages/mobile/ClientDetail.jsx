import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'
import { Globe, Dumbbell, CreditCard, CheckCircle, Clock, Receipt, ArrowLeft, AlertCircle } from 'lucide-react'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney } from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'

export default function MobileClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useOutletContext()
  useRefresh(null)
  const [client, setClient] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [planId, setPlanId] = useState(null)
  const [receipt, setReceipt] = useState(null)
  const [fullAmount, setFullAmount] = useState('')
  const [repeatLoading, setRepeatLoading] = useState(false)
  const [newPassword, setNewPassword] = useState(null)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)

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

  const setRepeat = async (isRepeat) => {
    if (!client) return
    const prev = client.is_repeat
    setClient(c => c ? { ...c, is_repeat: isRepeat } : c)
    setRepeatLoading(true)
    try {
      await api.patch(`/clients/${id}/`, { is_repeat: isRepeat, discount: '0' })
      load()
    } catch (e) {
      setClient(c => c ? { ...c, is_repeat: prev } : c)
      console.error(e)
    } finally {
      setRepeatLoading(false)
    }
  }

  const resetCabinetPassword = async () => {
    setResetPasswordLoading(true)
    setNewPassword(null)
    try {
      const r = await api.post(`/clients/${id}/reset_cabinet_password/`)
      setNewPassword(r.data.password)
    } catch (e) {
      console.error(e)
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
        <Link to="/mobile/clients" className="inline-flex items-center gap-2 text-sm text-blue-600 font-medium touch-manipulation min-h-[44px] -mb-1">
          <ArrowLeft size={18} /> К списку клиентов
        </Link>
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{client.full_name}</h2>
              <p className="text-sm text-gray-500 mt-1">{client.phone}</p>
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                {client.training_format === 'online' ? <Globe size={12} /> : <Dumbbell size={12} />}
                {client.training_format === 'online' ? 'Онлайн' : 'Оффлайн'} · {client.group_type}
              </p>
              {client.bonus_balance != null && Number(client.bonus_balance) > 0 && (
                <p className="text-sm text-green-600 mt-1">Бонусы: {fmtMoney(client.bonus_balance)}</p>
              )}
              {client.cabinet_username && (
                <p className="text-xs text-gray-400 mt-1 break-all">Логин кабинета: <span className="font-mono">{client.cabinet_username}</span></p>
              )}
              {newPassword && (
                <p className="text-sm text-green-700 mt-1 break-all">Новый пароль: <span className="font-mono bg-green-100 px-1 rounded">{newPassword}</span></p>
              )}
              {client.cabinet_username && (
                <p className="text-xs text-gray-500 mt-2">Вход в кабинет: <a href="/cabinet" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">/cabinet</a></p>
              )}
              {client.cabinet_username && (
                <button type="button" onClick={resetCabinetPassword} disabled={resetPasswordLoading}
                  className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-60">
                  {resetPasswordLoading ? 'Создаём...' : 'Сбросить пароль (получить новый)'}
                </button>
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
                  <div className="flex justify-between text-sm"><span className="text-gray-500">Сумма</span><span className="font-medium">{fmtMoney(full.amount)}</span></div>
                  <div className="flex justify-between text-sm items-center"><span className="text-gray-500">Статус</span><span className="text-green-600 font-medium flex items-center gap-1"><CheckCircle size={14} /> Оплачено</span></div>
                  {full.receipt && <a href={full.receipt} target="_blank" rel="noreferrer" className="text-blue-500 text-sm block">Открыть чек →</a>}
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
          {client.payment_type === 'installment' && plan && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Общая стоимость</span><span className="font-medium">{fmtMoney(plan.total_cost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Оплачено</span><span className="font-medium text-green-600">{fmtMoney(plan.total_paid)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Остаток</span><span className="font-medium text-red-500">{fmtMoney(plan.remaining)}</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-right">{pct}% оплачено</p>
              <div className="flex justify-between"><span className="text-gray-500">Дедлайн</span><span>{plan.deadline}</span></div>
              {plan.payments?.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-gray-500 mb-1">История платежей:</p>
                  {plan.payments.map(p => (
                    <div key={p.id} className="flex justify-between items-center text-xs py-1 border-b border-gray-50 gap-3">
                      <span>{p.paid_at}</span>
                      <span className="font-medium">{fmtMoney(p.amount)}</span>
                      {p.receipt && (
                        <a href={p.receipt} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700">Чек</a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
                  <span className="font-medium break-words">{r.label} — {fmtMoney(r.amount)}</span>
                  {r.receipt ? (
                    <a href={r.receipt} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 font-medium">Открыть чек →</a>
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
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h3 className="font-medium text-gray-700 mb-3">Повторный клиент</h3>
          <p className="text-sm text-gray-500 mb-3">Отметьте, если клиент повторный — ему начислится бонус на баланс.</p>
          <button
            type="button"
            disabled={repeatLoading}
            onClick={() => setRepeat(!client.is_repeat)}
            className="w-full flex items-center gap-3 py-3 px-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 active:bg-blue-100 cursor-pointer select-none transition text-left disabled:opacity-60"
          >
            <input type="checkbox" checked={!!client.is_repeat} readOnly tabIndex={-1}
              className="rounded w-5 h-5 pointer-events-none" />
            <span className="text-sm font-medium">Клиент повторный</span>
            {repeatLoading && <span className="text-xs text-gray-400">Сохранение...</span>}
          </button>
        </div>
      </div>
    </MobileLayout>
  )
}
