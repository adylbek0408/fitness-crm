import { useState, useEffect } from 'react'
import { useParams, Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { KeyRound, Globe, Dumbbell, CreditCard, CheckCircle, Clock, Receipt } from 'lucide-react'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, GROUP_TYPE_LABEL, toAbsoluteUrl } from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'

function BonusBalanceForm({ clientId, currentBalance, onSuccess }) {
  const [value, setValue] = useState(currentBalance != null ? String(currentBalance) : '0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setValue(currentBalance != null ? String(currentBalance) : '0'), [currentBalance])
  const submit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await api.patch(`/clients/${clientId}/`, { bonus_balance: value })
      onSuccess()
    } catch (e) {
      setError(e.response?.data?.bonus_balance?.[0] || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }
  return (
    <form onSubmit={submit} className="flex gap-2 items-end flex-wrap">
      <div className="min-w-0">
        <label className="block text-xs text-gray-500 mb-1">Сумма (сом)</label>
        <input type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-full sm:w-32" />
      </div>
      <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-xl hover:bg-blue-700 disabled:opacity-60">Сохранить</button>
      {error && <span className="text-red-500 text-sm">{error}</span>}
    </form>
  )
}

export default function ClientDetail() {
  const { id } = useParams()
  const { user } = useOutletContext()
  const [client, setClient] = useState(null)
  const [planId, setPlanId] = useState(null)
  const [repeatLoading, setRepeatLoading] = useState(false)
  const [newPassword, setNewPassword] = useState(null)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)

  const load = async () => {
    const r = await api.get(`/clients/${id}/`)
    setClient(r.data)
    if (r.data.installment_plan) setPlanId(r.data.installment_plan.id)
  }

  useEffect(() => { load() }, [id])
  useEffect(() => setNewPassword(null), [id])

  const changeStatus = async (newStatus) => {
    await api.post(`/clients/${id}/change_status/`, { status: newStatus })
    load()
  }

  const setRepeat = async (isRepeat) => {
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

  if (!client) return <AdminLayout user={user}><div className="text-center py-20 text-gray-400">Загрузка...</div></AdminLayout>

  const plan = client.installment_plan
  const full = client.full_payment

  // Все чеки клиента в одном списке (история)
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
    <AdminLayout user={user}>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link to="/admin/clients" className="text-gray-400 hover:text-gray-600 text-sm">← Назад</Link>
        <h2 className="text-2xl font-bold text-gray-800 break-words">{client.full_name}</h2>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[client.status]}`}>{STATUS_LABEL[client.status]}</span>
      </div>
      {/* Логин и пароль кабинета — всегда на виду */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 mb-5">
        <h3 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
          <KeyRound size={18} /> Данные для входа в кабинет клиента
        </h3>
        {client.cabinet_username ? (
          <div className="space-y-2 text-sm">
            <p className="break-all"><span className="text-gray-600">Логин:</span> <code className="bg-white px-2 py-1 rounded font-mono text-blue-800">{client.cabinet_username}</code></p>
            {newPassword && (
              <p className="break-all"><span className="text-gray-600">Новый пароль:</span> <code className="bg-green-100 px-2 py-1 rounded font-mono text-green-800">{newPassword}</code> <span className="text-gray-500 text-xs">— передайте клиенту, сохраните. Больше не показывается.</span></p>
            )}
            {!newPassword && (
              <p className="text-gray-600">Пароль выдаётся при регистрации или по кнопке ниже. Вход: <a href="/cabinet" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">/cabinet</a></p>
            )}
            <button type="button" onClick={resetCabinetPassword} disabled={resetPasswordLoading}
              className="mt-2 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-60">
              {resetPasswordLoading ? 'Создаём...' : 'Сбросить пароль (получить новый)'}
            </button>
          </div>
        ) : (
          <p className="text-sm text-gray-700">У этого клиента кабинет не создан (запись создана до обновления). Логин и пароль создаются при регистрации нового клиента в разделе <strong>Регистрация</strong> и показываются сразу после создания.</p>
        )}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <div className="bg-white rounded-2xl p-5 shadow-sm border space-y-2 text-sm">
          <h3 className="font-medium text-gray-700 mb-3">Информация о клиенте</h3>
          {[['Телефон', client.phone], ['Формат', client.training_format], ['Тип группы', GROUP_TYPE_LABEL[client.group_type]], ['Поток', client.group ? `Поток #${client.group.number}` : '—'], ['Тренер', client.trainer?.full_name || '—'], ['Повторный', client.is_repeat ? 'Да' : 'Нет'], ['Дата регистрации', client.registered_at], ['Баланс бонусов', fmtMoney(client.bonus_balance ?? 0)]].map(([k, v]) => (
            <div key={k} className="flex justify-between items-center">
              <span className="text-gray-500">{k}</span>
              <span>{k === 'Формат' ? (v === 'online' ? <span className="flex items-center gap-1"><Globe size={14} /> Онлайн</span> : <span className="flex items-center gap-1"><Dumbbell size={14} /> Оффлайн</span>) : v}</span>
            </div>
          ))}
          {client.cabinet_username && (
            <div className="pt-2 border-t">
              <p className="text-xs text-gray-500">Вход в кабинет: <a href="/cabinet" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">/cabinet</a></p>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-gray-500">Зарегистрировал</span>
            <span className="font-medium text-blue-600">{client.registered_by_name || '—'}</span>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <CreditCard size={18} /> Оплата
          </h3>
          {client.payment_type === 'full' && full && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Сумма</span><span className="crm-money">{fmtMoney(full.amount)}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-500">Статус</span><span className={`flex items-center gap-1 ${full.is_paid ? 'text-green-600 font-medium' : 'text-red-500 font-medium'}`}>{full.is_paid ? <><CheckCircle size={14} /> Оплачено</> : <><Clock size={14} /> Не оплачено</>}</span></div>
              {full.receipt && <a href={toAbsoluteUrl(full.receipt)} target="_blank" rel="noreferrer" className="text-blue-500 text-xs block">Открыть чек →</a>}
            </div>
          )}
          {client.payment_type === 'installment' && plan && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Общая стоимость</span><span className="crm-money">{fmtMoney(plan.total_cost)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Оплачено</span><span className="crm-money text-green-600">{fmtMoney(plan.total_paid)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Остаток</span><span className={`crm-money ${Number(plan.remaining) > 0 ? 'text-red-500' : 'text-green-600'}`}>{fmtMoney(plan.remaining)}</span></div>
              <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${Math.min(plan.total_cost > 0 ? (Number(plan.total_paid) / Number(plan.total_cost)) * 100 : 0, 100)}%` }} />
              </div>
              <div className="flex justify-between"><span className="text-gray-500">Дедлайн</span><span>{plan.deadline}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-500">Статус</span><span className={`flex items-center gap-1 ${Number(plan.remaining) <= 0 ? 'text-green-600 font-medium' : 'text-orange-500 font-medium'}`}>{Number(plan.remaining) <= 0 ? <><CheckCircle size={14} /> Закрыта</> : <><Clock size={14} /> Частичная (остаток — можно добавить платёж ниже)</>}</span></div>
              {plan.payments?.length > 0 && (
                <div className="pt-2 border-t">
                  <p className="text-gray-500 mb-1">История платежей:</p>
                  {plan.payments.map(p => (
                    <div key={p.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center text-xs py-1 border-b border-gray-50 gap-2">
                      <span>{p.paid_at}</span>
                      <span className="crm-money">{fmtMoney(p.amount)}</span>
                      {p.receipt && (
                        <a
                          href={toAbsoluteUrl(p.receipt)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-500 hover:text-blue-700"
                        >
                          Чек
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
      {allReceipts.length > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border mb-5">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <Receipt size={18} /> История чеков
          </h3>
          <p className="text-sm text-gray-500 mb-3">Все чеки этого клиента — открывайте по ссылке.</p>
          <div className="space-y-2">
            {allReceipts.map((r, i) => (
              <div key={`receipt-${r.id}-${i}`} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-gray-50 rounded-xl text-sm gap-2">
                <span className="text-gray-600">{r.date}</span>
                <span className="crm-money break-words">{r.label} — {fmtMoney(r.amount)}</span>
                {r.receipt ? (
                  <a
                    href={toAbsoluteUrl(r.receipt)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Открыть чек →
                  </a>
                ) : (
                  <span className="text-gray-400 text-xs">Чек не прикреплён</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {client.payment_type === 'installment' && plan && Number(plan.remaining) > 0 && (
        <div className="bg-white rounded-2xl p-5 shadow-sm border mb-5">
          <h3 className="font-medium text-gray-700 mb-3">Добавить платёж</h3>
          <p className="text-sm text-gray-500 mb-3">Остаток к оплате: {fmtMoney(plan.remaining)}. Добавьте платёж ниже.</p>
          <AddPaymentForm planId={planId} onSuccess={load} />
        </div>
      )}
      <div className="bg-white rounded-2xl p-5 shadow-sm border">
        <h3 className="font-medium text-gray-700 mb-3">Изменить статус</h3>
        <div className="flex gap-3 flex-wrap">
          {['active', 'completed', 'expelled'].map(s => (
            <button key={s} type="button" onClick={() => changeStatus(s)} disabled={client.status === s}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${client.status === s ? 'opacity-40 cursor-not-allowed bg-gray-100 text-gray-500' : `${STATUS_BADGE[s]} hover:opacity-80 cursor-pointer`}`}>
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border mt-5">
        <h3 className="font-medium text-gray-700 mb-3">Повторный клиент</h3>
        <p className="text-sm text-gray-500 mb-3">Отметьте клиента как повторного — ему будет начислен бонус на баланс (сумма в настройках).</p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => !repeatLoading && setRepeat(!client.is_repeat)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !repeatLoading && setRepeat(!client.is_repeat) } }}
          className="flex items-center gap-3 py-3 px-4 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 cursor-pointer select-none transition"
        >
          <input type="checkbox" checked={!!client.is_repeat} readOnly tabIndex={-1}
            className="rounded w-5 h-5 pointer-events-none" />
          <span className="text-sm font-medium">Клиент повторный</span>
          {repeatLoading && <span className="text-xs text-gray-400">Сохранение...</span>}
        </div>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-sm border mt-5">
        <h3 className="font-medium text-gray-700 mb-3">Баланс бонусов</h3>
        <p className="text-sm text-gray-500 mb-3">Текущий баланс: <strong>{fmtMoney(client.bonus_balance ?? 0)}</strong>. Админ может изменить сумму ниже.</p>
        <BonusBalanceForm clientId={id} currentBalance={client.bonus_balance} onSuccess={load} />
      </div>
    </AdminLayout>
  )
}
