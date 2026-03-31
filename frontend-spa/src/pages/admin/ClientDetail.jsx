import { useState, useEffect } from 'react'
import { useParams, Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import {
  KeyRound, Globe, Dumbbell, CreditCard, CheckCircle,
  Clock, Receipt, Snowflake, ArrowLeft, Copy, Check,
  RotateCcw, User, Phone, Calendar, Layers, UserCircle, Gift,
  TrendingUp, TrendingDown, History, ChevronDown, ChevronUp, ChevronRight
} from 'lucide-react'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, GROUP_TYPE_LABEL, toAbsoluteUrl } from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'
import ConfirmFullPaymentForm from '../../components/payments/ConfirmFullPaymentForm'

const GROUP_TYPE_SHORT = { '1.5h': '1.5 ч', '2.5h': '2.5 ч' }

// ── Строка "Потоки" с разворачиваемой историей ───────────────────────────────
function StreamsInfoRow({ client, clientId }) {
  const [open, setOpen]         = useState(false)
  const [history, setHistory]   = useState([])
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState(null)

  const load = async () => {
    if (history.length > 0) return
    setLoading(true)
    try {
      const r = await api.get(`/clients/${clientId}/group-history/`)
      setHistory(r.data)
    } catch { } finally { setLoading(false) }
  }

  const toggle = () => { if (!open) load(); setOpen(v => !v) }

  return (
    <div className="border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-3 py-2.5 cursor-pointer group" onClick={toggle}>
        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
          <Layers size={14} className="text-slate-400" />
        </div>
        <span className="text-sm text-slate-500 flex-1">Потоки</span>
        <div className="flex items-center gap-2">
          {client.group
            ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Поток #{client.group.number}</span>
            : <span className="text-sm font-medium text-slate-400">—</span>
          }
          {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400 group-hover:text-indigo-400 transition" />}
        </div>
      </div>

      {open && (
        <div className="ml-11 mb-3 space-y-1.5">
          {loading ? (
            <div className="flex justify-center py-4">
              <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {client.group && (
                <div className="flex items-center justify-between p-2.5 bg-indigo-50 rounded-xl">
                  <span className="text-xs font-semibold text-indigo-700">
                    Поток #{client.group.number}
                    <span className="ml-1.5 font-normal text-indigo-400">{GROUP_TYPE_SHORT[client.group.group_type] || client.group.group_type}</span>
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-700 font-semibold">Текущий</span>
                </div>
              )}
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">Прошлых потоков нет</p>
              ) : history.map(h => (
                <div key={h.id}>
                  <div onClick={() => setSelected(s => s?.id === h.id ? null : h)}
                    className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl cursor-pointer hover:bg-slate-100 transition">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700">Поток #{h.group_number}</span>
                      <span className="text-xs text-slate-400">{GROUP_TYPE_SHORT[h.group_type] || h.group_type}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{h.ended_at}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-semibold ${h.payment_is_closed ? 'text-emerald-600' : 'text-red-500'}`}>
                        {h.payment_is_closed ? '✓ Оплачено' : '⚠ Долг'}
                      </span>
                      {selected?.id === h.id ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronRight size={12} className="text-slate-400" />}
                    </div>
                  </div>
                  {selected?.id === h.id && (
                    <div className="mx-2 mb-1 p-3 bg-white border border-slate-100 rounded-xl text-xs space-y-1.5">
                      {[
                        ['Тренер',      h.trainer_name || '—'],
                        ['Старт',       h.start_date || '—'],
                        ['Тип оплаты',  h.payment_type === 'full' ? 'Полная' : 'Рассрочка'],
                        ['Сумма курса', fmtMoney(h.payment_amount)],
                        ['Оплачено',    fmtMoney(h.payment_paid)],
                      ].map(([lbl, val]) => (
                        <div key={lbl} className="flex justify-between">
                          <span className="text-slate-400">{lbl}</span>
                          <span className="font-medium text-slate-700">{val}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Повторный клиент ──────────────────────────────────────────────────────────
function RepeatClientPanel({ client, clientId, onSuccess }) {
  const [groups,        setGroups]        = useState([])
  const [showForm,      setShowForm]      = useState(false)
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [statusFilter,  setStatusFilter]  = useState('recruitment')
  const [enrollGroup,   setEnrollGroup]   = useState(null)
  const [payType,       setPayType]       = useState('full')
  const [payAmount,     setPayAmount]     = useState('')
  const [totalCost,     setTotalCost]     = useState('')
  const [deadline,      setDeadline]      = useState('')
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [enrollMsg,     setEnrollMsg]     = useState('')
  const [enrollError,   setEnrollError]   = useState('')

  const loadGroups = async (status) => {
    setGroupsLoading(true); setEnrollGroup(null)
    try {
      const r = await api.get(`/groups/?status=${status}&page_size=100`)
      setGroups(r.data.results || [])
    } catch { } finally { setGroupsLoading(false) }
  }

  const handleShowForm = () => {
    if (!showForm) loadGroups(statusFilter)
    setShowForm(v => !v); setEnrollGroup(null); setEnrollMsg(''); setEnrollError('')
  }

  const switchFilter = (s) => { setStatusFilter(s); setEnrollGroup(null); loadGroups(s) }

  const handleEnroll = async () => {
    if (!enrollGroup) { setEnrollError('Выберите поток'); return }
    if (payType === 'full' && (!payAmount || Number(payAmount) <= 0)) { setEnrollError('Укажите сумму'); return }
    if (payType === 'installment' && (!totalCost || !deadline)) { setEnrollError('Укажите стоимость и дедлайн'); return }
    setEnrollLoading(true); setEnrollMsg(''); setEnrollError('')
    try {
      const r = await api.post(`/clients/${clientId}/re-enroll/`, {
        group_id: enrollGroup.id, payment_type: payType,
        payment_data: payType === 'full' ? { amount: payAmount } : { total_cost: totalCost, deadline }
      })
      setEnrollMsg(`Клиент записан в Поток #${enrollGroup.number}`)
      setShowForm(false); setEnrollGroup(null); setPayAmount(''); setTotalCost(''); setDeadline('')
      onSuccess()
    } catch(e) {
      setEnrollError(e.response?.data?.detail || JSON.stringify(e.response?.data) || 'Ошибка')
    } finally { setEnrollLoading(false) }
  }

  const DAY_LABELS = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' }
  const fmtSchedule = s => { if (!s) return '—'; const p = s.split(' '); return p[0].split(',').map(d => DAY_LABELS[d] || d).join(', ') + (p[1] ? ' · ' + p[1] : '') }

  const canReEnroll = !client.group && ['completed', 'expelled', 'frozen'].includes(client.status)
  if (!canReEnroll && !client.is_repeat) return null

  return (
    <div className="crm-card p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center"><RotateCcw size={15} className="text-indigo-600" /></div>
        <h3 className="font-bold text-slate-800">Повторный клиент</h3>
        {client.is_repeat && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">Повторный</span>}
      </div>

      {/* ✅ Бонус списывается ПРИ ЗАПИСИ */}
      {Number(client.bonus_balance) > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 mb-3 flex items-center gap-2">
          <Gift size={14} />
          На балансе <strong>{fmtMoney(client.bonus_balance)}</strong> бонусов — спишутся при записи в поток
        </div>
      )}

      {enrollMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 mb-4 flex items-center gap-2">
          <Check size={15} /> {enrollMsg}
        </div>
      )}

      {canReEnroll && (
        <div>
          <button onClick={handleShowForm} className="crm-btn-secondary w-full justify-center gap-2">
            <RotateCcw size={14} />{showForm ? 'Скрыть' : 'Записать в новый поток'}
          </button>

          {showForm && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-xs text-slate-400 font-medium mb-2">Шаг 1 — Выберите поток</p>
                <div className="flex gap-2 mb-3">
                  {[{ val: 'recruitment', label: 'Набор' }, { val: 'active', label: 'Активный' }].map(({ val, label }) => (
                    <button key={val} type="button" onClick={() => switchFilter(val)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition ${statusFilter === val ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
                {groupsLoading ? (
                  <div className="flex justify-center py-6"><span className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" /></div>
                ) : groups.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                    Нет потоков со статусом «{statusFilter === 'recruitment' ? 'Набор' : 'Активный'}»
                  </p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {groups.map(g => (
                      <div key={g.id} onClick={() => setEnrollGroup(enrollGroup?.id === g.id ? null : g)}
                        className={`cursor-pointer p-3 rounded-xl border-2 transition-all ${enrollGroup?.id === g.id ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-200 hover:border-indigo-200'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">Поток #{g.number}<span className="ml-2 text-xs font-normal text-slate-400">{GROUP_TYPE_LABEL[g.group_type] || g.group_type}</span></p>
                            <p className="text-xs text-slate-400 mt-0.5">{g.trainer?.full_name || '—'} · {fmtSchedule(g.schedule)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${g.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {g.status === 'active' ? 'Активный' : 'Набор'}
                            </span>
                            {enrollGroup?.id === g.id && <Check size={15} className="text-indigo-600" />}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {enrollGroup && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">Шаг 2 — Тип оплаты</p>
                  <div className="flex gap-2">
                    {[{ v: 'full', l: 'Полная оплата' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
                      <button key={v} type="button" onClick={() => setPayType(v)}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium border-2 transition-all ${payType === v ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-200'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {enrollGroup && payType === 'full' && (
                <div>
                  <p className="text-xs text-slate-400 font-medium mb-2">Шаг 3 — Сумма курса</p>
                  <input type="number" min="0" step="100" placeholder="Сумма (сом)" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="crm-input w-full" />
                </div>
              )}
              {enrollGroup && payType === 'installment' && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400 font-medium mb-2">Шаг 3 — Детали рассрочки</p>
                  <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)" value={totalCost} onChange={e => setTotalCost(e.target.value)} className="crm-input w-full" />
                  <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="crm-input w-full" />
                </div>
              )}

              {/* ✅ Превью бонуса — списывается при записи */}
              {enrollGroup && Number(client.bonus_balance) > 0 && (() => {
                const price = Number(payType === 'full' ? payAmount : totalCost)
                if (!price || price <= 0) return null
                const bonus = Math.min(Number(client.bonus_balance), price)
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5 text-sm">
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">
                      🎁 Бонус списывается при записи
                    </p>
                    <div className="flex justify-between"><span className="text-slate-500">Цена курса</span><span className="font-semibold crm-money">{fmtMoney(price)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Бонус</span><span className="font-semibold text-red-500 crm-money">- {fmtMoney(bonus)}</span></div>
                    <div className="h-px bg-amber-200" />
                    <div className="flex justify-between font-bold text-base">
                      <span className="text-slate-700">Клиент оплачивает</span>
                      <span className="text-emerald-600 crm-money">{fmtMoney(price - bonus)}</span>
                    </div>
                  </div>
                )
              })()}

              {enrollGroup && (
                <div className="pt-2">
                  {enrollError && <p className="text-red-500 text-sm mb-2">⚠️ {enrollError}</p>}
                  <button onClick={handleEnroll} disabled={enrollLoading} className="crm-btn-primary w-full justify-center disabled:opacity-60">
                    {enrollLoading ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check size={14} />}
                    Записать в Поток #{enrollGroup.number}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!canReEnroll && client.is_repeat && <p className="text-sm text-slate-400">Клиент уже записан в поток.</p>}
    </div>
  )
}

// ── Статусы ───────────────────────────────────────────────────────────────────
const STATUS_CONFIG = [
  { value: 'active',    label: 'Активный',  desc: 'Обучается',          icon: '✅', ring: 'ring-emerald-300', bg: 'bg-emerald-50' },
  { value: 'frozen',    label: 'Заморозка', desc: 'Временно заморожен', icon: '❄️', ring: 'ring-blue-300',    bg: 'bg-blue-50' },
  { value: 'completed', label: 'Завершил',  desc: 'Курс завершён',      icon: '🎓', ring: 'ring-slate-300',   bg: 'bg-slate-50' },
  { value: 'expelled',  label: 'Отчислен',  desc: 'Отчислен/возврат',   icon: '🚫', ring: 'ring-red-300',     bg: 'bg-red-50' },
]

// ── Бонусная панель ───────────────────────────────────────────────────────────
function BonusPanel({ clientId, currentBalance }) {
  const [history,        setHistory]        = useState([])
  const [showHistory,    setShowHistory]    = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadHistory = async () => {
    setHistoryLoading(true)
    try { const r = await api.get(`/bonuses/history/?client_id=${clientId}`); setHistory(r.data) }
    catch { } finally { setHistoryLoading(false) }
  }

  const toggleHistory = () => { if (!showHistory && history.length === 0) loadHistory(); setShowHistory(v => !v) }

  return (
    <div className="crm-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><Gift size={15} className="text-amber-600" /></div>
          <h3 className="font-bold text-slate-800">Бонусная система</h3>
        </div>
        <button onClick={toggleHistory} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition">
          <History size={13} />{showHistory ? 'Скрыть историю' : 'История'}
        </button>
      </div>
      <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl mb-3">
        <span className="text-sm text-slate-500">Бонусный баланс</span>
        <span className="font-bold text-amber-600 text-lg crm-money">{fmtMoney(currentBalance ?? 0)}</span>
      </div>
      <p className="text-xs text-slate-400 text-center">
        10% бонус начисляется после подтверждения оплаты · Бонус списывается при повторной записи
      </p>
      {showHistory && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">История операций</p>
          {historyLoading ? (
            <div className="flex justify-center py-4"><span className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" /></div>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-3">Операций пока нет</p>
          ) : (
            <div className="space-y-2">
              {history.map(tx => (
                <div key={tx.id} className={`flex items-start gap-3 p-3 rounded-xl text-sm ${tx.type === 'accrual' ? 'bg-emerald-50' : 'bg-red-50'}`}>
                  <div className="mt-0.5 shrink-0">{tx.type === 'accrual' ? <TrendingUp size={14} className="text-emerald-500" /> : <TrendingDown size={14} className="text-red-500" />}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{tx.created_at}</p>
                    <p className="text-slate-600 text-xs truncate">{tx.description}</p>
                  </div>
                  <span className={`font-bold crm-money shrink-0 ${tx.type === 'accrual' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {tx.type === 'accrual' ? '+' : '-'}{fmtMoney(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }) }
  return (
    <button onClick={copy} className="p-1 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-indigo-500">
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  )
}

function InfoRow({ icon: Icon, label, value, color }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0"><Icon size={14} className="text-slate-400" /></div>
      <span className="text-sm text-slate-500 flex-1">{label}</span>
      <span className={`text-sm font-medium ${color || 'text-slate-800'}`}>{value || '—'}</span>
    </div>
  )
}

// ── Главная страница ──────────────────────────────────────────────────────────
export default function ClientDetail() {
  const { id } = useParams()
  const { user } = useOutletContext()
  const [client, setClient] = useState(null)
  const [planId,  setPlanId]  = useState(null)
  const [newPassword, setNewPassword] = useState(null)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [resetError, setResetError] = useState('')
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
    try { await api.post(`/clients/${id}/change_status/`, { status: newStatus }); await load() }
    finally { setStatusLoading(false) }
  }

  const resetCabinetPassword = async () => {
    setResetPasswordLoading(true); setNewPassword(null); setResetError('')
    try { const r = await api.post(`/clients/${id}/reset_cabinet_password/`); setNewPassword(r.data.password); load() }
    catch (e) { setResetError(e.response?.data?.detail || e.message || 'Ошибка') }
    finally { setResetPasswordLoading(false) }
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
  if (client.payment_type === 'full' && full?.receipt)
    allReceipts.push({ id: full.id, date: full.paid_at || client.registered_at, amount: full.amount, label: 'Полная оплата', receipt: full.receipt })
  if (client.payment_type === 'installment' && plan?.payments?.length)
    plan.payments.forEach((p, i) => allReceipts.push({ id: p.id, date: p.paid_at, amount: p.amount, label: `Платёж ${i + 1}`, receipt: p.receipt || null }))

  const payProgress = plan
    ? Math.min(plan.total_cost > 0 ? (Number(plan.total_paid) / Number(plan.total_cost)) * 100 : 0, 100)
    : null

  return (
    <AdminLayout user={user}>
      <div className="flex items-start gap-4 mb-8 flex-wrap">
        <Link to="/admin/clients" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm transition mt-1">
          <ArrowLeft size={16} /> Назад
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="crm-page-title truncate">{client.full_name}</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${STATUS_BADGE[client.status]}`}>
              {client.status === 'frozen' && <Snowflake size={11} />}{STATUS_LABEL[client.status]}
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

      <div className="crm-card p-5 mb-5" style={{ background: 'linear-gradient(135deg, #eef2ff 0%, #f0f9ff 100%)', borderColor: '#c7d2fe' }}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center"><KeyRound size={15} className="text-indigo-600" /></div>
          <h3 className="font-bold text-indigo-900">Данные для входа в кабинет</h3>
        </div>
        {client.cabinet_username ? (
          <div className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-indigo-600/70">Логин:</span>
              <code className="bg-white px-2.5 py-1 rounded-lg font-mono text-indigo-800 border border-indigo-100 text-xs font-bold">{client.cabinet_username}</code>
              <CopyButton text={client.cabinet_username} />
            </div>
            {(newPassword || client.cabinet_password) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-indigo-600/70">{newPassword ? 'Новый пароль:' : 'Пароль:'}</span>
                <code className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border ${newPassword ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-white text-indigo-800 border-indigo-100'}`}>
                  {newPassword || client.cabinet_password}
                </code>
                <CopyButton text={newPassword || client.cabinet_password} />
                {newPassword && <span className="text-xs text-emerald-600 font-medium">✓ Пароль обновлён</span>}
              </div>
            )}
            <p className="text-indigo-600/70 text-xs">Вход: <a href="/cabinet" target="_blank" rel="noreferrer" className="underline hover:text-indigo-800">/cabinet</a></p>
            {resetError && <p className="text-red-500 text-xs">{resetError}</p>}
            <button onClick={resetCabinetPassword} disabled={resetPasswordLoading} className="crm-btn-primary text-xs py-2 disabled:opacity-60">
              {resetPasswordLoading ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <KeyRound size={13} />}
              Сбросить пароль
            </button>
          </div>
        ) : <p className="text-sm text-indigo-700/70">Кабинет не создан.</p>}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
        <div className="crm-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><User size={15} className="text-slate-500" /></div>
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
            <StreamsInfoRow client={client} clientId={id} />
            <InfoRow icon={UserCircle} label="Тренер" value={client.trainer?.full_name} />
            <InfoRow icon={Calendar} label="Дата регистрации" value={client.registered_at} />
            <InfoRow icon={Gift} label="Баланс бонусов" value={fmtMoney(client.bonus_balance ?? 0)} color="text-amber-600" />
            <div className="flex items-center gap-3 py-2.5">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0"><User size={14} className="text-slate-400" /></div>
              <span className="text-sm text-slate-500 flex-1">Зарегистрировал</span>
              <span className="text-sm font-semibold text-indigo-600">{client.registered_by_name || '—'}</span>
            </div>
          </div>
        </div>

        <div className="crm-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><CreditCard size={15} className="text-emerald-600" /></div>
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
              {!full.is_paid && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Подтвердить оплату</p>
                  <ConfirmFullPaymentForm clientId={id} amount={full.amount} onSuccess={load} />
                </div>
              )}
            </div>
          )}

          {client.payment_type === 'installment' && plan && (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"><span className="text-sm text-slate-500">Общая стоимость</span><span className="font-bold text-slate-900 crm-money">{fmtMoney(plan.total_cost)}</span></div>
              <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl"><span className="text-sm text-slate-500">Оплачено</span><span className="font-bold text-emerald-600 crm-money">{fmtMoney(plan.total_paid)}</span></div>
              <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl"><span className="text-sm text-slate-500">Остаток</span><span className={`font-bold crm-money ${Number(plan.remaining) > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{fmtMoney(plan.remaining)}</span></div>
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5"><span>Прогресс</span><span className="font-semibold text-slate-600">{Math.round(payProgress)}%</span></div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${payProgress >= 100 ? 'bg-emerald-500' : payProgress >= 60 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${payProgress}%` }} />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"><span className="text-sm text-slate-500">Дедлайн</span><span className="text-sm font-semibold text-slate-700">{plan.deadline}</span></div>
              {plan.payments?.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">История платежей</p>
                  {plan.payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 text-xs border-b border-slate-50 last:border-0">
                      <span className="text-slate-400">{p.paid_at}</span>
                      <span className="font-semibold text-slate-700 crm-money">{fmtMoney(p.amount)}</span>
                      {p.receipt && <a href={toAbsoluteUrl(p.receipt)} target="_blank" rel="noreferrer" className="text-indigo-500 hover:text-indigo-700 transition">Чек</a>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {allReceipts.length > 0 && (
        <div className="crm-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center"><Receipt size={15} className="text-slate-500" /></div>
            <h3 className="font-bold text-slate-800">История чеков</h3>
          </div>
          <div className="space-y-2">
            {allReceipts.map((r, i) => (
              <div key={`${r.id}-${i}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-slate-50 rounded-xl">
                <span className="text-xs text-slate-400">{r.date}</span>
                <span className="text-sm font-semibold text-slate-700 crm-money">{r.label} — {fmtMoney(r.amount)}</span>
                {r.receipt ? <a href={toAbsoluteUrl(r.receipt)} target="_blank" rel="noreferrer" className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold transition">Открыть чек →</a> : <span className="text-xs text-slate-300">Без чека</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {client.payment_type === 'installment' && plan && Number(plan.remaining) > 0 && (
        <div className="crm-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center"><CreditCard size={15} className="text-emerald-600" /></div>
            <h3 className="font-bold text-slate-800">Добавить платёж</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">Остаток: <strong className="text-red-500 crm-money">{fmtMoney(plan.remaining)}</strong></p>
          <AddPaymentForm planId={planId} onSuccess={load} />
        </div>
      )}

      <div className="crm-card p-5 mb-5">
        <h3 className="font-bold text-slate-800 mb-1">Изменить статус</h3>
        <p className="text-xs text-slate-400 mb-4">Нажмите на нужный статус чтобы применить</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {STATUS_CONFIG.map(s => {
            const isActive = client.status === s.value
            return (
              <button key={s.value} type="button" onClick={() => !isActive && changeStatus(s.value)} disabled={isActive || statusLoading}
                className={`flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border-2 text-sm font-medium transition-all duration-150 ${isActive ? `${s.bg} ${s.ring.replace('ring', 'border')} border-2 shadow-sm` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'} ${statusLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <span className="text-2xl">{s.icon}</span>
                <span className="font-semibold">{s.label}</span>
                <span className="text-xs opacity-60 font-normal text-center">{s.desc}</span>
                {isActive && <span className="text-xs font-bold text-current opacity-80">Текущий</span>}
              </button>
            )
          })}
        </div>
      </div>

      <RepeatClientPanel client={client} clientId={id} onSuccess={load} />
      <BonusPanel clientId={id} currentBalance={client.bonus_balance} />
    </AdminLayout>
  )
}
