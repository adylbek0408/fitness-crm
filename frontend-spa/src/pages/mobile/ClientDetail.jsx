import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link, useOutletContext, useLocation } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'
import {
  Globe, Dumbbell, CreditCard, CheckCircle, Clock, Receipt,
  ArrowLeft, AlertCircle, ChevronDown, ChevronUp, ChevronRight,
  RotateCcw, Gift, Check, Layers, X, UserPlus, Percent,
  Pencil, Ban, AlertTriangle, Send, FlaskConical, Calendar
} from 'lucide-react'
import {
  STATUS_BADGE, STATUS_LABEL, fmtMoney, GROUP_TYPE_LABEL,
  toAbsoluteUrl, fmtDateTime
} from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'
import ConfirmFullPaymentForm from '../../components/payments/ConfirmFullPaymentForm'
import EnrollmentPaymentForm from '../../components/payments/EnrollmentPaymentForm'
import ConfirmModal from '../../components/ConfirmModal'
import RefundModal from '../../components/RefundModal'

const GROUP_TYPE_SHORT = { '1.5h': '1.5 ч', '2.5h': '2.5 ч' }

function bonusPercentDisplay(bp) {
  return bp === null || bp === undefined ? 10 : bp
}

// ── Выбор даты — нативный input с кастомным оформлением (работает на desktop/mobile/ноутбук) ──
function DatePickerInput({ value, onChange }) {
  const display = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 pointer-events-none transition ${
        value ? 'bg-violet-50' : 'bg-amber-50'
      }`} style={value
        ? { borderColor: '#7c3aed' }
        : { borderColor: '#f59e0b', borderStyle: 'dashed' }
      }>
        <Calendar size={18} className="shrink-0" style={{ color: value ? '#7c3aed' : '#d97706' }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: value ? '#6d28d9' : '#92400e' }}>
            Дата дедлайна {!value && '— обязательно'}
          </p>
          <p className="text-sm font-medium truncate" style={{ color: value ? '#5b21b6' : '#b45309' }}>
            {display || 'Нажмите на поле ниже чтобы выбрать дату'}
          </p>
        </div>
        {value
          ? <Check size={14} className="shrink-0" style={{ color: '#7c3aed' }} />
          : <span className="text-xs font-bold shrink-0" style={{ color: '#d97706' }}>▼</span>
        }
      </div>
      <input type="date" value={value} onChange={onChange}
        className="crm-mobile-input w-full"
        style={{ colorScheme: 'light' }} />
    </div>
  )
}

const DAY_LABELS = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' }
const fmtSchedule = s => {
  if (!s) return '—'
  const p = s.split(' ')
  return p[0].split(',').map(d => DAY_LABELS[d] || d).join(', ')
    + (p[1] ? ' · ' + p[1] : '')
    + (p[2] ? ' — ' + p[2] : '')
}

// ── Редактировать данные ───────────────────────────────────────────────────────
function MobileEditInfoPanel({ client, clientId, onSuccess }) {
  const [open, setOpen] = useState(false)
  const [firstName, setFirstName] = useState(client.first_name)
  const [lastName, setLastName] = useState(client.last_name)
  const [phone, setPhone] = useState(client.phone)
  const [telegramLink, setTelegramLink] = useState(client.telegram_link || '')
  const [notes, setNotes] = useState(client.notes || '')
  const [googleEmail, setGoogleEmail] = useState(client.google_email || '')
  const [isTrial, setIsTrial] = useState(client.is_trial || false)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const handleOpen = () => {
    setFirstName(client.first_name); setLastName(client.last_name)
    setPhone(client.phone); setTelegramLink(client.telegram_link || '')
    setNotes(client.notes || ''); setGoogleEmail(client.google_email || ''); setIsTrial(client.is_trial || false)
    setErr('')
    setOpen(v => !v)
  }

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) { setErr('Заполните ФИО и телефон'); return }
    setSaving(true); setErr('')
    try {
      const body = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim(),
        telegram_link: client.training_format === 'online' ? (telegramLink || '').trim() : '',
        notes: (notes || '').trim(),
        google_email: (googleEmail || '').trim().toLowerCase(),
        is_trial: isTrial,
      }
      await api.patch(`/clients/${clientId}/edit-info/`, body)
      setOpen(false); onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка сохранения')
    } finally { setSaving(false) }
  }

  const GROUP_STATUS_LABEL = { recruitment: 'Набор', active: 'Активный' }

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <button type="button" onClick={handleOpen}
        className="w-full flex items-center justify-between p-4 touch-manipulation">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#ede9fe' }}>
            <Pencil size={18} style={{ color: '#7c3aed' }} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">Редактировать данные</p>
            <p className="text-xs text-gray-400">ФИО, телефон, тип клиента</p>
          </div>
        </div>
        <ChevronRight size={18} className={`text-gray-400 transition ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-5 space-y-3 border-t border-gray-100">

          {/* ФИО и телефон */}
          <div className="pt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Фамилия</p>
              <input value={lastName} onChange={e => setLastName(e.target.value)}
                className="crm-mobile-input w-full" placeholder="Фамилия" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Имя</p>
              <input value={firstName} onChange={e => setFirstName(e.target.value)}
                className="crm-mobile-input w-full" placeholder="Имя" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">Телефон</p>
            <input value={phone} onChange={e => setPhone(e.target.value)}
              className="crm-mobile-input w-full" placeholder="+996..." type="tel" />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">Заметка (необяз.)</p>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="crm-mobile-input w-full resize-none" rows={2}
              placeholder="Пометки для сотрудников..." />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1">
              Gmail ученика {client.google_linked ? '✓' : '(для входа через Google)'}
            </p>
            <input value={googleEmail} onChange={e => setGoogleEmail(e.target.value)}
              className="crm-mobile-input w-full" placeholder="example@gmail.com"
              type="email" />
            {client.google_linked && (
              <p className="text-xs text-emerald-600 mt-1">✓ Google аккаунт привязан</p>
            )}
          </div>
          {client.training_format === 'online' && (
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">Ссылка Telegram (необяз.)</p>
              <input value={telegramLink} onChange={e => setTelegramLink(e.target.value)}
                className="crm-mobile-input w-full" placeholder="https://t.me/username или @username" />
            </div>
          )}

          {/* ── Тип клиента: Обычный / Пробный ── */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">Тип клиента</p>
            <div className="flex gap-2">
              {/* Обычный */}
              <button
                type="button"
                onClick={() => setIsTrial(false)}
                className="flex-1 flex items-center justify-between px-3 py-3 rounded-xl transition-all"
                style={!isTrial
                  ? { background: '#fce7f3', border: '2px solid #be185d' }
                  : { background: '#fafafa', border: '2px solid #e5e7eb' }
                }
              >
                <p className="text-sm font-semibold" style={{ color: !isTrial ? '#be185d' : '#6b7280' }}>
                  Обычный
                </p>
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                     style={!isTrial
                       ? { borderColor: '#be185d', background: '#be185d' }
                       : { borderColor: '#d1d5db', background: '#fff' }
                     }>
                  {!isTrial && <Check size={9} className="text-white" strokeWidth={3} />}
                </div>
              </button>

              {/* Пробный */}
              <button
                type="button"
                onClick={() => setIsTrial(true)}
                className="flex-1 flex items-center justify-between px-3 py-3 rounded-xl transition-all"
                style={isTrial
                  ? { background: '#fff7ed', border: '2px solid #ea580c' }
                  : { background: '#fafafa', border: '2px solid #e5e7eb' }
                }
              >
                <div className="flex items-center gap-1.5">
                  <FlaskConical size={13} style={{ color: isTrial ? '#ea580c' : '#9ca3af' }} />
                  <p className="text-sm font-semibold" style={{ color: isTrial ? '#ea580c' : '#6b7280' }}>
                    Пробный
                  </p>
                </div>
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                     style={isTrial
                       ? { borderColor: '#ea580c', background: '#ea580c' }
                       : { borderColor: '#d1d5db', background: '#fff' }
                     }>
                  {isTrial && <Check size={9} className="text-white" strokeWidth={3} />}
                </div>
              </button>
            </div>

            {/* Подсказка при смене с пробного на обычный */}
            {client.is_trial && !isTrial && (
              <div className="mt-2 px-3 py-2 rounded-xl text-xs"
                   style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
                ✓ Статус изменится с «Пробный» на «Новый». Пробный платёж будет удалён — после сохранения введите новую оплату.
              </div>
            )}
            {!client.is_trial && isTrial && (
              <div className="mt-2 px-3 py-2 rounded-xl text-xs"
                   style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
                ⚗️ Клиент будет помечен как пробный. Добавление в группу станет недоступным.
              </div>
            )}
          </div>

          {err && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
                 style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
              <AlertTriangle size={13} /> {err}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleSave} disabled={saving}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
              style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
              {saving
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Check size={16} />
              }
              Сохранить
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="px-4 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium touch-manipulation">
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Отменить оплату ────────────────────────────────────────────────────────────
function MobileCancelPaymentPanel({ client, clientId, onSuccess }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const fp = client.full_payment
  const ip = client.installment_plan
  if (!(fp || ip)) return null

  const payLabel = client.payment_type === 'full'
    ? `Полная оплата — ${fmtMoney(fp?.amount || 0)}`
    : `Рассрочка — ${fmtMoney(ip?.total_cost || 0)} (опл. ${fmtMoney(ip?.total_paid || 0)})`

  const handleCancel = async () => {
    setLoading(true); setErr('')
    try {
      await api.post(`/clients/${clientId}/cancel-payment/`)
      setOpen(false); setConfirm(false); onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка')
    } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <button type="button" onClick={() => { setOpen(v => !v); setConfirm(false); setErr('') }}
        className="w-full flex items-center justify-between p-4 touch-manipulation">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#fff7ed' }}>
            <Ban size={18} style={{ color: '#ea580c' }} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">Отменить оплату</p>
            <p className="text-xs text-gray-400">Ошибка ввода — удалить и ввести заново</p>
          </div>
        </div>
        <ChevronRight size={18} className={`text-gray-400 transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
          <div className="p-3 rounded-xl text-sm" style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
            <p className="font-semibold text-orange-800 text-xs">Текущая оплата:</p>
            <p className="text-orange-700 text-xs mt-0.5">{payLabel}</p>
          </div>
          <p className="text-xs text-gray-500">Деньги не возвращаются. Только для исправления ошибки ввода.</p>
          {!confirm ? (
            <button type="button" onClick={() => setConfirm(true)}
              className="w-full py-3 rounded-2xl text-sm font-semibold touch-manipulation"
              style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
              Отменить оплату
            </button>
          ) : (
            <div className="space-y-2">
              <div className="p-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <p className="text-xs font-semibold text-red-700">Уверены? Оплата будет удалена полностью.</p>
                <p className="text-xs text-red-600 mt-0.5">После этого введите оплату заново ниже.</p>
              </div>
              {err && <p className="text-xs text-red-600">{err}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={handleCancel} disabled={loading}
                  className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60 touch-manipulation"
                  style={{ background: '#dc2626' }}>
                  {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Ban size={14} />}
                  Да, удалить
                </button>
                <button type="button" onClick={() => setConfirm(false)}
                  className="px-4 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium touch-manipulation">
                  Назад
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Ввод оплаты заново (после отмены) ─────────────────────────────────────────
function MobileEnterPaymentPanel({ client, clientId, onSuccess }) {
  const [open,         setOpen]         = useState(false)
  const [payType,      setPayType]      = useState('full')
  const [payAmount,    setPayAmount]    = useState('')
  const [totalCost,    setTotalCost]    = useState('')
  const [deadline,     setDeadline]     = useState('')
  const [bonusPercent, setBonusPercent] = useState(String(bonusPercentDisplay(client.bonus_percent)))
  const [loading,      setLoading]      = useState(false)
  const [err,          setErr]          = useState('')
  const [ok,           setOk]           = useState('')

  const hasPayment = !!(client.full_payment || client.installment_plan)
  // Показываем для new/trial без оплаты (например, после cancel_payment).
  // active-клиенты: backend не позволяет enter-payment для этого статуса.
  if (hasPayment) return null
  if (!['new', 'trial'].includes(client.status)) return null

  const handleSubmit = async () => {
    if (payType === 'full' && (!payAmount || Number(payAmount) <= 0)) {
      setErr('Укажите сумму оплаты'); return
    }
    if (payType === 'installment' && (!totalCost || !deadline)) {
      setErr('Укажите стоимость и дедлайн'); return
    }
    const bp = parseInt(String(bonusPercent).trim(), 10)
    if (Number.isNaN(bp) || bp < 0 || bp > 100) {
      setErr('Процент бонуса: от 0 до 100'); return
    }
    setLoading(true); setErr(''); setOk('')
    try {
      await api.post(`/clients/${clientId}/enter-payment/`, {
        payment_type: payType,
        payment_data: payType === 'full'
          ? { amount: payAmount }
          : { total_cost: totalCost, deadline },
        bonus_percent: bp,
      })
      setOk('Оплата введена!')
      setOpen(false)
      onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden"
         style={{ borderColor: '#c7d2fe', borderWidth: 2 }}>
      <button type="button" onClick={() => { setOpen(v => !v); setErr(''); setOk('') }}
        className="w-full flex items-center justify-between p-4 touch-manipulation">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#eef2ff' }}>
            <CreditCard size={18} style={{ color: '#4f46e5' }} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">Ввести оплату</p>
            <p className="text-xs font-semibold" style={{ color: '#d97706' }}>⚠ Требуется — оплата отменена</p>
          </div>
        </div>
        <ChevronRight size={18} className={`text-gray-400 transition ${open ? 'rotate-90' : ''}`} />
      </button>

      {ok && !open && (
        <div className="px-4 pb-3">
          <div className="p-3 rounded-xl text-sm flex items-center gap-2"
               style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
            <Check size={14} /> {ok}
          </div>
        </div>
      )}

      {open && (
        <div className="px-4 pb-5 border-t border-gray-100 space-y-4 pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Шаг 1 — Тип оплаты</p>
            <div className="flex gap-2">
              {[{ v: 'full', l: 'Полная оплата' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
                <button key={v} type="button" onClick={() => setPayType(v)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                  style={payType === v
                    ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
                    : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }
                  }>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {payType === 'full' && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Шаг 2 — Сумма</p>
              <input type="number" min="0" step="100" placeholder="Сумма (сом)"
                value={payAmount} onChange={e => setPayAmount(e.target.value)}
                className="crm-mobile-input w-full" />
            </div>
          )}
          {payType === 'installment' && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Шаг 2 — Рассрочка</p>
              <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)"
                value={totalCost} onChange={e => setTotalCost(e.target.value)}
                className="crm-mobile-input w-full" />
              <DatePickerInput value={deadline} onChange={e => setDeadline(e.target.value)} />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Шаг 3 — Бонус (%)</p>
            <input type="number" min={0} max={100} step={1} placeholder="Например: 10"
              value={bonusPercent} onChange={e => setBonusPercent(e.target.value)}
              className="crm-mobile-input w-full" />
          </div>
          {err && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
                 style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
              <AlertTriangle size={13} /> {err}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={handleSubmit} disabled={loading}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
              style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
              {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
              Сохранить оплату
            </button>
            <button type="button" onClick={() => { setOpen(false); setErr('') }}
              className="px-4 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium touch-manipulation">
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Добавить в группу (новый клиент) ──────────────────────────────────────────
// Порядок: шаг1 выбрать группу (только UI) → шаг2 ввести оплату →
// submit: сначала enter-payment (клиент ещё new → backend принимает),
// потом add-to-group (клиент становится active).
function MobileNewClientAddPanel({ client, clientId, onSuccess }) {
  const [open,          setOpen]         = useState(false)
  const [groups,        setGroups]       = useState([])
  const [groupsLoading, setGroupsLoading]= useState(false)
  const [statusFilter,  setStatusFilter] = useState('recruitment')
  const [err,           setErr]          = useState('')

  const [step,          setStep]         = useState(1) // 1=выбор группы, 2=оплата
  const [selectedGroup, setSelectedGroup]= useState(null)

  const [payType,      setPayType]      = useState('full')
  const [payAmount,    setPayAmount]    = useState('')
  const [totalCost,    setTotalCost]    = useState('')
  const [deadline,     setDeadline]     = useState('')
  const [bonusPercent, setBonusPercent] = useState(String(bonusPercentDisplay(client.bonus_percent)))
  const [loading,      setLoading]      = useState(false)

  const hasPayment = !!(client.full_payment || client.installment_plan)

  const canUseNewClientFlow =
    !client.is_trial &&
    (client.status === 'new' || (client.status === 'frozen' && !client.is_repeat && hasPayment))
    && !client.group

  if (!canUseNewClientFlow) return null

  const loadGroups = async (st) => {
    setGroupsLoading(true); setErr('')
    try {
      const r = await api.get('/groups/', {
        params: {
          status: st, page_size: 100,
          training_format: client.training_format,
          ...(client.training_format === 'offline' ? { group_type: client.group_type } : {}),
        },
      })
      const list = r.data.results || []
      const tf = client.training_format
      const gt = (client.group_type || '').trim()
      setGroups(list.filter(g => {
        if (g.training_format !== tf) return false
        if (tf === 'online' && !gt) return true
        return g.group_type === gt
      }))
    } catch { setGroups([]) }
    finally { setGroupsLoading(false) }
  }

  const handleToggle = () => {
    const next = !open
    setOpen(next)
    if (next) { setStep(1); setSelectedGroup(null); setErr(''); loadGroups(statusFilter) }
  }
  const switchFilter = (st) => { setStatusFilter(st); loadGroups(st) }

  // Шаг 1 → 2: выбрать группу (только сохраняем в state, API не вызываем)
  const handleSelectGroup = (g) => {
    setSelectedGroup(g)
    setStep(2)
    setPayType('full'); setPayAmount(''); setTotalCost(''); setDeadline('')
    setBonusPercent(String(bonusPercentDisplay(client.bonus_percent)))
    setErr('')
  }

  // Шаг 2: если оплаты ещё нет — сначала enter-payment, потом add-to-group.
  // Если оплата уже введена (через MobileEnterPaymentPanel) — сразу add-to-group.
  const handleEnroll = async () => {
    if (!hasPayment) {
      if (payType === 'full' && (!payAmount || Number(payAmount) <= 0)) { setErr('Укажите сумму оплаты'); return }
      if (payType === 'installment' && (!totalCost || !deadline)) { setErr('Укажите стоимость и дедлайн'); return }
      const bp = parseInt(String(bonusPercent).trim(), 10)
      if (Number.isNaN(bp) || bp < 0 || bp > 100) { setErr('Процент бонуса: от 0 до 100'); return }
    }
    setLoading(true); setErr('')
    try {
      if (!hasPayment) {
        const bp = parseInt(String(bonusPercent).trim(), 10)
        await api.post(`/clients/${clientId}/enter-payment/`, {
          payment_type: payType,
          payment_data: payType === 'full' ? { amount: payAmount } : { total_cost: totalCost, deadline },
          bonus_percent: bp,
        })
      }
      await api.post(`/clients/${clientId}/add-to-group/`, { group_id: selectedGroup.id })
      onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка')
    } finally { setLoading(false) }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <button type="button" onClick={handleToggle}
        className="w-full flex items-center justify-between p-4 text-left touch-manipulation">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#ede9fe' }}>
            <UserPlus size={18} style={{ color: '#7c3aed' }} />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Добавить в группу</p>
            <p className="text-xs text-gray-400">
              {step === 2 && selectedGroup
                ? (hasPayment ? `Группа #${selectedGroup.number} — оплата уже введена` : `Группа #${selectedGroup.number} — введите оплату`)
                : 'Подходят тип и формат клиента'}
            </p>
          </div>
        </div>
        <ChevronRight size={18} className={`text-gray-400 transition ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && step === 1 && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
          <div className="flex gap-2">
            {[{ val: 'recruitment', label: 'Набор' }, { val: 'active', label: 'Активный' }].map(({ val, label }) => (
              <button key={val} type="button" onClick={() => switchFilter(val)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition touch-manipulation ${
                  statusFilter === val ? 'border-pink-600 bg-pink-50 text-pink-700' : 'border-gray-200 text-gray-500'
                }`}>
                {label}
              </button>
            ))}
          </div>
          {groupsLoading ? (
            <div className="flex justify-center py-6">
              <span className="w-6 h-6 border-2 border-pink-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Нет подходящих групп</p>
          ) : (
            <div className="space-y-2">
              {groups.map(g => (
                <div key={g.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 rounded-xl">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-gray-800">
                      Группа #{g.number}
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        {g.group_type ? GROUP_TYPE_LABEL[g.group_type] : ''}{g.training_format === 'online' ? ' · онлайн' : ' · офлайн'}
                      </span>
                    </p>
                    <p className="text-xs text-gray-400 truncate">{g.trainer?.full_name || '—'}</p>
                  </div>
                  <button type="button" onClick={() => handleSelectGroup(g)}
                    className="shrink-0 px-3 py-2 rounded-xl text-xs font-semibold text-white touch-manipulation"
                    style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
                    Выбрать
                  </button>
                </div>
              ))}
            </div>
          )}
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
      )}

      {open && step === 2 && selectedGroup && (
        <div className="px-4 pb-5 border-t border-gray-100 space-y-4 pt-4">
          <button type="button" onClick={() => { setStep(1); setErr('') }}
            className="flex items-center gap-1.5 text-sm text-gray-400 touch-manipulation">
            <ArrowLeft size={15} /> Другая группа
          </button>
          <div className="p-3 rounded-xl text-sm font-semibold"
               style={{ background: '#ede9fe', color: '#7c3aed' }}>
            Группа #{selectedGroup.number}
            <span className="ml-2 text-xs font-normal" style={{ color: '#6d28d9' }}>
              {GROUP_TYPE_LABEL[selectedGroup.group_type] || selectedGroup.group_type}
            </span>
          </div>
          {hasPayment ? (
            <div className="p-3 rounded-xl text-sm" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d' }}>
              ✓ Оплата уже введена — клиент будет добавлен в группу
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Тип оплаты</p>
                <div className="flex gap-2">
                  {[{ v: 'full', l: 'Полная оплата' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setPayType(v)}
                      className="flex-1 py-3 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                      style={payType === v
                        ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
                        : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }
                      }>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {payType === 'full' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Сумма</p>
                  <input type="number" min="0" step="100" placeholder="Сумма (сом)"
                    value={payAmount} onChange={e => setPayAmount(e.target.value)}
                    className="crm-mobile-input w-full" />
                </div>
              )}
              {payType === 'installment' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Рассрочка</p>
                  <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)"
                    value={totalCost} onChange={e => setTotalCost(e.target.value)}
                    className="crm-mobile-input w-full" />
                  <DatePickerInput value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Бонус (%)</p>
                <input type="number" min={0} max={100} step={1} placeholder="Например: 10"
                  value={bonusPercent} onChange={e => setBonusPercent(e.target.value)}
                  className="crm-mobile-input w-full" />
              </div>
            </>
          )}
          {err && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
                 style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
              <AlertTriangle size={13} /> {err}
            </div>
          )}
          <button type="button" onClick={handleEnroll} disabled={loading}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
            style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
            {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
            Записать в группу #{selectedGroup.number}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Повторная запись ───────────────────────────────────────────────────────────
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
  const [bonusPercent,  setBonusPercent]  = useState(String(bonusPercentDisplay(client.bonus_percent)))

  useEffect(() => {
    setBonusPercent(String(bonusPercentDisplay(client.bonus_percent)))
  }, [client.id, client.bonus_percent])

  const loadGroups = async (status) => {
    setGroupsLoading(true); setEnrollGroup(null)
    try {
      const r = await api.get('/groups/', {
        params: { status, page_size: 100, training_format: client.training_format,
          ...(client.training_format === 'offline' ? { group_type: client.group_type } : {}) },
      })
      const list = r.data.results || []
      const tf = client.training_format; const gt = (client.group_type || '').trim()
      setGroups(list.filter(g => {
        if (g.training_format !== tf) return false
        if (tf === 'online' && !gt) return true
        return g.group_type === gt
      }))
    } catch { setGroups([]) } finally { setGroupsLoading(false) }
  }

  const handleOpen = () => {
    setOpen(true); setStep(1); setEnrollGroup(null)
    setPayAmount(''); setTotalCost(''); setDeadline('')
    setBonusPercent(String(bonusPercentDisplay(client.bonus_percent)))
    setError(''); setSuccessMsg(''); loadGroups(statusFilter)
  }
  const switchFilter = (s) => { setStatusFilter(s); loadGroups(s) }
  const handleSelectGroup = (g) => { setEnrollGroup(g); setStep(2); setPayType('full'); setError('') }

  const handleEnroll = async () => {
    if (payType === 'full' && (!payAmount || Number(payAmount) <= 0)) { setError('Введите сумму'); return }
    if (payType === 'installment' && (!totalCost || !deadline)) { setError('Укажите стоимость и дедлайн'); return }
    const bp = parseInt(String(bonusPercent).trim(), 10)
    if (Number.isNaN(bp) || bp < 0 || bp > 100) { setError('Укажите процент бонуса 0–100'); return }
    setLoading(true); setError('')
    try {
      await api.post(`/clients/${clientId}/re-enroll/`, {
        group_id: enrollGroup.id, payment_type: payType,
        payment_data: payType === 'full' ? { amount: payAmount } : { total_cost: totalCost, deadline },
        bonus_percent: bp,
      })
      setSuccessMsg(`Клиент записан в группу #${enrollGroup.number}`)
      setOpen(false); setEnrollGroup(null); onSuccess()
    } catch(e) { setError(e.response?.data?.detail || 'Ошибка') } finally { setLoading(false) }
  }

  const statusAllowsReEnroll = !client.is_trial && !client.group && ['completed', 'expelled', 'frozen'].includes(client.status)
  if (!statusAllowsReEnroll) return null

  const fpCheck = client.full_payment; const ipCheck = client.installment_plan
  const hasOpenPaymentObligation =
    (client.payment_type === 'full' && fpCheck && !fpCheck.is_paid) ||
    (client.payment_type === 'installment' && ipCheck && !ipCheck.is_closed)

  if (hasOpenPaymentObligation) {
    const remainingDebt = client.payment_type === 'installment' && ipCheck
      ? ` Остаток: ${fmtMoney(ipCheck.remaining)}.` : ' Оплата не подтверждена.'
    return (
      <div className="bg-white rounded-2xl shadow-sm border p-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#fef3c7' }}>
            <Gift size={18} style={{ color: '#d97706' }} />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">Повторная запись</p>
            <p className="text-xs mt-1" style={{ color: '#92400e' }}>Недоступно — сначала закройте оплату.{remainingDebt}</p>
          </div>
        </div>
      </div>
    )
  }

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
              <p className="text-xs text-gray-400">Новая оплата + группа</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-400" />
        </button>
      ) : (
        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">
              {step === 1 ? 'Выберите группу' : `Оплата — Группа #${enrollGroup?.number}`}
            </h3>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400"><X size={18} /></button>
          </div>
          <div className="rounded-2xl p-4 mb-3" style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-xs)' }}>Бонус с оплаты</p>
            <label className="block">
              <span className="text-xs" style={{ color: 'var(--text-soft)' }}>Процент (0–100) *</span>
              <input type="number" min={0} max={100} step={1} value={bonusPercent}
                onChange={e => setBonusPercent(e.target.value)} className="crm-mobile-input w-full mt-1" />
            </label>
          </div>
          {step === 1 && (
            <div>
              {Number(client.bonus_balance) > 0 && (
                <div className="flex items-center gap-2 p-3 rounded-xl mb-3 text-sm"
                  style={{ background: '#fefce8', border: '1px solid #fde68a' }}>
                  <Gift size={14} style={{ color: '#d97706' }} />
                  <span style={{ color: '#92400e' }}>Бонус <strong>{fmtMoney(client.bonus_balance)}</strong> — спишется при оплате</span>
                </div>
              )}
              <div className="flex gap-2 mb-3">
                {[{ val: 'recruitment', label: 'Набор' }, { val: 'active', label: 'Активный' }].map(({ val, label }) => (
                  <button key={val} type="button" onClick={() => switchFilter(val)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                    style={statusFilter === val
                      ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
                      : { background: '#fff', borderColor: '#e5e7eb', color: '#6b7280' }}>
                    {label}
                  </button>
                ))}
              </div>
              {groupsLoading ? (
                <div className="flex justify-center py-8">
                  <span className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#be185d' }} />
                </div>
              ) : groups.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">Нет подходящих групп</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {groups.map(g => (
                    <button key={g.id} type="button" onClick={() => handleSelectGroup(g)}
                      className="w-full text-left p-3 rounded-xl border-2 transition touch-manipulation"
                      style={{ background: '#fafafa', borderColor: '#e5e7eb' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800 text-sm">Группа #{g.number}
                            <span className="ml-2 text-xs font-normal text-gray-400">{GROUP_TYPE_LABEL[g.group_type] || g.group_type}</span>
                          </p>
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
                <ArrowLeft size={15} /> Другая группа
              </button>
              <div className="p-3 rounded-xl text-sm" style={{ background: '#fce7f3' }}>
                <span className="font-semibold" style={{ color: '#be185d' }}>Группа #{enrollGroup.number}</span>
                <span className="ml-2 text-xs" style={{ color: '#9d174d' }}>{GROUP_TYPE_LABEL[enrollGroup.group_type]} · {enrollGroup.trainer?.full_name || '—'}</span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Тип оплаты</p>
                <div className="flex gap-2">
                  {[{ v: 'full', l: 'Полная' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
                    <button key={v} type="button" onClick={() => setPayType(v)}
                      className="flex-1 py-3 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                      style={payType === v
                        ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
                        : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              {payType === 'full' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Сумма курса</p>
                  <input type="number" min="0" step="100" placeholder="Сумма (сом)"
                    value={payAmount} onChange={e => setPayAmount(e.target.value)} className="crm-mobile-input w-full" />
                </div>
              )}
              {payType === 'installment' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Детали рассрочки</p>
                  <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)"
                    value={totalCost} onChange={e => setTotalCost(e.target.value)} className="crm-mobile-input w-full" />
                  <DatePickerInput value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
              )}
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="button" onClick={handleEnroll} disabled={loading}
                className="w-full py-4 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
                style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
                {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                Записать в группу #{enrollGroup.number}
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

// ── Бронь следующей группы ────────────────────────────────────────────────────
function MobileReservationPanel({ client, clientId, onSuccess }) {
  const [open,          setOpen]          = useState(false)
  const [format,        setFormat]        = useState('offline')
  const [statusFilter,  setStatusFilter]  = useState('recruitment')
  const [groups,        setGroups]        = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [payType,       setPayType]       = useState('full')
  const [payAmount,     setPayAmount]     = useState('')
  const [totalCost,     setTotalCost]     = useState('')
  const [deadline,      setDeadline]      = useState('')
  const [bonusPercent,  setBonusPercent]  = useState(String(client.bonus_percent ?? 10))
  const [saving,        setSaving]        = useState(false)
  const [cancelling,    setCancelling]    = useState(false)
  const [err,           setErr]           = useState('')

  const res = client.active_reservation

  if (client.status !== 'active' || !client.group) return null

  const loadGroups = async (fmt, st) => {
    setGroupsLoading(true); setSelectedGroup(null)
    try {
      const r = await api.get('/groups/', { params: { page_size: 100, status: st, training_format: fmt } })
      setGroups((r.data.results || []).filter(g => g.id !== client.group?.id))
    } catch { setGroups([]) }
    finally { setGroupsLoading(false) }
  }

  const handleOpen = () => {
    const next = !open
    setOpen(next); setErr(''); setSelectedGroup(null)
    setPayAmount(''); setTotalCost(''); setDeadline('')
    setBonusPercent(String(client.bonus_percent ?? 10)); setPayType('full')
    if (next) { setFormat('offline'); setStatusFilter('recruitment'); loadGroups('offline', 'recruitment') }
  }

  const handleSave = async () => {
    if (!selectedGroup) { setErr('Выберите группу'); return }
    if (payType === 'full' && (!payAmount || Number(payAmount) <= 0)) { setErr('Укажите сумму'); return }
    if (payType === 'installment' && (!totalCost || !deadline)) { setErr('Укажите стоимость и дедлайн'); return }
    setSaving(true); setErr('')
    try {
      await api.post(`/clients/${clientId}/reserve-group/`, {
        group_id:       selectedGroup.id,
        payment_type:   payType,
        payment_amount: payType === 'full' ? payAmount : undefined,
        total_cost:     payType === 'installment' ? totalCost : undefined,
        deadline:       payType === 'installment' ? deadline : undefined,
        bonus_percent:  Number(bonusPercent) || 10,
      })
      setOpen(false); onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка')
    } finally { setSaving(false) }
  }

  const handleCancel = async () => {
    setCancelling(true); setErr('')
    try {
      await api.delete(`/clients/${clientId}/cancel-reservation/`)
      onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка')
    } finally { setCancelling(false) }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <button type="button" onClick={res ? undefined : handleOpen}
        className="w-full flex items-center justify-between p-4 touch-manipulation"
        style={{ cursor: res ? 'default' : 'pointer' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
               style={{ background: '#f3e8ff' }}>
            <Calendar size={18} style={{ color: '#7c3aed' }} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">Бронь следующей группы</p>
            <p className="text-xs text-gray-400">
              {res ? `Забронировано: Группа #${res.reserved_group_number}` : 'Предзапись с оплатой'}
            </p>
          </div>
        </div>
        {!res && <ChevronRight size={18} className={`text-gray-400 transition ${open ? 'rotate-90' : ''}`} />}
      </button>

      {res && (
        <div className="px-4 pb-4 border-t border-gray-100 space-y-3 pt-3">
          <div className="p-3 rounded-xl text-sm" style={{ background: '#f3e8ff', border: '1px solid #d8b4fe' }}>
            <p className="font-semibold" style={{ color: '#6d28d9' }}>Группа #{res.reserved_group_number}</p>
            <p className="text-xs mt-0.5" style={{ color: '#7c3aed' }}>
              {res.payment_type === 'full' ? `Полная оплата — ${res.payment_amount} сом` : `Рассрочка — ${res.total_cost} сом`}
            </p>
            <p className="text-xs mt-1 text-gray-400">При закрытии текущей группы — авто-зачисление.</p>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button type="button" onClick={handleCancel} disabled={cancelling}
            className="w-full py-2.5 rounded-xl text-sm font-semibold border touch-manipulation disabled:opacity-60"
            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
            {cancelling ? <span className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin inline-block" /> : 'Отменить бронь'}
          </button>
        </div>
      )}

      {!res && open && (
        <div className="p-4 space-y-3 border-t border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Выберите группу</p>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400 touch-manipulation p-1"><X size={16} /></button>
          </div>

          {/* Онлайн / Оффлайн */}
          <div className="flex gap-2">
            {[{ v: 'offline', icon: <Dumbbell size={15} />, l: 'Оффлайн' }, { v: 'online', icon: <Globe size={15} />, l: 'Онлайн' }].map(({ v, icon, l }) => (
              <button key={v} type="button"
                onClick={() => { setFormat(v); loadGroups(v, statusFilter) }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold border-2 touch-manipulation transition"
                style={format === v
                  ? { background: '#ede9fe', borderColor: '#7c3aed', color: '#7c3aed' }
                  : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
                {icon} {l}
              </button>
            ))}
          </div>

          {/* Набор / Активный */}
          <div className="flex gap-2">
            {[{ v: 'recruitment', l: 'Набор' }, { v: 'active', l: 'Активный' }].map(({ v, l }) => (
              <button key={v} type="button"
                onClick={() => { setStatusFilter(v); loadGroups(format, v) }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition touch-manipulation ${
                  statusFilter === v ? 'border-pink-600 bg-pink-50 text-pink-700' : 'border-gray-200 text-gray-500'
                }`}>
                {l}
              </button>
            ))}
          </div>

          {/* Список групп */}
          {groupsLoading ? (
            <div className="flex justify-center py-4">
              <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#7c3aed' }} />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">Нет доступных групп</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {groups.map(g => (
                <button key={g.id} type="button"
                  onClick={() => setSelectedGroup(selectedGroup?.id === g.id ? null : g)}
                  className="w-full text-left p-3 rounded-xl border-2 transition touch-manipulation"
                  style={selectedGroup?.id === g.id
                    ? { background: '#f3e8ff', borderColor: '#7c3aed' }
                    : { background: '#fafafa', borderColor: '#e5e7eb' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">
                        Группа #{g.number}
                        {g.trainer?.full_name && <span className="font-normal text-gray-500 text-xs ml-1">· {g.trainer.full_name}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {GROUP_TYPE_LABEL[g.group_type] || g.group_type || '—'}
                        {' · '}
                        <span className={g.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}>
                          {g.status === 'active' ? 'Активный' : 'Набор'}
                        </span>
                      </p>
                    </div>
                    {selectedGroup?.id === g.id && <Check size={15} style={{ color: '#7c3aed' }} className="shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Оплата — появляется после выбора группы */}
          {selectedGroup && (
            <div className="space-y-3 border-t border-dashed border-gray-200 pt-3">
              <div className="p-2.5 rounded-xl text-xs font-medium"
                   style={{ background: '#f3e8ff', color: '#6d28d9' }}>
                {selectedGroup.trainer?.full_name
                  ? `Группа #${selectedGroup.number} · ${selectedGroup.trainer.full_name}`
                  : `Группа #${selectedGroup.number}`}
              </div>
              <div className="flex gap-2">
                {[{ v: 'full', l: 'Полная' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
                  <button key={v} type="button" onClick={() => setPayType(v)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                    style={payType === v
                      ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
                      : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
                    {l}
                  </button>
                ))}
              </div>
              {payType === 'full' ? (
                <input type="number" min="0" step="100" placeholder="Сумма (сом)"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} className="crm-mobile-input w-full" />
              ) : (
                <div className="space-y-2">
                  <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)"
                    value={totalCost} onChange={e => setTotalCost(e.target.value)} className="crm-mobile-input w-full" />
                  <DatePickerInput value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Бонус (%)</p>
                <input type="number" min={0} max={100} step={1} value={bonusPercent}
                  onChange={e => setBonusPercent(e.target.value)} className="crm-mobile-input w-full" />
              </div>
              {err && (
                <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
                     style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
                  <AlertTriangle size={13} /> {err}
                </div>
              )}
              <button type="button" onClick={handleSave} disabled={saving}
                className="w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
                style={{ background: 'linear-gradient(135deg,#7c3aed,#be185d)' }}>
                {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
                Забронировать группу #{selectedGroup.number}
              </button>
            </div>
          )}
          {!selectedGroup && err && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
                 style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
              <AlertTriangle size={13} /> {err}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── История групп ─────────────────────────────────────────────────────────────
function MobileStreamsHistory({ client, clientId }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)
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
      <button type="button" onClick={toggle}
        className="w-full flex items-center justify-between p-4 touch-manipulation">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#f3f4f6' }}>
            <Layers size={18} className="text-gray-500" />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">История группы</p>
            <p className="text-xs text-gray-400">
              {client.group ? `Текущая: Группа #${client.group.number}` : 'Нет активной группы'}
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#be185d' }} />
            </div>
          ) : (
            <>
              {client.group && (
                <div className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#fce7f3' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    {client.group.training_format === 'online'
                      ? <Globe size={14} style={{ color: '#059669', flexShrink: 0 }} />
                      : <Dumbbell size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm" style={{ color: '#be185d' }}>
                        Группа #{client.group.number}
                        <span className="ml-1.5 font-normal text-xs" style={{ color: '#9d174d' }}>
                          {client.group.training_format === 'online' ? '· Онлайн' : '· Оффлайн'}
                          {client.group.group_type ? ` · ${GROUP_TYPE_SHORT[client.group.group_type] || client.group.group_type}` : ''}
                        </span>
                      </p>
                      {client.registered_at && (
                        <p className="text-xs mt-0.5" style={{ color: '#9d174d' }}>
                          с {new Date(client.registered_at + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                    style={{ background: '#fce7f3', color: '#be185d', border: '1px solid #fca5a5' }}>Текущий</span>
                </div>
              )}
              {(client.parallel_enrollments || []).map(e => (
                <div key={e.id} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#f3e8ff' }}>
                  <div className="flex items-center gap-2 min-w-0">
                    {e.group_training_format === 'online'
                      ? <Globe size={14} style={{ color: '#059669', flexShrink: 0 }} />
                      : <Dumbbell size={14} style={{ color: '#7c3aed', flexShrink: 0 }} />}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm" style={{ color: '#7c3aed' }}>
                        Группа #{e.group_number}
                        <span className="ml-1.5 font-normal text-xs" style={{ color: '#6d28d9' }}>
                          {e.group_training_format === 'online' ? '· Онлайн' : '· Оффлайн'}
                          {e.group_type ? ` · ${GROUP_TYPE_SHORT[e.group_type] || e.group_type}` : ''}
                        </span>
                      </p>
                      {e.created_at && (
                        <p className="text-xs mt-0.5" style={{ color: '#6d28d9' }}>
                          с {new Date(e.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: '#ede9fe', color: '#7c3aed' }}>доп.</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: '#f3e8ff', color: '#7c3aed', border: '1px solid #d8b4fe' }}>Текущий</span>
                  </div>
                </div>
              ))}
              {history.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-3">Прошлых групп нет</p>
              ) : history.map(h => (
                <div key={h.id} className="rounded-xl border border-gray-100 overflow-hidden">
                  <button type="button" onClick={() => setSelected(s => s?.id === h.id ? null : h)}
                    className="w-full flex items-center justify-between p-3 touch-manipulation" style={{ background: '#f9fafb' }}>
                    <div className="text-left">
                      <span className="font-semibold text-gray-700 text-sm">Группа #{h.group_number}</span>
                      <span className="ml-2 text-xs text-gray-400">{GROUP_TYPE_SHORT[h.group_type]}</span>
                      <span className="ml-2 text-xs text-gray-300">·</span>
                      <span className="ml-2 text-xs text-gray-400">{h.ended_at}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-semibold ${h.payment_is_closed ? 'text-green-600' : 'text-red-500'}`}>
                        {h.payment_is_closed ? '✓' : '!'}
                      </span>
                      {selected?.id === h.id ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </button>
                  {selected?.id === h.id && (
                    <div className="px-3 py-3 bg-white space-y-2">
                      {[['Тренер', h.trainer_name || '—'], ['Старт', h.start_date || '—'],
                        ['Тип оплаты', h.payment_type === 'full' ? 'Полная' : 'Рассрочка'],
                        ['Сумма курса', fmtMoney(h.payment_amount)], ['Оплачено', fmtMoney(h.payment_paid)]
                      ].map(([lbl, val]) => (
                        <div key={lbl} className="flex justify-between text-xs">
                          <span className="text-gray-400">{lbl}</span>
                          <span className="font-medium text-gray-700">{val}</span>
                        </div>
                      ))}
                      {h.receipts?.length > 0 && (
                        <div className="pt-2 border-t border-gray-100 space-y-1.5">
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Чеки</p>
                          {h.receipts.map((rec, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div>
                                <span className="text-gray-500">{rec.label}</span>
                                {rec.paid_at && <span className="ml-2 text-gray-300">{rec.paid_at}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-700">{fmtMoney(rec.amount)}</span>
                                {rec.url
                                  ? <a href={toAbsoluteUrl(rec.url)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 font-semibold">
                                      <Receipt size={11} /> Чек
                                    </a>
                                  : <span className="text-gray-300">Без чека</span>
                                }
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
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

// ── История статусов ─────────────────────────────────────────────────────────
const STATUS_DOT = {
  new:           'bg-violet-400',
  trial:         'bg-orange-400',
  active:        'bg-emerald-400',
  active_frozen: 'bg-teal-400',
  completed:     'bg-slate-400',
  expelled:      'bg-red-400',
  frozen:        'bg-sky-400',
}

function MobileStatusHistory({ clientId }) {
  const [open, setOpen]       = useState(false)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (history.length > 0) return
    setLoading(true)
    try {
      const r = await api.get(`/clients/${clientId}/status-history/`)
      setHistory(r.data)
    } catch { }
    finally { setLoading(false) }
  }

  const toggle = () => { if (!open) load(); setOpen(v => !v) }

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <button type="button" onClick={toggle}
        className="w-full flex items-center justify-between p-4 touch-manipulation">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#f3e8ff' }}>
            <Clock size={18} style={{ color: '#7c3aed' }} />
          </div>
          <div className="text-left">
            <p className="font-semibold text-gray-800 text-sm">История статусов</p>
            <p className="text-xs text-gray-400">Журнал всех смен статуса</p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                    style={{ borderColor: '#7c3aed' }} />
            </div>
          ) : history.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">История пуста</p>
          ) : (
            <div className="relative">
              <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-gray-100" />
              <div className="space-y-3">
                {history.map(r => (
                  <div key={r.id} className="flex items-start gap-3 pl-1">
                    <div className={`w-5 h-5 rounded-full border-2 border-white shadow shrink-0 mt-0.5 z-10 ${
                      STATUS_DOT[r.new_status] || 'bg-gray-300'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {r.old_status ? (
                          <>
                            <span className="text-xs font-semibold text-gray-400">{r.old_status_label}</span>
                            <span className="text-gray-300 text-xs">→</span>
                          </>
                        ) : null}
                        <span className={`text-xs font-bold ${
                          r.new_status === 'active'        ? 'text-emerald-600' :
                          r.new_status === 'active_frozen' ? 'text-teal-600' :
                          r.new_status === 'trial'         ? 'text-orange-600' :
                          r.new_status === 'frozen'        ? 'text-sky-600' :
                          r.new_status === 'expelled'      ? 'text-red-600' :
                          r.new_status === 'completed'     ? 'text-slate-500' :
                          'text-violet-600'
                        }`}>{r.new_status_label}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(r.created_at).toLocaleString('ru-RU', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                        {r.changed_by_name ? ` · ${r.changed_by_name}` : ''}
                      </p>
                      {r.note && (
                        <p className="text-xs text-gray-400 italic mt-0.5">{r.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Ввести оплату заново внутри блока группы (после отмены) ─────────────────
function ReenterPaymentInline({ clientId, client, onSuccess }) {
  const [payType,   setPayType]   = useState(client.payment_type || 'full')
  const [amount,    setAmount]    = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [deadline,  setDeadline]  = useState('')
  const [loading,   setLoading]   = useState(false)
  const [err,       setErr]       = useState('')

  const handleSubmit = async () => {
    if (payType === 'full' && (!amount || Number(amount) <= 0)) { setErr('Укажите сумму'); return }
    if (payType === 'installment' && (!totalCost || !deadline)) { setErr('Укажите стоимость и дедлайн'); return }
    setLoading(true); setErr('')
    try {
      await api.post(`/clients/${clientId}/enter-payment/`, {
        payment_type: payType,
        payment_data: payType === 'full' ? { amount } : { total_cost: totalCost, deadline },
        bonus_percent: client.bonus_percent ?? 10,
      })
      onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка')
    } finally { setLoading(false) }
  }

  return (
    <div className="border-t border-amber-100 pt-3 space-y-3">
      <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex items-center gap-1.5">
        <AlertTriangle size={12} /> Оплата не введена — выберите тип
      </p>
      <div className="flex gap-2">
        {[{ v: 'full', l: 'Полная оплата' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
          <button key={v} type="button" onClick={() => setPayType(v)}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
            style={payType === v
              ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
              : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
            {l}
          </button>
        ))}
      </div>
      {payType === 'full' && (
        <input type="number" min="1" placeholder="Сумма (сом)"
          value={amount} onChange={e => setAmount(e.target.value)}
          className="crm-mobile-input w-full" />
      )}
      {payType === 'installment' && (
        <div className="space-y-2">
          <input type="number" min="1" placeholder="Общая стоимость (сом)"
            value={totalCost} onChange={e => setTotalCost(e.target.value)}
            className="crm-mobile-input w-full" />
          <DatePickerInput value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
      )}
      {err && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-2">{err}</p>}
      <button type="button" onClick={handleSubmit} disabled={loading}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
        style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
        {loading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
        Сохранить оплату
      </button>
    </div>
  )
}

// ── Основная группа — аккордеон ──────────────────────────────────────────────
function PrimaryGroupBlock({ client, clientId, planId, onSuccess, onFreezeClick }) {
  const [open,          setOpen]          = useState(true)
  const [cancelOpen,    setCancelOpen]    = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [cancelErr,     setCancelErr]     = useState('')
  const [leaveConfirm,  setLeaveConfirm]  = useState(false)
  const [leaveLoading,  setLeaveLoading]  = useState(false)
  const [leaveErr,      setLeaveErr]      = useState('')

  const group = client.group
  const full  = client.full_payment
  const plan  = client.installment_plan
  const rem = plan ? Number(plan.remaining) : 0
  const pct = plan && Number(plan.total_cost) > 0
    ? Math.min(Math.round(Number(plan.total_paid) / Number(plan.total_cost) * 100), 100) : 0
  const trainerName = group.trainer?.full_name || ''
  const hasCancelablePayment = !!(full || plan)

  const handleCancelPayment = async () => {
    setCancelLoading(true); setCancelErr('')
    try {
      await api.post(`/clients/${clientId}/cancel-payment/`)
      setCancelOpen(false); setCancelConfirm(false); onSuccess()
    } catch (e) {
      setCancelErr(e.response?.data?.detail || 'Ошибка')
    } finally { setCancelLoading(false) }
  }

  const handleLeaveGroup = async () => {
    setLeaveLoading(true); setLeaveErr('')
    try {
      await api.post(`/clients/${clientId}/leave-group/`)
      onSuccess()
    } catch (e) {
      setLeaveErr(e.response?.data?.detail || 'Ошибка')
      setLeaveLoading(false)
    }
  }

  const receipts = []
  if (client.payment_type === 'full' && full)
    receipts.push({ id: full.id, date: full.created_at || full.paid_at, amount: full.amount, label: 'Полная оплата', receipt: full.receipt || null })
  if (client.payment_type === 'installment' && plan?.payments?.length)
    plan.payments.forEach((p, i) => receipts.push({
      id: p.id, date: p.created_at || p.paid_at, amount: p.amount, label: `Платёж ${i + 1}`, receipt: p.receipt || null,
    }))

  return (
    <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 touch-manipulation text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: group.training_format === 'online' ? '#ecfdf5' : '#ede9fe' }}>
            {group.training_format === 'online'
              ? <Globe size={18} style={{ color: '#059669' }} />
              : <Dumbbell size={18} style={{ color: '#7c3aed' }} />}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 text-sm truncate">
              Группа #{group.number}
              {trainerName && <span className="font-normal text-gray-500 ml-1.5 text-xs">· {trainerName}</span>}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {group.training_format === 'online' ? 'Онлайн' : 'Оффлайн'}
              {group.group_type ? ` · ${GROUP_TYPE_LABEL[group.group_type] || group.group_type}` : ''}
              {' · '}
              {client.payment_type === 'full'
                ? (full?.is_paid ? <span className="text-emerald-600">Оплачено</span> : <span className="text-amber-600">Не оплачено</span>)
                : (rem <= 0 ? <span className="text-emerald-600">Закрыто</span> : <span className="text-amber-600">{pct}% оплачено</span>)
              }
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-5 border-t border-gray-100 space-y-4 pt-3">
          {client.payment_type === 'full' && full && (
            <div className="space-y-2 text-sm">
              {full.course_amount != null && Number(full.course_amount) !== Number(full.amount) && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Сумма курса</span>
                  <span className="crm-money font-semibold">{fmtMoney(full.course_amount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">{full.course_amount != null && Number(full.course_amount) !== Number(full.amount) ? 'К оплате' : 'Сумма'}</span>
                <span className="crm-money font-semibold">{fmtMoney(full.amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Статус</span>
                <span className={`font-medium flex items-center gap-1 ${full.is_paid ? 'text-emerald-600' : 'text-red-500'}`}>
                  {full.is_paid ? <><CheckCircle size={14} /> Оплачено</> : <><Clock size={14} /> Не оплачено</>}
                </span>
              </div>
              {full.receipt && (
                <a href={toAbsoluteUrl(full.receipt)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-blue-500 text-sm">
                  <Receipt size={14} /> Открыть чек →
                </a>
              )}
              {!full.is_paid && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Подтвердить оплату</p>
                  <ConfirmFullPaymentForm clientId={clientId} amount={full.amount} onSuccess={onSuccess} />
                </div>
              )}
            </div>
          )}

          {client.payment_type === 'installment' && plan && (
            <div className="space-y-3 text-sm">
              <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                <div className="flex justify-between"><span className="text-gray-500">Общая стоимость</span><span className="crm-money text-gray-800">{fmtMoney(plan.total_cost)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Оплачено</span><span className="crm-money text-emerald-600">{fmtMoney(plan.total_paid)}</span></div>
                <div className="border-t border-gray-200 pt-2 flex justify-between">
                  {rem < 0
                    ? <><span className="text-gray-500">Переплата</span><span className="text-amber-600 font-semibold">+{fmtMoney(Math.abs(rem))}</span></>
                    : <><span className="text-gray-500">Остаток</span><span className={`crm-money ${rem <= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{rem <= 0 ? '—' : fmtMoney(rem)}</span></>
                  }
                </div>
              </div>
              <div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full transition-all ${rem < 0 ? 'bg-amber-400' : rem <= 0 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-gray-400">{pct}% оплачено</span>
                  {rem <= 0 && rem >= 0 && <span className="text-xs text-emerald-600 font-medium">Полностью закрыто</span>}
                </div>
              </div>
              <div className="flex justify-between"><span className="text-gray-500">Дедлайн</span><span className="text-gray-700">{plan.deadline}</span></div>
              {rem > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <AddPaymentForm planId={planId} onSuccess={onSuccess} />
                </div>
              )}
            </div>
          )}

          {!full && !plan && (
            <ReenterPaymentInline clientId={clientId} client={client} onSuccess={onSuccess} />
          )}

          {receipts.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">История платежей</p>
              <div className="space-y-1.5">
                {receipts.map((r, i) => (
                  <div key={`r-${r.id}-${i}`}
                    className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded-lg text-xs gap-2">
                    <span className="text-gray-400 shrink-0">{r.date ? fmtDateTime(r.date) : '—'}</span>
                    <span className="crm-money flex-1 text-right">{r.label} — {fmtMoney(r.amount)}</span>
                    {r.receipt
                      ? <a href={toAbsoluteUrl(r.receipt)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 font-semibold shrink-0"><Receipt size={11} /> Чек</a>
                      : <span className="text-gray-300 shrink-0">—</span>
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Отменить оплату */}
          {hasCancelablePayment && (
            <div className="border-t border-gray-100 pt-3">
              <button type="button"
                onClick={() => { setCancelOpen(v => !v); setCancelConfirm(false); setCancelErr('') }}
                className="flex items-center gap-2 text-sm font-medium touch-manipulation py-1"
                style={{ color: '#ea580c' }}>
                <Ban size={14} /> Отменить оплату
                <ChevronRight size={14} className={`transition ${cancelOpen ? 'rotate-90' : ''}`} />
              </button>
              {cancelOpen && (
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-gray-500">Деньги не возвращаются. Только для исправления ошибки ввода.</p>
                  {!cancelConfirm ? (
                    <button type="button" onClick={() => setCancelConfirm(true)}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold touch-manipulation"
                      style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
                      Отменить оплату
                    </button>
                  ) : (
                    <div className="space-y-2">
                      <div className="p-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                        <p className="text-xs font-semibold text-red-700">Уверены? Оплата будет удалена полностью.</p>
                      </div>
                      {cancelErr && <p className="text-xs text-red-600">{cancelErr}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCancelPayment} disabled={cancelLoading}
                          className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60 touch-manipulation"
                          style={{ background: '#dc2626' }}>
                          {cancelLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Ban size={13} />}
                          Да, удалить
                        </button>
                        <button type="button" onClick={() => setCancelConfirm(false)}
                          className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm touch-manipulation">
                          Назад
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Заморозить клиента */}
          {onFreezeClick && (
            <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-700">Заморозить клиента</p>
                <p className="text-xs text-gray-400">Удержание; остаток — клиенту. Статус → «Заморозка».</p>
              </div>
              <button type="button" onClick={onFreezeClick}
                className="px-3 py-2 rounded-xl text-xs font-medium touch-manipulation"
                style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                Заморозить
              </button>
            </div>
          )}

          {/* Убрать из группы */}
          <div className="border-t border-gray-100 pt-2">
            {!leaveConfirm ? (
              <button type="button" onClick={() => { setLeaveConfirm(true); setLeaveErr('') }}
                className="text-xs text-red-500 touch-manipulation py-1">
                Убрать из группы
              </button>
            ) : (
              <div className="space-y-2">
                <div className="p-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <p className="text-xs font-semibold text-red-700">Убрать клиента из основной группы? Оплата не отменяется.</p>
                </div>
                {leaveErr && <p className="text-xs text-red-600">{leaveErr}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={handleLeaveGroup} disabled={leaveLoading}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60 touch-manipulation"
                    style={{ background: '#dc2626' }}>
                    {leaveLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
                    Да, убрать
                  </button>
                  <button type="button" onClick={() => { setLeaveConfirm(false); setLeaveErr('') }}
                    className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm touch-manipulation">
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Ввод/сброс типа оплаты для параллельной записи ───────────────────────────
function EnrollmentConfigureInline({ enrollment, clientId, onUpdate }) {
  const [payType,   setPayType]   = useState(enrollment.payment_type || 'full')
  const [amount,    setAmount]    = useState('')
  const [totalCost, setTotalCost] = useState('')
  const [deadline,  setDeadline]  = useState('')
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')

  const handleSave = async () => {
    if (payType === 'full' && (!amount || Number(amount) <= 0)) { setErr('Укажите сумму'); return }
    if (payType === 'installment' && (!totalCost || Number(totalCost) <= 0)) { setErr('Укажите стоимость'); return }
    if (payType === 'installment' && !deadline) { setErr('Укажите дедлайн'); return }
    setSaving(true); setErr('')
    try {
      const res = await api.post(`/clients/${clientId}/enrollments/${enrollment.id}/configure/`, {
        payment_type: payType,
        ...(payType === 'full' ? { payment_amount: amount } : { total_cost: totalCost, deadline }),
      })
      if (onUpdate) onUpdate(res.data)
    } catch (e) {
      const d = e.response?.data
      setErr(d?.detail || (typeof d === 'object' ? JSON.stringify(d) : null) || 'Ошибка')
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Введите тип и сумму оплаты</p>
      <div className="flex gap-2">
        {[{ v: 'full', l: 'Полная' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
          <button key={v} type="button" onClick={() => setPayType(v)}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
            style={payType === v
              ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
              : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
            {l}
          </button>
        ))}
      </div>
      {payType === 'full' ? (
        <input type="number" min="0" step="100" placeholder="Сумма (сом)"
          value={amount} onChange={e => setAmount(e.target.value)} className="crm-mobile-input w-full" />
      ) : (
        <div className="space-y-2">
          <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)"
            value={totalCost} onChange={e => setTotalCost(e.target.value)} className="crm-mobile-input w-full" />
          <DatePickerInput value={deadline} onChange={e => setDeadline(e.target.value)} />
        </div>
      )}
      {err && <p className="text-xs text-red-600 mt-1">{err}</p>}
      <button type="button" onClick={handleSave} disabled={saving}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
        style={{ background: 'linear-gradient(135deg,#7c3aed,#be185d)' }}>
        {saving
          ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : <Check size={16} />}
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
    </div>
  )
}

// ── Параллельная группа — аккордеон ──────────────────────────────────────────
function ParallelEnrollmentBlock({ enrollment, clientId, onSuccess, onUpdate }) {
  const [open,              setOpen]              = useState(false)
  const [payOpen,           setPayOpen]           = useState(false)
  const [removing,          setRemoving]          = useState(false)
  const [confirmRemove,     setConfirmRemove]     = useState(false)
  const [cancelPayConfirm,  setCancelPayConfirm]  = useState(false)
  const [cancelPayLoading,  setCancelPayLoading]  = useState(false)
  const [showConfigure,     setShowConfigure]     = useState(false)
  const [err,               setErr]               = useState('')
  const [freezeOpen,        setFreezeOpen]        = useState(false)
  const [freezeRetention,   setFreezeRetention]   = useState('')
  const [freezeLoading,     setFreezeLoading]     = useState(false)
  const [freezeErr,         setFreezeErr]         = useState('')

  const amountPaid = Number(enrollment.amount_paid || 0)
  const total = enrollment.payment_type === 'full'
    ? Number(enrollment.payment_amount || 0)
    : Number(enrollment.total_cost || 0)
  const rem = total - amountPaid
  const pct = total > 0 ? Math.min(Math.round(amountPaid / total * 100), 100) : 0
  const fmt = enrollment.group_training_format || 'offline'
  const fmtLabel = fmt === 'online' ? 'Онлайн' : 'Оффлайн'
  // showConfigure — explicitly set by cancel action; also true when backend nulled out config
  const needsConfigure = showConfigure || (!enrollment.payment_amount && !enrollment.total_cost)

  const handleRemove = async () => {
    setRemoving(true); setErr('')
    try {
      await api.delete(`/clients/${clientId}/enrollments/${enrollment.id}/remove/`)
      onSuccess()
    } catch (e) {
      const d = e.response?.data
      setErr(d?.detail || (typeof d === 'object' ? JSON.stringify(d) : null) || 'Ошибка')
    } finally { setRemoving(false) }
  }

  const handleCancelEnrollmentPayment = async () => {
    setCancelPayLoading(true); setErr('')
    try {
      const res = await api.post(`/clients/${clientId}/enrollments/${enrollment.id}/cancel-payment/`)
      setCancelPayConfirm(false)
      setShowConfigure(true)   // immediately show configure form, like primary block
      if (onUpdate) onUpdate(res.data)
    } catch (e) {
      const d = e.response?.data
      setErr(d?.detail || (typeof d === 'object' ? JSON.stringify(d) : null) || 'Ошибка')
    } finally { setCancelPayLoading(false) }
  }

  const handleConfigureDone = (updated) => {
    setShowConfigure(false)
    if (onUpdate) onUpdate(updated)
  }

  const totalPaidForFreeze = Number(enrollment.amount_paid || 0)

  const handleFreeze = async () => {
    const r = parseFloat(String(freezeRetention).replace(',', '.')) || 0
    if (r < 0 || r > totalPaidForFreeze + 1e-9) { setFreezeErr('Некорректная сумма удержания'); return }
    setFreezeLoading(true); setFreezeErr('')
    try {
      await api.post(
        `/clients/${clientId}/enrollments/${enrollment.id}/freeze/`,
        { retention_amount: String(r) }
      )
      setFreezeOpen(false)
      if (onSuccess) onSuccess()
    } catch (e) {
      const d = e.response?.data
      setFreezeErr(d?.detail || (typeof d === 'object' ? JSON.stringify(d) : null) || 'Ошибка')
    } finally { setFreezeLoading(false) }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1.5px solid #e9d5ff' }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between p-4 touch-manipulation text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: fmt === 'online' ? '#ecfdf5' : '#f3e8ff' }}>
            {fmt === 'online'
              ? <Globe size={18} style={{ color: '#059669' }} />
              : <Dumbbell size={18} style={{ color: '#7c3aed' }} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="font-semibold text-gray-800 text-sm">Группа #{enrollment.group_number}</p>
              {enrollment.trainer_name && <span className="text-xs text-gray-500">· {enrollment.trainer_name}</span>}
              <span className="text-xs font-medium px-1.5 py-0.5 rounded-full" style={{ background: '#f3e8ff', color: '#7c3aed' }}>доп.</span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {fmtLabel}
              {enrollment.group_type ? ` · ${GROUP_TYPE_LABEL[enrollment.group_type] || enrollment.group_type}` : ''}
              {' · '}
              {needsConfigure
                ? <span className="text-amber-500 font-medium">Нужна оплата</span>
                : enrollment.is_fully_paid
                  ? <span className="text-emerald-600">Оплачено</span>
                  : total > 0
                    ? <span className="text-amber-600">{pct}% оплачено</span>
                    : <span className="text-gray-400">Без суммы</span>
              }
            </p>
          </div>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-400 shrink-0" /> : <ChevronDown size={18} className="text-gray-400 shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-5 border-t border-gray-100 space-y-3 pt-3">
          {needsConfigure ? (
            <EnrollmentConfigureInline
              enrollment={enrollment}
              clientId={clientId}
              onUpdate={handleConfigureDone}
            />
          ) : (
            <>
              <div className="bg-gray-50 rounded-xl p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Тип оплаты</span>
                  <span className="text-gray-700">{enrollment.payment_type === 'full' ? 'Полная' : 'Рассрочка'}</span>
                </div>
                {enrollment.payment_type === 'full' && enrollment.payment_amount && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Сумма</span>
                    <span className="crm-money">{fmtMoney(enrollment.payment_amount)}</span>
                  </div>
                )}
                {enrollment.payment_type === 'installment' && (
                  <>
                    {enrollment.total_cost && <div className="flex justify-between"><span className="text-gray-500">Стоимость</span><span className="crm-money">{fmtMoney(enrollment.total_cost)}</span></div>}
                    {enrollment.deadline && <div className="flex justify-between"><span className="text-gray-500">Дедлайн</span><span className="text-gray-700">{enrollment.deadline}</span></div>}
                  </>
                )}
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="text-gray-500">Оплачено</span>
                  <span className={`crm-money ${amountPaid > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>{fmtMoney(amountPaid)}</span>
                </div>
                {total > 0 && rem > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Остаток</span>
                    <span className="crm-money text-red-500">{fmtMoney(rem)}</span>
                  </div>
                )}
              </div>

              {total > 0 && (
                <div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? '#10b981' : '#8b5cf6' }} />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct}% оплачено</p>
                </div>
              )}

              {enrollment.payments?.length > 0 && (
                <div className="border-t border-gray-100 pt-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">История платежей</p>
                  <div className="space-y-1.5">
                    {enrollment.payments.map(p => (
                      <div key={p.id} className="flex items-center justify-between py-1.5 px-2 bg-gray-50 rounded-lg text-xs gap-2">
                        <span className="text-gray-400 shrink-0">{p.paid_at || (p.created_at ? fmtDateTime(p.created_at) : '—')}</span>
                        <span className="crm-money flex-1 text-right">{fmtMoney(p.amount)}</span>
                        {p.receipt
                          ? <a href={toAbsoluteUrl(p.receipt)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 font-semibold shrink-0"><Receipt size={11} /> Чек</a>
                          : <span className="text-gray-300 shrink-0">—</span>
                        }
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!enrollment.is_fully_paid && (
                <div className="border-t border-gray-100 pt-3">
                  {!payOpen ? (
                    <button type="button" onClick={() => setPayOpen(true)}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-emerald-700 touch-manipulation"
                      style={{ background: '#ecfdf5', border: '1px solid #6ee7b7' }}>
                      + Добавить платёж
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        {enrollment.payment_type === 'full' ? 'Подтвердить оплату' : 'Новый платёж'}
                      </p>
                      <EnrollmentPaymentForm
                        enrollment={enrollment}
                        clientId={clientId}
                        onDone={updated => {
                          setPayOpen(false)
                          if (onUpdate) onUpdate(updated)
                        }}
                      />
                      <button type="button" onClick={() => setPayOpen(false)}
                        className="w-full py-2 text-sm text-gray-500 touch-manipulation text-center">
                        Отмена
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Заморозить эту запись */}
              <div className="border-t border-gray-100 pt-3">
                {!freezeOpen ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-700">Заморозить эту запись</p>
                      <p className="text-xs text-gray-400">Удержание за посещения; остаток — клиенту. Статус → «Акт.+Заморозка».</p>
                    </div>
                    <button type="button" onClick={() => { setFreezeOpen(true); setFreezeRetention(''); setFreezeErr('') }}
                      className="px-3 py-2 rounded-xl text-xs font-medium touch-manipulation shrink-0 ml-2"
                      style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>
                      Заморозить
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 p-3 rounded-xl" style={{ background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                    <p className="text-sm font-semibold text-sky-800">Заморозить запись в группе #{enrollment.group_number}</p>
                    {totalPaidForFreeze > 0 && (
                      <div className="flex justify-between text-xs py-1 border-b border-sky-100">
                        <span className="text-sky-700">Оплачено по этой группе</span>
                        <span className="font-semibold text-sky-900">{fmtMoney(totalPaidForFreeze)}</span>
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-medium text-sky-700 mb-1">Сумма удержания (за посещённые занятия)</label>
                      <input type="number" min="0" max={totalPaidForFreeze} step="0.01"
                        value={freezeRetention} onChange={e => setFreezeRetention(e.target.value)}
                        placeholder="0 — всё вернуть"
                        className="crm-mobile-input w-full" />
                    </div>
                    {freezeRetention !== '' && !isNaN(parseFloat(freezeRetention)) && (
                      <div className="flex justify-between text-xs py-1.5 px-3 rounded-lg"
                        style={{ background: '#ecfdf5', border: '1px solid #a7f3d0' }}>
                        <span className="text-emerald-800">К возврату клиенту</span>
                        <span className="font-bold text-emerald-700">
                          {fmtMoney(Math.max(0, totalPaidForFreeze - (parseFloat(freezeRetention) || 0)))}
                        </span>
                      </div>
                    )}
                    {freezeErr && <p className="text-xs text-red-600">{freezeErr}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={handleFreeze} disabled={freezeLoading}
                        className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-white disabled:opacity-60 touch-manipulation"
                        style={{ background: '#0369a1' }}>
                        {freezeLoading ? '...' : 'Заморозить'}
                      </button>
                      <button type="button" onClick={() => setFreezeOpen(false)}
                        className="flex-1 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-600 touch-manipulation">
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Отменить оплату — только когда есть платежи */}
              {Number(enrollment.amount_paid || 0) > 0 && (
                <div className="border-t border-gray-100 pt-2">
                  {!cancelPayConfirm ? (
                    <button type="button" onClick={() => setCancelPayConfirm(true)}
                      className="text-xs text-amber-600 touch-manipulation py-1">
                      Отменить оплату
                    </button>
                  ) : (
                    <div className="space-y-2 p-3 rounded-xl" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                      <p className="text-xs text-amber-800 font-semibold">Сбросить все платежи по этой группе?</p>
                      <p className="text-xs text-amber-700">Платежи будут удалены, можно ввести заново.</p>
                      {err && <p className="text-xs text-red-600">{err}</p>}
                      <div className="flex gap-2">
                        <button type="button" onClick={handleCancelEnrollmentPayment} disabled={cancelPayLoading}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60 touch-manipulation"
                          style={{ background: '#d97706' }}>
                          {cancelPayLoading ? '...' : 'Сбросить'}
                        </button>
                        <button type="button" onClick={() => { setCancelPayConfirm(false); setErr('') }}
                          className="px-4 py-2 rounded-xl border border-gray-300 text-xs text-gray-600 touch-manipulation">
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Убрать из группы — всегда */}
          <div className="border-t border-gray-100 pt-2">
            {!confirmRemove ? (
              <button type="button" onClick={() => setConfirmRemove(true)}
                className="text-xs text-red-500 touch-manipulation py-1">
                Убрать из группы
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <p className="text-xs text-red-700 font-semibold">Убрать из группы #{enrollment.group_number}?</p>
                {err && <p className="text-xs text-red-600">{err}</p>}
                <div className="flex gap-2">
                  <button type="button" onClick={handleRemove} disabled={removing}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-60 touch-manipulation"
                    style={{ background: '#dc2626' }}>
                    {removing ? '...' : 'Убрать'}
                  </button>
                  <button type="button" onClick={() => setConfirmRemove(false)}
                    className="px-4 py-2 rounded-xl border border-gray-300 text-xs text-gray-600 touch-manipulation">
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Добавить в параллельную группу ────────────────────────────────────────────
function AddEnrollmentPanel({ client, clientId, onSuccess }) {
  const [open,          setOpen]          = useState(false)
  const [format,        setFormat]        = useState('offline')
  const [statusFilter,  setStatusFilter]  = useState('recruitment')
  const [groups,        setGroups]        = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [payType,       setPayType]       = useState('full')
  const [payAmount,     setPayAmount]     = useState('')
  const [totalCost,     setTotalCost]     = useState('')
  const [deadline,      setDeadline]      = useState('')
  const [bonusPercent,  setBonusPercent]  = useState(String(bonusPercentDisplay(client.bonus_percent)))
  const [note,          setNote]          = useState('')
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState('')

  const enrolledGroupIds = new Set([
    client.group?.id,
    ...(client.parallel_enrollments || []).map(e => e.group),
  ].filter(Boolean))

  const loadGroups = async (fmt, st) => {
    setGroupsLoading(true); setSelectedGroup(null)
    try {
      const r = await api.get('/groups/', { params: { status: st, page_size: 100, training_format: fmt } })
      setGroups((r.data.results || []).filter(g => !enrolledGroupIds.has(g.id)))
    } catch { setGroups([]) } finally { setGroupsLoading(false) }
  }

  const handleOpen = () => {
    setOpen(true); setFormat('offline'); setStatusFilter('recruitment')
    setSelectedGroup(null); setPayType('full'); setPayAmount(''); setTotalCost('')
    setDeadline(''); setBonusPercent(String(bonusPercentDisplay(client.bonus_percent))); setNote('')
    setErr(''); loadGroups('offline', 'recruitment')
  }

  const handleSubmit = async () => {
    if (!selectedGroup) { setErr('Выберите группу'); return }
    if (payType === 'full' && (!payAmount || Number(payAmount) <= 0)) { setErr('Укажите сумму'); return }
    if (payType === 'installment' && (!totalCost || !deadline)) { setErr('Укажите стоимость и дедлайн'); return }
    const bp = parseInt(String(bonusPercent).trim(), 10)
    if (Number.isNaN(bp) || bp < 0 || bp > 100) { setErr('Процент бонуса: 0–100'); return }
    setSaving(true); setErr('')
    try {
      await api.post(`/clients/${clientId}/enrollments/create/`, {
        group_id: selectedGroup.id,
        payment_type: payType,
        ...(payType === 'full' ? { payment_amount: payAmount } : { total_cost: totalCost, deadline }),
        bonus_percent: bp,
        note: note.trim(),
      })
      setOpen(false); onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || JSON.stringify(e.response?.data) || 'Ошибка')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '2px dashed #c4b5fd' }}>
      {!open ? (
        <button type="button" onClick={handleOpen}
          className="w-full flex items-center justify-center gap-2 p-4 touch-manipulation">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold"
               style={{ background: 'linear-gradient(135deg,#7c3aed,#be185d)' }}>+</div>
          <span className="font-semibold text-sm" style={{ color: '#7c3aed' }}>Добавить группу</span>
        </button>
      ) : (
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800 text-sm">Добавить в группу</h3>
            <button type="button" onClick={() => setOpen(false)} className="text-gray-400 touch-manipulation p-1">
              <X size={18} />
            </button>
          </div>

          <div className="flex gap-2">
            {[{ v: 'offline', icon: <Dumbbell size={15} />, l: 'Оффлайн' }, { v: 'online', icon: <Globe size={15} />, l: 'Онлайн' }].map(({ v, icon, l }) => (
              <button key={v} type="button"
                onClick={() => { setFormat(v); setSelectedGroup(null); loadGroups(v, statusFilter) }}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-semibold border-2 touch-manipulation transition"
                style={format === v
                  ? { background: '#ede9fe', borderColor: '#7c3aed', color: '#7c3aed' }
                  : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }
                }>
                {icon} {l}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {[{ v: 'recruitment', l: 'Набор' }, { v: 'active', l: 'Активный' }].map(({ v, l }) => (
              <button key={v} type="button"
                onClick={() => { setStatusFilter(v); setSelectedGroup(null); loadGroups(format, v) }}
                className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition touch-manipulation ${
                  statusFilter === v ? 'border-pink-600 bg-pink-50 text-pink-700' : 'border-gray-200 text-gray-500'
                }`}>
                {l}
              </button>
            ))}
          </div>

          {groupsLoading ? (
            <div className="flex justify-center py-4">
              <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#7c3aed' }} />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">Нет доступных групп</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {groups.map(g => (
                <button key={g.id} type="button"
                  onClick={() => setSelectedGroup(selectedGroup?.id === g.id ? null : g)}
                  className="w-full text-left p-3 rounded-xl border-2 transition touch-manipulation"
                  style={selectedGroup?.id === g.id
                    ? { background: '#f3e8ff', borderColor: '#7c3aed' }
                    : { background: '#fafafa', borderColor: '#e5e7eb' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-gray-800">
                        Группа #{g.number}
                        {g.trainer?.full_name && <span className="font-normal text-gray-500 text-xs ml-1">· {g.trainer.full_name}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {GROUP_TYPE_LABEL[g.group_type] || g.group_type || '—'}
                        {' · '}
                        <span className={g.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}>
                          {g.status === 'active' ? 'Активный' : 'Набор'}
                        </span>
                      </p>
                    </div>
                    {selectedGroup?.id === g.id && <Check size={15} style={{ color: '#7c3aed' }} className="shrink-0" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedGroup && (
            <div className="space-y-3 border-t border-dashed border-gray-200 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Оплата — Группа #{selectedGroup.number}
              </p>
              <div className="flex gap-2">
                {[{ v: 'full', l: 'Полная' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
                  <button key={v} type="button" onClick={() => setPayType(v)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                    style={payType === v
                      ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
                      : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
                    {l}
                  </button>
                ))}
              </div>
              {payType === 'full' ? (
                <input type="number" min="0" step="100" placeholder="Сумма (сом)"
                  value={payAmount} onChange={e => setPayAmount(e.target.value)} className="crm-mobile-input w-full" />
              ) : (
                <div className="space-y-2">
                  <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)"
                    value={totalCost} onChange={e => setTotalCost(e.target.value)} className="crm-mobile-input w-full" />
                  <DatePickerInput value={deadline} onChange={e => setDeadline(e.target.value)} />
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Бонус (%)</p>
                <input type="number" min={0} max={100} step={1} value={bonusPercent}
                  onChange={e => setBonusPercent(e.target.value)} className="crm-mobile-input w-full" />
              </div>
              <input type="text" placeholder="Примечание (необяз.)"
                value={note} onChange={e => setNote(e.target.value)} className="crm-mobile-input w-full" />
            </div>
          )}

          {err && (
            <div className="flex items-center gap-2 p-3 rounded-xl text-xs"
                 style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
              <AlertTriangle size={13} /> {err}
            </div>
          )}

          {selectedGroup && (
            <button type="button" onClick={handleSubmit} disabled={saving}
              className="w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#be185d)' }}>
              {saving ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={16} />}
              Добавить в Группу #{selectedGroup.number}
            </button>
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
  const [client, setClient]           = useState(null)
  const [loadError, setLoadError]     = useState(null)
  const [planId, setPlanId]           = useState(null)
  const [newPassword, setNewPassword] = useState(null)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  const [resetError, setResetError]   = useState('')
  const [statusConfirm, setStatusConfirm] = useState(null)
  const [refundOpen, setRefundOpen] = useState(false)
  const [refundMsg, setRefundMsg]     = useState(null)

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

  const handleEnrollmentUpdate = (updated) => {
    setClient(prev => !prev ? prev : {
      ...prev,
      parallel_enrollments: (prev.parallel_enrollments || []).map(e =>
        e.id === updated.id ? updated : e
      ),
    })
  }

  const STATUS_OPTIONS = [
    { value: 'frozen',        label: 'Заморозка',       dot: 'bg-sky-500'  },
    { value: 'active_frozen', label: 'Акт.+Заморозка',  dot: 'bg-teal-500' },
  ]

  const STATUS_ALL_LABELS = {
    active: 'Активный', frozen: 'Заморозка', completed: 'Завершил',
    active_frozen: 'Акт.+Заморозка', new: 'Новый', trial: 'Пробный',
    expelled: 'Отчислен',
  }

  const changeStatus = async (newStatus) => {
    if (newStatus === client.status) { setStatusMenuOpen(false); return }
    setStatusMenuOpen(false)
    setStatusConfirm({ newStatus, label: STATUS_ALL_LABELS[newStatus] || newStatus })
  }

  const resetCabinetPassword = async () => {
    setResetPasswordLoading(true); setNewPassword(null); setResetError('')
    try {
      const r = await api.post(`/clients/${id}/reset_cabinet_password/`)
      setNewPassword(r.data.password); load()
    } catch (e) {
      setResetError(e.response?.data?.detail || e.message || 'Ошибка сброса')
    } finally { setResetPasswordLoading(false) }
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
  const refundTotalPaid = client.payment_type === 'full'
    ? (full?.is_paid ? Number(full.amount) : 0)
    : (plan ? Number(plan.total_paid) : 0)
  const pct = plan && Number(plan.total_cost) > 0
    ? Math.min(Math.round((Number(plan.total_paid) / Number(plan.total_cost)) * 100), 100) : 0
  const justCreatedCreds = location.state?.cabinet

  const allReceipts = []
  if (client.payment_type === 'full' && full)
    allReceipts.push({ id: full.id, date: full.created_at || full.paid_at, amount: full.amount, label: 'Полная оплата', receipt: full.receipt || null })
  if (client.payment_type === 'installment' && plan?.payments?.length)
    plan.payments.forEach((p, i) => {
      allReceipts.push({
        id: p.id, date: p.created_at || p.paid_at, amount: p.amount, label: `Платёж ${i + 1}`, receipt: p.receipt || null,
      })
    })

  return (
    <MobileLayout>
      <div className="space-y-4">
        {justCreatedCreds && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <p className="text-emerald-800 font-semibold text-[15px]">Клиент успешно создан</p>
            <p className="text-emerald-700 text-sm mt-1">
              Логин: <span className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded">{justCreatedCreds.login}</span>
            </p>
            <p className="text-emerald-700 text-sm mt-1">
              Пароль: <span className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded">{justCreatedCreds.password}</span>
            </p>
          </div>
        )}

        <Link to="/mobile/clients"
          className="inline-flex items-center gap-2 text-sm text-blue-600 font-medium touch-manipulation min-h-[44px] -mb-1">
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
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${STATUS_BADGE[client.status] || 'border-gray-200'} disabled:opacity-60`}>
                  {statusLoading
                    ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    : <>
                        {client.status === 'trial' && <FlaskConical size={10} />}
                        {STATUS_LABEL[client.status]}
                      </>
                  }
                  <ChevronDown size={11} />
                </button>
                {statusMenuOpen && (
                  <div className="absolute left-0 top-9 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[160px]">
                    {STATUS_OPTIONS.map(opt => (
                      <button key={opt.value} type="button" onClick={() => changeStatus(opt.value)}
                        className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2.5 transition ${
                          opt.value === client.status ? 'font-semibold text-gray-900 bg-gray-50' : 'text-gray-600 hover:bg-gray-50'
                        }`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!client.group && (
                <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                  {client.training_format === 'online' ? <Globe size={12} /> : <Dumbbell size={12} />}
                  {client.training_format === 'online' ? 'Онлайн' : 'Оффлайн'}
                  {client.group_type ? ` · ${GROUP_TYPE_LABEL[client.group_type] || client.group_type}` : ''}
                </p>
              )}
              {client.training_format === 'online' && client.telegram_link && (
                <p className="text-xs mt-1 flex items-center gap-1 break-all">
                  <Send size={12} style={{ color: '#0ea5e9' }} />
                  <a href={client.telegram_link.startsWith('http') ? client.telegram_link : `https://t.me/${client.telegram_link.replace(/^@/, '')}`}
                     target="_blank" rel="noreferrer" style={{ color: '#0284c7' }} className="underline">
                    {client.telegram_link}
                  </a>
                </p>
              )}
              {client.is_trial && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold mt-1"
                      style={{ background: '#fff7ed', color: '#ea580c', border: '1px solid #fed7aa' }}>
                  <FlaskConical size={10} /> Пробный клиент
                </span>
              )}
              {client.bonus_balance != null && Number(client.bonus_balance) !== 0 && (
                <p className={`text-sm mt-1 flex items-center gap-1 ${Number(client.bonus_balance) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  <Gift size={13} /> {Number(client.bonus_balance) < 0 ? 'Бонус (задолженность)' : 'Бонусы'}: {fmtMoney(client.bonus_balance)}
                </p>
              )}
              <p className="text-sm mt-1 flex items-center gap-1 text-slate-600">
                <Percent size={13} className="shrink-0" />
                Бонус с оплаты: <strong>{bonusPercentDisplay(client.bonus_percent)}%</strong> (начислится после подтверждения оплаты)
              </p>
              {client.cabinet_username && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-400 break-all">
                    Логин: <span className="font-mono font-bold">{client.cabinet_username}</span>
                  </p>
                  {(newPassword || client.cabinet_password) && (
                    <p className={`text-xs break-all ${newPassword ? 'text-green-700' : 'text-gray-400'}`}>
                      {newPassword ? 'Новый пароль: ' : 'Пароль: '}
                      <span className={`font-mono font-bold px-1 rounded ${newPassword ? 'bg-green-100' : 'bg-gray-100'}`}>
                        {newPassword || client.cabinet_password}
                      </span>
                    </p>
                  )}
                  <p className="text-xs text-gray-500">
                    Вход: <a href="/cabinet" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">/cabinet</a>
                  </p>
                  {resetError && <p className="text-xs text-red-500">{resetError}</p>}
                  <button type="button" onClick={resetCabinetPassword} disabled={resetPasswordLoading}
                    className="text-xs text-blue-600 hover:underline disabled:opacity-60">
                    {resetPasswordLoading ? 'Создаём...' : 'Сбросить пароль'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Заметка */}
        {client.notes && (
          <div className="bg-amber-50 rounded-2xl p-4 shadow-sm border border-amber-100">
            <p className="text-xs font-semibold text-amber-700 mb-1 uppercase tracking-wide">Заметка</p>
            <p className="text-sm text-amber-900 whitespace-pre-wrap">{client.notes}</p>
          </div>
        )}

        {/* Группы и оплата */}
        {client.group ? (
          <>
            <PrimaryGroupBlock client={client} clientId={id} planId={planId} onSuccess={load} onFreezeClick={() => setRefundOpen(true)} />
            {(client.parallel_enrollments || []).map(e => (
              <ParallelEnrollmentBlock key={e.id} enrollment={e} clientId={id} onSuccess={load} onUpdate={handleEnrollmentUpdate} />
            ))}
            <AddEnrollmentPanel client={client} clientId={id} onSuccess={load} />
          </>
        ) : (
          <>

        {/* Оплата (для клиентов без группы: trial/new) */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border">
          <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
            <CreditCard size={18} /> Оплата
          </h3>
          {client.payment_type === 'full' && full && (
            <div className="space-y-3">
              {full.course_amount != null && Number(full.course_amount) !== Number(full.amount) && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Сумма курса</span>
                  <span className="crm-money font-semibold">{fmtMoney(full.course_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  {full.course_amount != null && Number(full.course_amount) !== Number(full.amount) ? 'К оплате' : 'Сумма'}
                </span>
                <span className="crm-money font-semibold">{fmtMoney(full.amount)}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-gray-500">Статус</span>
                <span className={`font-medium flex items-center gap-1 ${full.is_paid ? 'text-green-600' : 'text-red-500'}`}>
                  {full.is_paid ? <><CheckCircle size={14} /> Оплачено</> : <><Clock size={14} /> Не оплачено</>}
                </span>
              </div>
              {full.receipt && (
                <a href={toAbsoluteUrl(full.receipt)} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-blue-500 text-sm">
                  <Receipt size={14} /> Открыть чек →
                </a>
              )}
              {!full.is_paid && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Подтвердить оплату</p>
                  <ConfirmFullPaymentForm clientId={id} amount={full.amount} onSuccess={load} />
                </div>
              )}
            </div>
          )}
          {client.payment_type === 'installment' && plan && (() => {
            const rem = Number(plan.remaining); const isOverpaid = rem < 0; const isDone = rem <= 0
            return (
              <div className="space-y-3 text-sm">
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between"><span className="text-gray-500">Общая стоимость</span><span className="crm-money text-gray-800">{fmtMoney(plan.total_cost)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Оплачено</span><span className="crm-money text-green-600">{fmtMoney(plan.total_paid)}</span></div>
                  <div className="border-t border-gray-200 pt-2 flex justify-between">
                    {isOverpaid ? <><span className="text-gray-500">Переплата</span><span className="text-amber-600 font-semibold">+{fmtMoney(Math.abs(rem))}</span></> : <><span className="text-gray-500">Остаток</span><span className={`crm-money ${isDone ? 'text-green-600' : 'text-red-500'}`}>{isDone ? '—' : fmtMoney(rem)}</span></>}
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
                <div className="flex justify-between"><span className="text-gray-500">Дедлайн</span><span className="text-gray-700">{plan.deadline}</span></div>
                {plan.payments?.length > 0 && (
                  <div className="pt-1 border-t border-gray-100">
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-2">История платежей</p>
                    <div className="space-y-1">
                      {plan.payments.map((p, i) => (
                        <div key={p.id} className="flex justify-between items-center text-xs py-1.5 px-2 rounded-lg hover:bg-gray-50 gap-3">
                          <span className="text-gray-400 shrink-0">{p.paid_at}</span>
                          <span className="crm-money text-gray-700 flex-1 text-right">{fmtMoney(p.amount)}</span>
                          {p.receipt ? <a href={toAbsoluteUrl(p.receipt)} target="_blank" rel="noreferrer" className="text-blue-500 flex items-center gap-1"><Receipt size={11} /> Чек</a> : <span className="text-gray-300">—</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
          {!full && !plan && <p className="text-sm text-gray-400 text-center py-4">Оплата не введена</p>}
        </div>

        {/* Добавить платёж (рассрочка) — сразу после блока Оплаты */}
        {client.payment_type === 'installment' && plan && Number(plan.remaining) > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-medium text-gray-700 mb-3">Добавить платёж</h3>
            <AddPaymentForm planId={planId} onSuccess={load} />
          </div>
        )}

          </>
        )}

        {/* Редактировать (с переключателем Пробный/Обычный) */}
        <MobileEditInfoPanel client={client} clientId={id} onSuccess={load} />

        {/* Отменить оплату — только для клиентов без группы (с группой — внутри PrimaryGroupBlock) */}
        {!client.group && <MobileCancelPaymentPanel client={client} clientId={id} onSuccess={load} />}

        {/* Добавить в группу: шаг1 выбрать группу, шаг2 оплата, submit в правильном порядке */}
        <MobileNewClientAddPanel client={client} clientId={id} onSuccess={load} />

        {/* Ввести оплату: показывается для new/trial без оплаты (после cancel или пробного) */}
        <MobileEnterPaymentPanel client={client} clientId={id} onSuccess={load} />

        {/* Бронь следующей группы */}
        <MobileReservationPanel client={client} clientId={id} onSuccess={load} />

        {/* История группы */}
        <MobileStreamsHistory client={client} clientId={id} />

        {/* История статусов */}
        <MobileStatusHistory clientId={id} />

        {/* История платежей (только для клиентов без основной группы) */}
        {!client.group && allReceipts.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-medium text-gray-700 mb-3 flex items-center gap-2"><Receipt size={18} /> История платежей</h3>
            <div className="space-y-2">
              {allReceipts.map((r, i) => (
                <div key={`receipt-${r.id}-${i}`}
                  className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2 px-3 bg-gray-50 rounded-xl text-sm gap-2">
                  <span className="text-gray-400 text-xs">{r.date ? fmtDateTime(r.date) : '—'}</span>
                  <span className="crm-money break-words">{r.label} — {fmtMoney(r.amount)}</span>
                  {r.receipt ? <a href={toAbsoluteUrl(r.receipt)} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"><Receipt size={13} /> Открыть чек →</a>
                    : <span className="text-gray-400 text-xs">Чек не прикреплён</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Повторный клиент */}
        <MobileRepeatPanel client={client} clientId={id} onSuccess={load} />

        {/* Заморозить — только для клиентов без группы (с группой — внутри PrimaryGroupBlock) */}
        {!client.group && (client.status === 'active' || client.status === 'new' || client.status === 'trial') && (
          <div className="bg-white rounded-2xl shadow-sm border p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800 text-sm">Заморозить клиента</p>
                <p className="text-xs text-gray-400">Удержание за занятия; остаток — клиенту. Статус станет «Заморозка».</p>
              </div>
              <button type="button" onClick={() => setRefundOpen(true)}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-sky-50 text-sky-600 border border-sky-200 touch-manipulation">
                Заморозить
              </button>
            </div>
          </div>
        )}

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
                await load()
              } catch { } finally { setStatusLoading(false) }
            }}
            onClose={() => setStatusConfirm(null)}
          />
        )}

        <RefundModal
          open={refundOpen}
          onClose={() => setRefundOpen(false)}
          clientName={client.full_name}
          totalPaid={refundTotalPaid}
          paymentLabel={client.payment_type === 'full' ? 'полная оплата' : 'рассрочка'}
          onConfirm={async (retention) => {
            try {
              const r = await api.post(`/clients/${id}/refund/`, { retention_amount: String(retention) })
              setRefundOpen(false)
              if (r.data.action === 'deleted') { navigate('/mobile/clients') }
              else { setRefundMsg({ type: 'success', text: r.data.detail }); load() }
            } catch (e) {
              setRefundOpen(false)
              setRefundMsg({ type: 'error', text: e.response?.data?.detail || 'Ошибка' })
            }
          }}
        />

        {refundMsg && (
          <div className={`p-3 rounded-xl text-sm border ${
            refundMsg.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'
          }`}>{refundMsg.text}</div>
        )}
      </div>
    </MobileLayout>
  )
}
