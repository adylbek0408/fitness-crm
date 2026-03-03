import { useState, useEffect } from 'react'
import { useParams, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney } from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'

export default function MobileClientDetail() {
  const { id } = useParams()
  const { user } = useOutletContext()
  const [client, setClient] = useState(null)
  const [planId, setPlanId] = useState(null)
  const [receipt, setReceipt] = useState(null)

  const load = async () => {
    const r = await api.get(`/clients/${id}/`)
    setClient(r.data)
    if (r.data.installment_plan) setPlanId(r.data.installment_plan.id)
  }

  useEffect(() => { load() }, [id])

  const uploadReceipt = async e => {
    e.preventDefault()
    if (!receipt) return
    const fd = new FormData()
    fd.append('receipt', receipt)
    await api.post(`/payments/full/${id}/receipt/`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    load()
  }

  if (!client) return <MobileLayout><div className="text-center py-12 text-gray-400">Загрузка...</div></MobileLayout>

  const plan = client.installment_plan
  const full = client.full_payment
  const pct = plan && plan.total_cost > 0 ? Math.min(Math.round((plan.total_paid / plan.total_cost) * 100), 100) : 0

  return (
    <MobileLayout>
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{client.full_name}</h2>
              <p className="text-sm text-gray-500 mt-1">{client.phone}</p>
              <p className="text-xs text-gray-400 mt-1">{client.training_format === 'online' ? '🌐 Онлайн' : '🏋️ Оффлайн'} · {client.group_type}</p>
            </div>
            <span className={`text-xs px-3 py-1 rounded-full ${STATUS_BADGE[client.status]}`}>{STATUS_LABEL[client.status]}</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h3 className="font-medium text-gray-700 mb-3">💳 Оплата</h3>
          {client.payment_type === 'full' && full && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Сумма</span><span className="font-medium">{fmtMoney(full.amount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Статус</span><span className={full.is_paid ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{full.is_paid ? '✅ Оплачено' : '⏳ Не оплачено'}</span></div>
              {full.receipt && <a href={full.receipt} target="_blank" rel="noreferrer" className="text-blue-500 text-xs">Открыть чек →</a>}
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
                        <a
                          href={p.receipt}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                        >
                          Посмотреть чек
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {client.payment_type === 'installment' && plan && !plan.is_closed && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-medium text-gray-700 mb-3">Добавить платёж</h3>
            <AddPaymentForm planId={planId} onSuccess={load} />
          </div>
        )}
        {client.payment_type === 'full' && full && !full.is_paid && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-medium text-gray-700 mb-3">📎 Загрузить чек</h3>
            <form onSubmit={uploadReceipt} className="space-y-3">
              <input type="file" accept="image/*" required onChange={e => setReceipt(e.target.files[0])}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm" />
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 rounded-xl text-sm">Загрузить чек</button>
            </form>
          </div>
        )}
      </div>
    </MobileLayout>
  )
}
