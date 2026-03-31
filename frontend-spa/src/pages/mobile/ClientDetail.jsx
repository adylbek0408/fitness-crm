import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useOutletContext, useLocation } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'
import {
  Globe, Dumbbell, CreditCard, CheckCircle, Clock, Receipt,
  ArrowLeft, AlertCircle, ChevronDown, ChevronUp, ChevronRight,
  RotateCcw, Gift, Check, Layers, X
} from 'lucide-react'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, GROUP_TYPE_LABEL, toAbsoluteUrl } from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'
import ConfirmFullPaymentForm from '../../components/payments/ConfirmFullPaymentForm'
import ConfirmModal from '../../components/ConfirmModal'

const GROUP_TYPE_SHORT = { '1.5h': '1.5 ч', '2.5h': '2.5 ч' }
const DAY_LABELS = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' }
const fmtSchedule = s => {
  if (!s) return '—'
  const p = s.split(' ')
  return p[0].split(',').map(d => DAY_LABELS[d] || d).join(', ') + (p[1] ? ' · ' + p[1] : '')
}

// ── Мобильная повторная запись ────────────────────────────────────────────────
function MobileRepeatPanel({ client, clientId, onSuccess }) {
  const [open,          setOpen]          = useState(false)
  const [groups,        setGroups]        = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [statusFilter,  setStatusFilter]  = useState('recruitment')
  const [step,          setStep]          = useState(1)
  const [enrollGroup,   setEnrollGroup]   = useState(null)
  const [payType,       setPayType]       = useState('full')
  const [payAmount,     setPayAmount]     = useState('')
  const [totalCost,     setTotalCost]     = useState('')
  const [deadline,      setDeadline]      = useState('')
  const [loading,       setLoading]       = useState(false)
  const [successMsg,    setSuccessMsg]    = useState('')
  const [error,         setError]         = useState('')

  const loadGroups = async (status) => {
    setGroupsLoading(true); setEnrollGroup(null)
    try {
      const r = await api.get(`/groups/?status=${status}&page_size=100`)
      setGroups(r.data.results || [])
    } catch { } finally { setGroupsLoading(false) }
  }

  const handleOpen = () => {
    setOpen(true); setStep(1); setEnrollGroup(null)
    setPayAmount(''); setTotalCost(''); setDeadline('')
    setError(''); setSuccessMsg(''); loadGroups(statusFilter)
  }

  const switchFilter = (s) => { setStatusFilter(s); loadGroups(s) }
  const handleSelectGroup = (g) => { setEnrollGroup(g); setStep(2); setPayType('full'); setError('') }

  const handleEnroll = async () => {
    if (payType === 'full' && (!payAmount || Number(payAmount) <= 0)) { setError('Введите сумму'); return }
    if (payType === 'installment' && (!totalCost || !deadline)) { setError('Укажите стоимость и дедлайн'); return }
    setLoading(true); setError('')
    try {
      await api.post(`/clients/${clientId}/re-enroll/`, {
        group_id: enrollGroup.id, payment_type: payType,
        payment_data: payType === 'full' ? { amount: payAmount } : { total_cost: totalCost, deadline }
      })
      setSuccessMsg(`Клиент записан в Поток #${enrollGroup.number}`)
      setOpen(false); setEnrollGroup(null); onSuccess()
    } catch(e) {
      setError(e.response?.data?.detail || 'Ошибка записи')
    } finally { setLoading(false) }
  }

  const canReEnroll = !client.group && ['completed', 'expelled', 'frozen'].includes(client.status)
  if (!canReEnroll) return null

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      {!open ? (
        <button type="button" onClick={handleOpen}
          className="w-full flex items-center justify-between p-4 text-left touch-manipulation">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#ede9fe' }}>
              <RotateCcw size={18} style={{ color: '#7c3aed' }} />
            </div>
            <div>
              <p className="font-semibold text-gray-800 text-sm">Повторная запись</p>
              <p className="text-xs text-gray-400">Записать в новый поток</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400" />
        </button>
      ) : (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">
              {step === 1 ? 'Выберите поток' : `Оплата — Поток #${enrollGroup?.number}`}
            </h3>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>

          {step === 1 && (
            <div>
              {Number(client.bonus_balance) > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl mb-3 text-sm" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                  <Gift size={14} style={{ color: '#d97706' }} />
                  <span style={{ color: '#92400e' }}>Бонус <strong>{fmtMoney(client.bonus_balance)}</strong> — спишется при оплате</span>
                </div>
              )}
              <div className="flex gap-2 mb-3">
                {[{ val: 'recruitment', label: 'Набор' }, { val: 'active', label: 'Активный' }].map(({ val, label }) => (
                  <button key={val} type="button" onClick={() => switchFilter(val)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                    style={statusFilter === val ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' } : { background: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }}>
                    {label}
                  </button>
                ))}
              </div>
              {groupsLoading ? (
                <div className="flex justify-center py-8"><span className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#be185d' }} /></div>
              ) : groups.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Нет потоков со статусом «{statusFilter === 'recruitment' ? 'Набор' : 'Активный'}»</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {groups.map(g => (
                    <button key={g.id} type="button" onClick={() => handleSelectGroup(g)}
                      className="w-full text-left p-3 rounded-xl border-2 transition touch-manipulation"
                      style={{ background: '#fafafa', borderColor: '#e5e7eb' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">Поток #{g.number}<span className="ml-2 text-xs font-normal text-gray-400">{GROUP_TYPE_LABEL[g.group_type] || g.group_type}</span></p>
                          <p className="text-xs text-gray-400 mt-0.5">{g.trainer?.full_name || '—'} · {fmtSchedule(g.schedule)}</p>
                        </div>
                        <ChevronRight size={16} className="text-gray-300 shrink-0" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 2 && enrollGroup && (
            <div className="space-y-4">
              <button type="button" onClick={() => setStep(1)} className="flex items-center gap-1.5 text-sm text-gray-400 touch-manipulation">
                <ArrowLeft size={15} /> Выбрать другой поток
              </button>
              <div className="p-3 rounded-xl text-sm" style={{ background: '#fce7f3' }}>
                <span className="font-semibold" style={{ color: '#be185d' }}>Поток #{enrollGroup.number}</span>
                <span className="ml-2 text-xs" style={{ color: '#9d174d' }}>{GROUP_TYPE_LABEL[enrollGroup.group_type]} · {enrollGroup.trainer?.full_name || '—'}</span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Тип оплаты</p>
                <div className="flex gap-2">
                  {[{ v: 'full', l: 'Полная' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setPayType(v)}
                      className="flex-1 py-3 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                      style={payType === v ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' } : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {payType === 'full' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Сумма курса</p>
                  <input type="number" min="0" step="100" placeholder="Сумма (сом)" value={payAmount} onChange={e => setPayAmount(e.target.value)} className="crm-mobile-input w-full" />
                </div>
              )}
              {payType === 'installment' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Детали рассрочки</p>
                  <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)" value={totalCost} onChange={e => setTotalCost(e.target.value)} className="crm-mobile-input w-full" />
                  <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="crm-mobile-input w-full" />
                </div>
              )}
              {Number(client.bonus_balance) > 0 && (() => {
                const price = Number(payType === 'full' ? payAmount : totalCost)
                if (!price || price <= 0) return null
                const bonus = Math.min(Number(client.bonus_balance), price)
                return (
                  <div className="p-3 rounded-xl text-sm space-y-1.5" style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#92400e' }}>Расчёт бонуса</p>
                    <div className="flex justify-between"><span className="text-gray-500">Полная цена</span><span className="font-semibold crm-money">{fmtMoney(price)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Бонус</span><span className="font-semibold text-red-500 crm-money">- {fmtMoney(bonus)}</span></div>
                    <div className="border-t border-yellow-200 pt-1.5 flex justify-between font-bold">
                      <span className="text-gray-700">К оплате</span><span className="text-green-600 crm-money">{fmtMoney(price - bonus)}</span>
                    </div>
                  </div>
                )
              })()}
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="button" onClick={handleEnroll} disabled={loading}
                className="w-full py-4 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
                style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
                {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                Записать в Поток #{enrollGroup.number}
              </button>
            </div>
          )}
        </div>
      )}
      {successMsg && (
        <div className="px-4 pb-4">
          <div className="p-3 rounded-xl text-sm" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <span className="flex items-center gap-1.5" style={{ color: '#15803d' }}><Check size={14} /> {successMsg}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Мобильная история потоков ─────────────────────────────────────────────────
function MobileStreamsHistory({ client, clientId }) {
  const [open,     setOpen]     = useState(false)
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(false)
  const [selected, setSelected] = useState(null)

  const load = async () => {
    if (history.length > 0) return
    setLoading(true)
    try { const r = await api.get(`/clients/${clientId}/group-history/`); setHistory(r.data) }
    catch { } finally { setLoading(false) }
  }

  const toggle = () => { if (!open) load(); setOpen(v => !v) }

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <button type="button" onClick={toggle} className="w-full flex items-center justify-between p-4 touch-manipulation">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#f3f4f6' }}>
            <Layers size={18} className="text-gray-500" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">Потоки</p>
            <p className="text-xs text-gray-400">{client.group ? `Текущий: Поток #${client.group.number}` : 'Нет активного потока'}</p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-4"><span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#be185d' }} /></div>
          ) : (
            <>
              {client.group && (
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#fce7f3' }}>
                  <span className="font-semibold text-sm" style={{ color: '#be185d' }}>
                    Поток #{client.group.number}
                    <span className="ml-1.5 font-normal text-xs" style={{ color: '#9d174d' }}>{GROUP_TYPE_SHORT[client.group.group_type] || client.group.group_type}</span>
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fce7f3', color: '#be185d', border: '1px solid #fca5a5' }}>Текущий</span>
                </div>
              )}
              {history.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">Прошлых потоков нет</p>
              ) : history.map(h => (
                <div key={h.id}>
                  <button type="button" onClick={() => setSelected(s => s?.id === h.id ? null : h)}
                    className="w-full flex items-center justify-between p-3 rounded-xl touch-manipulation" style={{ background: '#f9fafb' }}>
                    <div className="text-left">
                      <span className="font-semibold text-gray-700 text-sm">Поток #{h.group_number}</span>
                      <span className="ml-2 text-xs text-gray-400">{GROUP_TYPE_SHORT[h.group_type]}</span>
                      <span className="ml-2 text-xs text-gray-300">·</span>
                      <span className="ml-2 text-xs text-gray-400">{h.ended_at}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${h.payment_is_closed ? 'text-green-600' : 'text-red-500'}`}>{h.payment_is_closed ? <CheckCircle size={12} /> : <Clock size={12} />}</span>
                      {selected?.id === h.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>
                  {selected?.id === h.id && (
                    <div className="mx-2 p-3 rounded-xl text-xs space-y-1.5" style={{ background: '#fff', border: '1px solid #f3f4f6' }}>
                      {[
                        ['Тренер', h.trainer_name || '—'], ['Старт', h.start_date || '—'],
                        ['Тип оплаты', h.payment_type === 'full' ? 'Полная' : 'Рассрочка'],
                        ['Сумма курса', fmtMoney(h.payment_amount)], ['Оплачено', fmtMoney(h.payment_paid)],
                      ].map(([lbl, val]) => (
                        <div key={lbl} className="flex justify-between">
                          <span className="text-gray-400">{lbl}</span>
                          <span className="font-medium text-gray-700">{val}</span>
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

// ── Главный компонент ─────────────────────────────────────────────────────────
export default function MobileClientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useOutletContext()
  useRefresh(null)
  const [client, setClient] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [planId, setPlanId] = useState(null)
  const [newPassword, setNewPassword] = useState(null)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [resetError, setResetError] = useState('')
  const [statusConfirm, setStatusConfirm] = useState(null) // { newStatus, label }

  const load = async () => {
    setLoadError(null)
    try {
      const r = await api.get(`/clients/${id}/`)
      setClient(r.data)
      if (r.data.installment_plan) setPlanId(r.data.installment_plan.id)
    } catch (e) {
      setClient(null)
      const status = e.response?.status
      setLoadError(status === 404 ? 'Клиент не найден' : (e.response?.data?.detail || e.message || 'Ошибка загрузки'))
    }
  }

  useEffect(() => { load() }, [id])
  useEffect(() => setNewPassword(null), [id])

  const STATUS_OPTIONS = [
    { value: 'active',    label: 'Активный',  dot: 'bg-emerald-500' },
    { value: 'frozen',    label: 'Заморозка', dot: 'bg-blue-500' },
    { value: 'completed', label: 'Завершил',  dot: 'bg-slate-400' },
    { value: 'expelled',  label: 'Отчислен',  dot: 'bg-red-500' },
  ]

  const changeStatus = async (newStatus) => {
    if (newStatus === client.status) { setStatusMenuOpen(false); return }
    const labels = { active: 'Активный', frozen: 'Заморозка', completed: 'Завершил', expelled: 'Отчислен' }
    setStatusMenuOpen(false)
    setStatusConfirm({ newStatus, label: labels[newStatus] || newStatus })
  }

  const resetCabinetPassword = async () => {
    setResetPasswordLoading(true); setNewPassword(null); setResetError('')
    try { const r = await api.post(`/clients/${id}/reset_cabinet_password/`); setNewPassword(r.data.password); load() }
    catch (e) { setResetError(e.response?.data?.detail || e.message || 'Ошибка сброса') }
    finally { setResetPasswordLoading(false) }
  }

  if (loadError) return (
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

  if (!client) return (
    <MobileLayout>
      <div className="flex flex-col items-center justify-center py-12 text-gray-400">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p>Загрузка...</p>
      </div>
    </MobileLayout>
  )

  const plan = client.installment_plan
  const full = client.full_payment
  const pct = plan && Number(plan.total_cost) > 0 ? Math.min(Math.round((Number(plan.total_paid) / Number(plan.total_cost)) * 100), 100) : 0
  const justCreatedCreds = location.state?.cabinet

  const allReceipts = []
  if (client.payment_type === 'full' && full?.receipt)
    allReceipts.push({ id: full.id, date: full.paid_at || client.registered_at, amount: full.amount, label: 'Полная оплата', receipt: full.receipt })
  if (client.payment_type === 'installment' && plan?.payments?.length)
    plan.payments.forEach((p, i) => allReceipts.push({ id: p.id, date: p.paid_at, amount: p.amount, label: `Платёж ${i + 1}`, receipt: p.receipt || null }))

  return (
    <MobileLayout>
      <div className="space-y-4">
        {justCreatedCreds && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-emerald-800 font-semibold text-[15px]">Клиент успешно создан</p>
            <p className="text-emerald-700 text-sm mt-1">Логин: <span className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded">{justCreatedCreds.login}</span></p>
            <p className="text-emerald-700 text-sm mt-1">Пароль: <span className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded">{justCreatedCreds.password}</span></p>
          </div>
        )}

        <Link to="/mobile/clients" className="inline-flex items-center gap-2 text-sm text-blue-600 font-medium touch-manipulation min-h-[44px] -mb-1">
          <ArrowLeft size={18} /> К списку клиентов
        </Link>

        {/* Основная карточка */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{client.full_name}</h2>
              <p className="text-sm text-gray-500 mt-1">{client.phone}</p>
              <div className="relative mt-2" style={{ zIndex: 10 }}>
                <button type="button" onClick={() => setStatusMenuOpen(o => !o)} disabled={statusLoading}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${STATUS_BADGE[client.status]} disabled:opacity-60`}>
                  {statusLoading ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : STATUS_LABEL[client.status]}
                  <ChevronDown size={11} />
                </button>
                {statusMenuOpen && (
                  <div className="absolute left-0 top-9 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[160px]">
                    {STATUS_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => changeStatus(opt.value)}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition ${opt.value === client.status ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-600 hover:bg-gray-50'}`}>
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
                <p className="text-sm text-green-600 mt-1 flex items-center gap-1"><Gift size={13} /> Бонусы: {fmtMoney(client.bonus_balance)}</p>
              )}
              {client.cabinet_username && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-400 break-all">Логин: <span className="font-mono font-bold">{client.cabinet_username}</span></p>
                  {(newPassword || client.cabinet_password) && (
                    <p className={`text-xs break-all ${newPassword ? 'text-green-700' : 'text-gray-400'}`}>
                      {newPassword ? 'Новый пароль: ' : 'Пароль: '}
                      <span className={`font-mono font-bold px-1 rounded ${newPassword ? 'bg-green-100' : 'bg-gray-100'}`}>{newPassword || client.cabinet_password}</span>
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

        {/* История потоков */}
        <MobileStreamsHistory client={client} clientId={id} />

        {/* Оплата */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <CreditCard size={18} /> Оплата
          </h3>

          {client.payment_type === 'full' && full && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Сумма</span><span className="crm-money font-semibold">{fmtMoney(full.amount)}</span></div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-500">Статус</span>
                <span className={`font-medium flex items-center gap-1 ${full.is_paid ? 'text-green-600' : 'text-red-500'}`}>
                  {full.is_paid ? <><CheckCircle size={14} /> Оплачено</> : <><Clock size={14} /> Не оплачено</>}
                </span>
              </div>
              {full.receipt && <a href={toAbsoluteUrl(full.receipt)} target="_blank" rel="noreferrer" className="text-blue-500 text-sm block">Открыть чек →</a>}

              {/* ── Форма подтверждения полной оплаты (как у рассрочки) ── */}
              {!full.is_paid && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Подтвердить оплату</p>
                  <ConfirmFullPaymentForm clientId={id} amount={full.amount} onSuccess={load} />
                </div>
              )}
            </div>
          )}

          {client.payment_type === 'installment' && plan && (() => {
            const rem  = Number(plan.remaining)
            const isOverpaid = rem < 0
            const isDone     = rem <= 0
            return (
              <div className="space-y-3 text-sm">
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-center"><span className="text-gray-500">Общая стоимость</span><span className="crm-money text-gray-800">{fmtMoney(plan.total_cost)}</span></div>
                  <div className="flex justify-between items-center"><span className="text-gray-500">Оплачено</span><span className="crm-money text-green-600">{fmtMoney(plan.total_paid)}</span></div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between items-center">
                    {isOverpaid
                      ? <><span className="text-gray-500">Переплата</span><span className="text-amber-600 font-semibold">+{fmtMoney(Math.abs(rem))}</span></>
                      : <><span className="text-gray-500">Остаток</span><span className={`crm-money ${isDone ? 'text-green-600' : 'text-red-500'}`}>{isDone ? '—' : fmtMoney(rem)}</span></>
                    }
                  </div>
                </div>
                <div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full transition-all ${isOverpaid ? 'bg-amber-400' : isDone ? 'bg-green-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">{pct}% оплачено</span>
                    {isDone && !isOverpaid && <span className="text-xs text-green-600 font-medium">Полностью закрыто</span>}
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm"><span className="text-gray-500">Дедлайн</span><span className="text-gray-700">{plan.deadline}</span></div>
                {plan.payments?.length > 0 && (
                  <div className="pt-1 border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">История платежей</p>
                    <div className="space-y-1">
                      {plan.payments.map((p, i) => (
                        <div key={p.id} className="flex justify-between items-center text-xs py-1.5 px-2 rounded-lg hover:bg-gray-50 gap-3">
                          <span className="text-gray-400 shrink-0">{p.paid_at}</span>
                          <span className="crm-money text-gray-700 flex-1 text-right">{fmtMoney(p.amount)}</span>
                          {p.receipt ? <a href={toAbsoluteUrl(p.receipt)} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700 shrink-0">Чек</a> : <span className="text-gray-300 shrink-0">—</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Чеки */}
        {allReceipts.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><Receipt size={18} /> История чеков</h3>
            <div className="space-y-2">
              {allReceipts.map((r, i) => (
                <div key={`receipt-${r.id}-${i}`} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-gray-50 rounded-xl text-sm gap-2">
                  <span className="text-gray-600">{r.date}</span>
                  <span className="crm-money break-words">{r.label} — {fmtMoney(r.amount)}</span>
                  {r.receipt ? <a href={toAbsoluteUrl(r.receipt)} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800 font-medium">Открыть чек →</a> : <span className="text-gray-400 text-xs">Чек не прикреплён</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Добавить платёж рассрочка */}
        {client.payment_type === 'installment' && plan && Number(plan.remaining) > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-medium text-gray-700 mb-3">Добавить платёж</h3>
            <AddPaymentForm planId={planId} onSuccess={load} />
          </div>
        )}

        {/* Повторный клиент */}
        <MobileRepeatPanel client={client} clientId={id} onSuccess={load} />

        {/* Модальное окно смены статуса */}
        {statusConfirm && (
          <ConfirmModal
            open={true}
            title="Смена статуса"
            message={`Изменить статус клиента на «${statusConfirm.label}»?`}
            variant="warning"
            confirmText="Изменить"
            onConfirm={async () => {
              setStatusLoading(true); setStatusConfirm(null)
              try {
                await api.post(`/clients/${id}/change_status/`, { status: statusConfirm.newStatus })
                setClient(c => ({ ...c, status: statusConfirm.newStatus }))
              } catch { }
              finally { setStatusLoading(false) }
            }}
            onClose={() => setStatusConfirm(null)}
          />
        )}
      </div>
    </MobileLayout>
  )
}
