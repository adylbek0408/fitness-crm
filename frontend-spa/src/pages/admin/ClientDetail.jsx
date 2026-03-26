import { useState, useEffect } from 'react'
import { useParams, Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import {
  KeyRound, Globe, Dumbbell, CreditCard, CheckCircle,
  Clock, Receipt, Snowflake, ArrowLeft, Copy, Check,
  RotateCcw, User, Phone, Calendar, Layers, UserCircle, Gift
} from 'lucide-react'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, GROUP_TYPE_LABEL, toAbsoluteUrl } from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'

const STATUS_CONFIG = [
  { value: 'active',    label: 'Активный',  desc: 'Обучается',          icon: '✅', ring: 'ring-emerald-300', bg: 'bg-emerald-50' },
  { value: 'frozen',    label: 'Заморозка', desc: 'Временно заморожен', icon: '❄️', ring: 'ring-blue-300',    bg: 'bg-blue-50' },
  { value: 'completed', label: 'Завершил',  desc: 'Курс завершён',      icon: '🎓', ring: 'ring-slate-300',   bg: 'bg-slate-50' },
  { value: 'expelled',  label: 'Отчислен',  desc: 'Отчислен/возврат',   icon: '🚫', ring: 'ring-red-300',     bg: 'bg-red-50' },
]

function BonusBalanceForm({ clientId, currentBalance, onSuccess }) {
  const [value, setValue] = useState(currentBalance != null ? String(currentBalance) : '0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setValue(currentBalance != null ? String(currentBalance) : '0'), [currentBalance])
  const submit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await api.patch(`/clients/${clientId}/`, { bonus_balance: value })
      onSuccess()
    } catch (e) { setError(e.response?.data?.bonus_balance?.[0] || 'Ошибка') }
    finally { setLoading(false) }
  }
  return (
    <form onSubmit={submit} className="flex gap-3 items-end flex-wrap">
      <div>
        <label className="block text-xs text-slate-500 mb-1.5 font-medium">Сумма (сом)</label>
        <input type="number" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)}
          className="crm-input w-36" />
      </div>
      <button type="submit" disabled={loading} className="crm-btn-primary disabled:opacity-60">
        {loading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check size={15} />}
        Сохранить
      </button>
      {error && <span className="text-red-500 text-sm">{error}</span>}
    </form>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <button onClick={copy} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-indigo-500">
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  )
}

function InfoRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon size={14} className="text-slate-400" />
      </div>
      <span className="text-sm text-slate-500 flex-1">{label}</span>
      <span className={`text-sm font-medium ${color || 'text-slate-800'}`}>{value || '—'}</span>
    </div>
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
  const [statusLoading, setStatusLoading] = useState(false)

  const load = async () => {
    const r = await api.get(`/clients/${id}/`)
    setClient(r.data)
    if (r.data.installment_plan) setPlanId(r.data.installment_plan.id)
  }

  useEffect(() => { load() }, [id])
  useEffect(() => setNewPassword(null), [id])

  const changeStatus = async (newStatus) => {
    if (statusLoading) return
    setStatusLoading(true)
    try {
      await api.post(`/clients/${id}/change_status/`, { status: newStatus })
      await load()
    } finally { setStatusLoading(false) }
  }

  const setRepeat = async (isRepeat) => {
    const prev = client.is_repeat
    setClient(c => c ? { ...c, is_repeat: isRepeat } : c)
    setRepeatLoading(true)
    try {
      await api.patch(`/clients/${id}/`, { is_repeat: isRepeat, discount: '0' })
      load()
    } catch { setClient(c => c ? { ...c, is_repeat: prev } : c) }
    finally { setRepeatLoading(false) }
  }

  const resetCabinetPassword = async () => {
    setResetPasswordLoading(true); setNewPassword(null)
    try {
      const r = await api.post(`/clients/${id}/reset_cabinet_password/`)
      setNewPassword(r.data.password)
    } finally { setResetPasswordLoading(false) }
  }

  if (!client) return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    </AdminLayout>
  )

  const plan = client.installment_plan
  const full = client.full_payment

  const allReceipts = []
  if (client.payment_type === 'full' && full?.receipt) {
    allReceipts.push({ id: full.id, date: full.paid_at || client.registered_at, amount: full.amount, label: 'Полная оплата', receipt: full.receipt })
  }
  if (client.payment_type === 'installment' && plan?.payments?.length) {
    plan.payments.forEach((p, i) => {
      allReceipts.push({ id: p.id, date: p.paid_at, amount: p.amount, label: `Платёж ${i + 1}`, receipt: p.receipt || null })
    })
  }

  const payProgress = plan
    ? Math.min(plan.total_cost > 0 ? (Number(plan.total_paid) / Number(plan.total_cost)) * 100 : 0, 100)
    : null

  return (
    <AdminLayout user={user}>
      {/* ── Заголовок ── */}
      <div className="flex items-start gap-4 mb-8 flex-wrap">
        <Link to="/admin/clients"
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm transition mt-1">
          <ArrowLeft size={16} /> Назад
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="crm-page-title truncate">{client.full_name}</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${STATUS_BADGE[client.status]}`}>
              {client.status === 'frozen' && <Snowflake size={11} />}
              {STATUS_LABEL[client.status]}
            </span>
            {client.is_repeat && (
              <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 flex items-center gap-1">
                <RotateCcw size={11} /> Повторный
              </span>
            )}
          </div>
          <p className="crm-page-subtitle">Карточка клиента</p>
        </div>
      </div>

      {/* ── Кабинет клиента ── */}
      <div className="crm-card p-5 mb-5"
        style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%)', borderColor: '#c7d2fe' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <KeyRound size={15} className="text-indigo-600" />
          </div>
          <h3 className="font-bold text-indigo-900">Данные для входа в кабинет</h3>
        </div>
        {client.cabinet_username ? (
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-indigo-600/70">Логин:</span>
              <code className="bg-white px-2.5 py-1 rounded-lg font-mono text-indigo-800 border border-indigo-100 text-xs font-bold">
                {client.cabinet_username}
              </code>
              <CopyButton text={client.cabinet_username} />
            </div>
            {newPassword ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-indigo-600/70">Новый пароль:</span>
                <code className="bg-emerald-100 px-2.5 py-1 rounded-lg font-mono text-emerald-800 border border-emerald-200 text-xs font-bold">
                  {newPassword}
                </code>
                <CopyButton text={newPassword} />
                <span className="text-xs text-slate-500">Передайте клиенту — больше не покажется</span>
              </div>
            ) : (
              <p className="text-indigo-600/70 text-xs">
                Вход: <a href="/cabinet" target="_blank" rel="noreferrer" className="underline hover:text-indigo-800">/cabinet</a>
              </p>
            )}
            <button onClick={resetCabinetPassword} disabled={resetPasswordLoading}
              className="crm-btn-primary text-xs py-2 disabled:opacity-60">
              {resetPasswordLoading
                ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <KeyRound size={13} />}
              Сбросить пароль
            </button>
          </div>
        ) : (
          <p className="text-sm text-indigo-700/70">Кабинет не создан. Создаётся при новой регистрации.</p>
        )}
      </div>

      {/* ── Основная инфо + оплата ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        {/* Инфо */}
        <div className="crm-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <User size={15} className="text-slate-500" />
            </div>
            <h3 className="font-bold text-slate-800">Информация о клиенте</h3>
          </div>
          <div>
            <InfoRow icon={Phone} label="Телефон" value={client.phone} />
            <InfoRow icon={Globe} label="Формат"
              value={client.training_format === 'online'
                ? <span className="flex items-center gap-1 text-blue-600"><Globe size={13} /> Онлайн</span>
                : <span className="flex items-center gap-1 text-violet-600"><Dumbbell size={13} /> Оффлайн</span>}
            />
            <InfoRow icon={Layers} label="Тип группы" value={GROUP_TYPE_LABEL[client.group_type]} />
            <InfoRow icon={Layers} label="Поток"
              value={client.group ? `Поток #${client.group.number}` : '—'} />
            <InfoRow icon={UserCircle} label="Тренер" value={client.trainer?.full_name} />
            <InfoRow icon={Calendar} label="Дата регистрации" value={client.registered_at} />
            <InfoRow icon={Gift} label="Баланс бонусов"
              value={fmtMoney(client.bonus_balance ?? 0)}
              color="text-amber-600" />
            <div className="flex items-center gap-3 py-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                <User size={14} className="text-slate-400" />
              </div>
              <span className="text-sm text-slate-500 flex-1">Зарегистрировал</span>
              <span className="text-sm font-semibold text-indigo-600">{client.registered_by_name || '—'}</span>
            </div>
          </div>
        </div>

        {/* Оплата */}
        <div className="crm-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CreditCard size={15} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-800">Оплата</h3>
          </div>

          {client.payment_type === 'full' && full && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm text-slate-500">Сумма</span>
                <span className="font-bold text-slate-900 crm-money">{fmtMoney(full.amount)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm text-slate-500">Статус</span>
                <span className={`flex items-center gap-1.5 text-sm font-semibold ${full.is_paid ? 'text-emerald-600' : 'text-red-500'}`}>
                  {full.is_paid ? <><CheckCircle size={14} /> Оплачено</> : <><Clock size={14} /> Не оплачено</>}
                </span>
              </div>
              {full.receipt && (
                <a href={toAbsoluteUrl(full.receipt)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-indigo-600 text-sm hover:text-indigo-800 transition">
                  <Receipt size={14} /> Открыть чек →
                </a>
              )}
            </div>
          )}

          {client.payment_type === 'installment' && plan && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm text-slate-500">Общая стоимость</span>
                <span className="font-bold text-slate-900 crm-money">{fmtMoney(plan.total_cost)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl">
                <span className="text-sm text-slate-500">Оплачено</span>
                <span className="font-bold text-emerald-600 crm-money">{fmtMoney(plan.total_paid)}</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                <span className="text-sm text-slate-500">Остаток</span>
                <span className={`font-bold crm-money ${Number(plan.remaining) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                  {fmtMoney(plan.remaining)}
                </span>
              </div>

              {/* Прогресс */}
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Прогресс оплаты</span>
                  <span className="font-semibold text-slate-600">{Math.round(payProgress)}%</span>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${
                    payProgress >= 100 ? 'bg-emerald-500' : payProgress >= 60 ? 'bg-amber-400' : 'bg-red-400'
                  }`} style={{ width: `${payProgress}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm text-slate-500">Дедлайн</span>
                <span className="text-sm font-semibold text-slate-700">{plan.deadline}</span>
              </div>

              {/* История платежей */}
              {plan.payments?.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">История платежей</p>
                  {plan.payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 text-xs border-b border-slate-50 last:border-0">
                      <span className="text-slate-400">{p.paid_at}</span>
                      <span className="font-semibold text-slate-700 crm-money">{fmtMoney(p.amount)}</span>
                      {p.receipt && (
                        <a href={toAbsoluteUrl(p.receipt)} target="_blank" rel="noreferrer"
                          className="text-indigo-500 hover:text-indigo-700 transition">Чек</a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Чеки ── */}
      {allReceipts.length > 0 && (
        <div className="crm-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
              <Receipt size={15} className="text-slate-500" />
            </div>
            <h3 className="font-bold text-slate-800">История чеков</h3>
          </div>
          <div className="space-y-2">
            {allReceipts.map((r, i) => (
              <div key={`${r.id}-${i}`}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-slate-50 rounded-xl">
                <span className="text-xs text-slate-400">{r.date}</span>
                <span className="text-sm font-semibold text-slate-700 crm-money">{r.label} — {fmtMoney(r.amount)}</span>
                {r.receipt
                  ? <a href={toAbsoluteUrl(r.receipt)} target="_blank" rel="noreferrer"
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold transition">Открыть чек →</a>
                  : <span className="text-xs text-slate-300">Без чека</span>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Добавить платёж ── */}
      {client.payment_type === 'installment' && plan && Number(plan.remaining) > 0 && (
        <div className="crm-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CreditCard size={15} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-800">Добавить платёж</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">Остаток: <strong className="text-red-500 crm-money">{fmtMoney(plan.remaining)}</strong></p>
          <AddPaymentForm planId={planId} onSuccess={load} />
        </div>
      )}

      {/* ── Изменить статус ── */}
      <div className="crm-card p-5 mb-5">
        <h3 className="font-bold text-slate-800 mb-1">Изменить статус</h3>
        <p className="text-xs text-slate-400 mb-4">Нажмите на нужный статус чтобы применить</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATUS_CONFIG.map(s => {
            const isActive = client.status === s.value
            return (
              <button key={s.value} type="button"
                onClick={() => !isActive && changeStatus(s.value)}
                disabled={isActive || statusLoading}
                className={`flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border-2 text-sm font-medium transition-all duration-150
                  ${isActive
                    ? `${s.bg} ${s.ring.replace('ring', 'border')} border-2 shadow-sm`
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                  } ${statusLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <span className="text-2xl">{s.icon}</span>
                <span className="font-semibold">{s.label}</span>
                <span className="text-xs opacity-60 font-normal text-center">{s.desc}</span>
                {isActive && <span className="text-xs font-bold text-current opacity-80">● Текущий</span>}
              </button>
            )
          })}
        </div>
        {client.status === 'frozen' && (
          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
            <strong>❄️ Заморозка активна.</strong> При возврате средств переведите в статус <strong>«Отчислен»</strong>.
          </div>
        )}
      </div>

      {/* ── Повторный ── */}
      <div className="crm-card p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <RotateCcw size={15} className="text-indigo-600" />
          </div>
          <h3 className="font-bold text-slate-800">Повторный клиент</h3>
        </div>
        <p className="text-sm text-slate-500 mb-3">Повторным клиентам начисляется бонус на баланс.</p>
        <div role="button" tabIndex={0}
          onClick={() => !repeatLoading && setRepeat(!client.is_repeat)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !repeatLoading && setRepeat(!client.is_repeat) } }}
          className={`flex items-center gap-3 py-3.5 px-4 rounded-2xl border-2 cursor-pointer select-none transition-all duration-150
            ${client.is_repeat
              ? 'bg-indigo-50 border-indigo-300'
              : 'bg-white border-slate-200 hover:border-indigo-200 hover:bg-indigo-50/30'
            }`}>
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
            client.is_repeat ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300'
          }`}>
            {client.is_repeat && <Check size={12} className="text-white" strokeWidth={3} />}
          </div>
          <span className="text-sm font-semibold text-slate-800">Клиент повторный</span>
          {repeatLoading && (
            <span className="ml-auto">
              <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin block" />
            </span>
          )}
        </div>
      </div>

      {/* ── Баланс бонусов ── */}
      <div className="crm-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <Gift size={15} className="text-amber-600" />
          </div>
          <h3 className="font-bold text-slate-800">Баланс бонусов</h3>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Текущий баланс: <strong className="text-amber-600 crm-money">{fmtMoney(client.bonus_balance ?? 0)}</strong>
        </p>
        <BonusBalanceForm clientId={id} currentBalance={client.bonus_balance} onSuccess={load} />
      </div>
    </AdminLayout>
  )
}
