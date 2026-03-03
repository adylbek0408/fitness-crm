import { useState, useEffect } from 'react'
import { useParams, Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, GROUP_TYPE_LABEL } from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'

export default function ClientDetail() {
  const { id } = useParams()
  const { user } = useOutletContext()
  const [client, setClient] = useState(null)
  const [planId, setPlanId] = useState(null)

  const load = async () => {
    const r = await api.get(`/clients/${id}/`)
    setClient(r.data)
    if (r.data.installment_plan) setPlanId(r.data.installment_plan.id)
  }

  useEffect(() => { load() }, [id])

  const changeStatus = async (newStatus) => {
    await api.post(`/clients/${id}/change_status/`, { status: newStatus })
    load()
  }

  if (!client) return <AdminLayout user={user}><div className="text-center py-20 text-gray-400">Загрузка...</div></AdminLayout>

  const plan = client.installment_plan
  const full = client.full_payment

  return (
    <AdminLayout user={user}>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/admin/clients" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</Link>
        <h2 className="text-2xl font-bold text-gray-800">{client.full_name}</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[client.status]}`}>{STATUS_LABEL[client.status]}</span>
      </div>
      <div className="grid grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-2 text-sm">
          <h3 className="font-medium text-gray-700 mb-3">Информация о клиенте</h3>
          {[['Телефон', client.phone], ['Формат', client.training_format === 'online' ? '🌐 Онлайн' : '🏋️ Оффлайн'], ['Тип группы', GROUP_TYPE_LABEL[client.group_type]], ['Поток', client.group ? `Поток #${client.group.number}` : '—'], ['Тренер', client.trainer?.full_name || '—'], ['Повторный', client.is_repeat ? `Да (скидка ${client.discount}%)` : 'Нет'], ['Дата регистрации', client.registered_at]].map(([k,v]) => (
            <div key={k} className="flex justify-between"><span className="text-gray-500">{k}</span><span>{v}</span></div>
          ))}
          <div className="flex justify-between">
            <span className="text-gray-500">Зарегистрировал</span>
            <span className="font-medium text-blue-600">{client.registered_by_name || '—'}</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h3 className="font-medium text-gray-700 mb-3">💳 Оплата</h3>
          {client.payment_type === 'full' && full && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Сумма</span><span className="font-medium">{fmtMoney(full.amount)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Статус</span><span className={full.is_paid ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}>{full.is_paid ? '✅ Оплачено' : '⏳ Не оплачено'}</span></div>
              {full.receipt && <a href={full.receipt} target="_blank" rel="noreferrer" className="text-blue-500 text-xs block">Открыть чек →</a>}
            </div>
          )}
          {client.payment_type === 'installment' && plan && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Общая стоимость</span><span className="font-medium">{fmtMoney(plan.total_cost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Оплачено</span><span className="font-medium text-green-600">{fmtMoney(plan.total_paid)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Остаток</span><span className="font-medium text-red-500">{fmtMoney(plan.remaining)}</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(plan.total_cost > 0 ? (plan.total_paid / plan.total_cost) * 100 : 0, 100)}%` }} />
              </div>
              <div className="flex justify-between"><span className="text-gray-500">Дедлайн</span><span>{plan.deadline}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Статус</span><span className={plan.is_closed ? 'text-green-600 font-medium' : 'text-orange-500 font-medium'}>{plan.is_closed ? '✅ Закрыта' : '⏳ Частичная'}</span></div>
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
      </div>
      {client.payment_type === 'installment' && plan && !plan.is_closed && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border mb-5">
          <h3 className="font-medium text-gray-700 mb-3">Добавить платёж</h3>
          <AddPaymentForm planId={planId} onSuccess={load} />
        </div>
      )}
      <div className="bg-white rounded-2xl p-5 shadow-sm border">
        <h3 className="font-medium text-gray-700 mb-3">Изменить статус</h3>
        <div className="flex gap-3">
          {['active', 'completed', 'expelled'].map(s => (
            <button key={s} onClick={() => changeStatus(s)} disabled={client.status === s}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${client.status === s ? 'opacity-40 cursor-not-allowed bg-gray-100 text-gray-500' : `${STATUS_BADGE[s]} hover:opacity-80`}`}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </AdminLayout>
  )
}
