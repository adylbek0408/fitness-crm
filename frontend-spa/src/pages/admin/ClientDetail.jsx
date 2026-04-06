import { useState, useEffect } from 'react'
import { useParams, Link, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import {
  KeyRound, Globe, Dumbbell, CreditCard, CheckCircle,
  Clock, Receipt, Snowflake, ArrowLeft, Copy, Check,
  RotateCcw, User, Phone, Calendar, Layers, UserCircle, Gift,
  TrendingUp, TrendingDown, History, ChevronDown, ChevronUp, ChevronRight,
  Undo2, XCircle, GraduationCap, ShieldOff, AlertTriangle, UserPlus, Percent
} from 'lucide-react'
import {
  STATUS_BADGE, STATUS_LABEL, fmtMoney, GROUP_TYPE_LABEL,
  toAbsoluteUrl, fmtDateTime
} from '../../utils/format'
import AddPaymentForm from '../../components/payments/AddPaymentForm'
import ConfirmFullPaymentForm from '../../components/payments/ConfirmFullPaymentForm'
import ConfirmModal from '../../components/ConfirmModal'
import AlertModal from '../../components/AlertModal'
import RefundModal from '../../components/RefundModal'

const GROUP_TYPE_SHORT = { '1.5h': '1.5 ч', '2.5h': '2.5 ч' }

/** Для отображения: null/undefined → 10%; 0 остаётся 0 (в БД явно задано). В отличие от ??, ноль не подменяется. */
function bonusPercentDisplay(bp) {
  return bp === null || bp === undefined ? 10 : bp
}

// ── Утилиты ────────────────────────────────────────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} className="p-1.5 rounded-lg hover:bg-slate-100 transition text-slate-400 hover:text-indigo-500">
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  )
}

function InfoRow({ icon: Icon, label, value, color, extra }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-50 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
        <Icon size={14} className="text-slate-400" />
      </div>
      <span className="text-sm text-slate-500 flex-1">{label}</span>
      <span className={`text-sm font-medium text-right ${color || 'text-slate-800'}`}>
        {value || '—'}
      </span>
      {extra}
    </div>
  )
}

// ── История групп ───────────────────────────────────────────────────────────────
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
      <div className="flex items-center gap-3 py-3 cursor-pointer group" onClick={toggle}>
        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
          <Layers size={14} className="text-slate-400" />
        </div>
        <span className="text-sm text-slate-500 flex-1">Группы</span>
        <div className="flex items-center gap-2">
          {client.group
            ? <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                Группа #{client.group.number}
              </span>
            : <span className="text-sm font-medium text-slate-400">—</span>
          }
          {open
            ? <ChevronUp size={14} className="text-slate-400" />
            : <ChevronDown size={14} className="text-slate-400 group-hover:text-indigo-400 transition" />
          }
        </div>
      </div>

      {open && (
        <div className="ml-11 mb-4 space-y-2">
          {loading ? (
            <div className="flex justify-center py-4">
              <span className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {client.group && (
                <div className="flex items-center justify-between px-3 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <span className="text-xs font-semibold text-indigo-700">
                    Группа #{client.group.number}
                    <span className="ml-1.5 font-normal text-indigo-400">
                      {GROUP_TYPE_SHORT[client.group.group_type] || client.group.group_type}
                    </span>
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-200 text-indigo-700 font-semibold">
                    Текущий
                  </span>
                </div>
              )}
              {history.length === 0 ? (
                <p className="text-xs text-slate-400 py-2 text-center">Прошлых групп нет</p>
              ) : history.map(h => (
                <div key={h.id} className="rounded-xl overflow-hidden border border-slate-100">
                  <div
                    onClick={() => setSelected(s => s?.id === h.id ? null : h)}
                    className="flex items-center justify-between px-3 py-2.5 bg-slate-50 cursor-pointer hover:bg-slate-100 transition"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-700">Группа #{h.group_number}</span>
                      <span className="text-xs text-slate-400">{GROUP_TYPE_SHORT[h.group_type] || h.group_type}</span>
                      <span className="text-xs text-slate-300">·</span>
                      <span className="text-xs text-slate-400">{h.ended_at}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-semibold ${h.payment_is_closed ? 'text-emerald-600' : 'text-red-500'}`}>
                        {h.payment_is_closed ? '✓ Оплачено' : '⚠ Долг'}
                      </span>
                      {selected?.id === h.id
                        ? <ChevronUp size={12} className="text-slate-400" />
                        : <ChevronRight size={12} className="text-slate-400" />
                      }
                    </div>
                  </div>
                  {selected?.id === h.id && (
                    <div className="px-3 py-3 bg-white space-y-2">
                      {[
                        ['Тренер',      h.trainer_name || '—'],
                        ['Старт',       h.start_date || '—'],
                        ['Тип оплаты',  h.payment_type === 'full' ? 'Полная' : 'Рассрочка'],
                        ['Сумма курса', fmtMoney(h.payment_amount)],
                        ['Оплачено',    fmtMoney(h.payment_paid)],
                      ].map(([lbl, val]) => (
                        <div key={lbl} className="flex justify-between text-xs">
                          <span className="text-slate-400">{lbl}</span>
                          <span className="font-medium text-slate-700">{val}</span>
                        </div>
                      ))}
                      {h.receipts && h.receipts.length > 0 && (
                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Чеки</p>
                          {h.receipts.map((rec, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div className="flex flex-col">
                                <span className="text-slate-500">{rec.label}</span>
                                {rec.paid_at && <span className="text-slate-300">{rec.paid_at}</span>}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-medium text-slate-700">{fmtMoney(rec.amount)}</span>
                                {rec.url
                                  ? <a href={toAbsoluteUrl(rec.url)} target="_blank" rel="noreferrer"
                                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-semibold transition">
                                      <Receipt size={11} /> Чек
                                    </a>
                                  : <span className="text-slate-300">Без чека</span>
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

// ── Клиент «Новый»: добавить в группу (оплата закрыта, без новой оплаты) ───────
function NewClientAddToGroupPanel({ client, clientId, onSuccess }) {
  const [open, setOpen] = useState(false)
  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('recruitment')
  const [loadingId, setLoadingId] = useState(null)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const fp = client.full_payment
  const ip = client.installment_plan
  const isPaymentClosed =
    (client.payment_type === 'full' && !!fp?.is_paid) ||
    (client.payment_type === 'installment' && !!ip?.is_closed)

  const canUseNewClientFlow =
    (client.status === 'new' || (client.status === 'frozen' && !client.is_repeat))
    && !client.group

  if (!canUseNewClientFlow) return null

  const loadGroups = async (st) => {
    setGroupsLoading(true); setErr('')
    try {
      const r = await api.get('/groups/', {
        params: {
          status: st,
          page_size: 100,
          training_format: client.training_format,
          ...(client.training_format === 'offline' ? { group_type: client.group_type } : {}),
        },
      })
      const list = r.data.results || []
      const tf = client.training_format
      const gt = (client.group_type || '').trim()
      setGroups(
        list.filter(g => {
          if (g.training_format !== tf) return false
          if (tf === 'online' && !gt) return true
          return g.group_type === gt
        })
      )
    } catch {
      setGroups([])
    } finally {
      setGroupsLoading(false)
    }
  }

  const handleOpen = () => {
    setOpen(v => !v); setMsg(''); setErr('')
    if (!open) loadGroups(statusFilter)
  }

  const switchFilter = (st) => {
    setStatusFilter(st); loadGroups(st)
  }

  const addToGroup = async (groupId) => {
    setLoadingId(groupId); setErr('')
    try {
      await api.post(`/clients/${clientId}/add-to-group/`, { group_id: groupId })
      setMsg('Клиент добавлен в группу')
      setOpen(false)
      onSuccess()
    } catch (e) {
      setErr(e.response?.data?.detail || 'Ошибка')
    } finally {
      setLoadingId(null)
    }
  }

  if (!isPaymentClosed) {
    const remainingDebt =
      client.payment_type === 'installment' && ip
        ? ` Остаток: ${fmtMoney(ip.remaining)}.`
        : ' Оплата не подтверждена.'
    const afterRefundHint =
      client.status === 'frozen' && !fp && !ip
        ? ' После возврата оформите новую оплату в блоке «Повторный клиент», затем при необходимости добавьте в группу без нового платежа из этой карточки.'
        : ''
    return (
      <div className="crm-card p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <UserPlus size={15} className="text-violet-600" />
          </div>
          <h3 className="font-bold text-slate-800">Новый клиент</h3>
        </div>
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Добавление в группу недоступно</p>
            <p className="text-xs text-amber-700 mt-1">
              {afterRefundHint || `Сначала полностью закройте оплату.${remainingDebt}`}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="crm-card p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
          <UserPlus size={15} className="text-violet-600" />
        </div>
        <h3 className="font-bold text-slate-800">Новый клиент — в группу</h3>
      </div>
      <p className="text-xs text-slate-500 mb-3">
        {client.training_format === 'online' && !(client.group_type || '').trim()
          ? 'Группы подходят под формат клиента (онлайн). Оплата закрыта — запись без повторного платежа.'
          : `Группы подходят под тип (${GROUP_TYPE_LABEL[client.group_type] || '—'}) и формат клиента. Оплата закрыта — запись без повторного платежа.`}
      </p>
      {msg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 mb-3 flex items-center gap-2">
          <Check size={15} /> {msg}
        </div>
      )}
      <button type="button" onClick={handleOpen} className="crm-btn-secondary w-full justify-center gap-2">
        <UserPlus size={14} /> {open ? 'Скрыть' : 'Добавить в группу'}
      </button>
      {open && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            {[
              { val: 'recruitment', label: 'Набор' },
              { val: 'active', label: 'Активный' },
            ].map(({ val, label }) => (
              <button
                key={val}
                type="button"
                onClick={() => switchFilter(val)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition ${
                  statusFilter === val
                    ? 'bg-violet-50 border-violet-400 text-violet-700'
                    : 'bg-white border-slate-200 text-slate-500'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {groupsLoading ? (
            <div className="flex justify-center py-6">
              <span className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
              Нет подходящих групп
            </p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {groups.map(g => (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white"
                >
                  <div>
                    <p className="font-semibold text-slate-800 text-sm">
                      Группа #{g.number}
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        {g.group_type ? GROUP_TYPE_LABEL[g.group_type] : ''}
                        {g.training_format === 'online' ? ' · онлайн' : ' · офлайн'}
                      </span>
                    </p>
                    <p className="text-xs text-slate-400">{g.trainer?.full_name || '—'}</p>
                  </div>
                  <button
                    type="button"
                    disabled={!!loadingId}
                    onClick={() => addToGroup(g.id)}
                    className="crm-btn-primary text-xs py-2 px-3 shrink-0 disabled:opacity-60"
                  >
                    {loadingId === g.id ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                    ) : (
                      'Добавить'
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      )}
    </div>
  )
}

// ── Повторный клиент ───────────────────────────────────────────────────────────
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
  const [bonusPercent,  setBonusPercent]  = useState(String(bonusPercentDisplay(client.bonus_percent)))

  useEffect(() => {
    setBonusPercent(String(bonusPercentDisplay(client.bonus_percent)))
  }, [client.id, client.bonus_percent])

  const loadGroups = async (status) => {
    setGroupsLoading(true); setEnrollGroup(null)
    try {
      const r = await api.get('/groups/', {
        params: {
          status,
          page_size: 100,
          training_format: client.training_format,
          ...(client.training_format === 'offline' ? { group_type: client.group_type } : {}),
        },
      })
      const list = r.data.results || []
      const tf = client.training_format
      const gt = (client.group_type || '').trim()
      setGroups(
        list.filter(g => {
          if (g.training_format !== tf) return false
          if (tf === 'online' && !gt) return true
          return g.group_type === gt
        })
      )
    } catch {
      setGroups([])
    } finally {
      setGroupsLoading(false)
    }
  }

  const handleShowForm = () => {
    if (!showForm) loadGroups(statusFilter)
    setShowForm(v => !v); setEnrollGroup(null); setEnrollMsg(''); setEnrollError('')
  }

  const switchFilter = (s) => { setStatusFilter(s); setEnrollGroup(null); loadGroups(s) }

  const handleEnroll = async () => {
    if (!enrollGroup) { setEnrollError('Выберите группу'); return }
    if (payType === 'full' && (!payAmount || Number(payAmount) <= 0)) { setEnrollError('Укажите сумму'); return }
    if (payType === 'installment' && (!totalCost || !deadline)) { setEnrollError('Укажите стоимость и дедлайн'); return }
    const bp = parseInt(String(bonusPercent).trim(), 10)
    if (Number.isNaN(bp) || bp < 0 || bp > 100) {
      setEnrollError('Укажите процент бонуса от 0 до 100')
      return
    }
    setEnrollLoading(true); setEnrollMsg(''); setEnrollError('')
    try {
      await api.post(`/clients/${clientId}/re-enroll/`, {
        group_id: enrollGroup.id, payment_type: payType,
        payment_data: payType === 'full' ? { amount: payAmount } : { total_cost: totalCost, deadline },
        bonus_percent: bp,
      })
      setEnrollMsg(`Клиент записан в группу #${enrollGroup.number}`)
      setShowForm(false); setEnrollGroup(null); setPayAmount(''); setTotalCost(''); setDeadline('')
      onSuccess()
    } catch(e) {
      setEnrollError(e.response?.data?.detail || JSON.stringify(e.response?.data) || 'Ошибка')
    } finally { setEnrollLoading(false) }
  }

  const DAY_LABELS = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' }
  const fmtSchedule = s => {
    if (!s) return '—'
    const p = s.split(' ')
    return p[0].split(',').map(d => DAY_LABELS[d] || d).join(', ') + (p[1] ? ' · ' + p[1] : '') + (p[2] ? ' — ' + p[2] : '')
  }

  // ── Показываем панель только если клиент не в группе и статус позволяет ──
  const statusAllowsReEnroll = !client.group && ['completed', 'expelled', 'frozen'].includes(client.status)
  if (!statusAllowsReEnroll) return null

  const fp = client.full_payment
  const ip = client.installment_plan
  const hasOpenPaymentObligation =
    (client.payment_type === 'full' && fp && !fp.is_paid) ||
    (client.payment_type === 'installment' && ip && !ip.is_closed)
  const isPaymentClosed = !hasOpenPaymentObligation

  // Если оплата не закрыта — показываем блокирующее предупреждение
  if (!isPaymentClosed) {
    const remainingDebt =
      client.payment_type === 'installment' && ip
        ? ` Остаток по рассрочке: ${fmtMoney(ip.remaining)}.`
        : ' Оплата ещё не подтверждена.'
    return (
      <div className="crm-card p-5 mb-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <RotateCcw size={15} className="text-indigo-600" />
          </div>
          <h3 className="font-bold text-slate-800">Повторный клиент</h3>
          {client.is_repeat && (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">Повторный</span>
          )}
        </div>
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Запись в новую группу недоступна</p>
            <p className="text-xs text-amber-700 mt-1">
              Сначала необходимо полностью закрыть текущую оплату.{remainingDebt}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Всё ок — показываем форму записи ──
  return (
    <div className="crm-card p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
          <RotateCcw size={15} className="text-indigo-600" />
        </div>
        <h3 className="font-bold text-slate-800">Повторный клиент</h3>
        {client.is_repeat && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">Повторный</span>
        )}
      </div>

      <div className="p-4 bg-white border border-slate-200 rounded-xl mb-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Бонус с оплаты</p>
        <p className="text-xs text-slate-500">
          Укажите процент начисления при подтверждении оплаты (от суммы группы), например 3, 5 или 10.
        </p>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">Процент бонуса (0–100) *</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={bonusPercent}
            onChange={e => setBonusPercent(e.target.value)}
            className="crm-input w-full mt-1"
          />
        </label>
      </div>

      {Number(client.bonus_balance) > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700 mb-3 flex items-center gap-2">
          <Gift size={14} />
          На балансе <strong>{fmtMoney(client.bonus_balance)}</strong> бонусов — спишутся при записи в группу
        </div>
      )}

      {enrollMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 mb-4 flex items-center gap-2">
          <Check size={15} /> {enrollMsg}
        </div>
      )}

      <button onClick={handleShowForm} className="crm-btn-secondary w-full justify-center gap-2">
        <RotateCcw size={14} />{showForm ? 'Скрыть' : 'Записать в новую группу'}
      </button>

      {showForm && (
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs text-slate-400 font-medium mb-2">Шаг 1 — Выберите группу</p>
            <div className="flex gap-2 mb-3">
              {[{ val: 'recruitment', label: 'Набор' }, { val: 'active', label: 'Активный' }].map(({ val, label }) => (
                <button key={val} type="button" onClick={() => switchFilter(val)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition ${
                    statusFilter === val ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            {groupsLoading ? (
              <div className="flex justify-center py-6">
                <span className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4 bg-slate-50 rounded-xl">
                Нет групп со статусом «{statusFilter === 'recruitment' ? 'Набор' : 'Активный'}»
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {groups.map(g => (
                  <div key={g.id} onClick={() => setEnrollGroup(enrollGroup?.id === g.id ? null : g)}
                    className={`cursor-pointer p-3 rounded-xl border-2 transition-all ${
                      enrollGroup?.id === g.id ? 'bg-indigo-50 border-indigo-400' : 'bg-white border-slate-200 hover:border-indigo-200'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">
                          Группа #{g.number}
                          <span className="ml-2 text-xs font-normal text-slate-400">{GROUP_TYPE_LABEL[g.group_type] || g.group_type}</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{g.trainer?.full_name || '—'} · {fmtSchedule(g.schedule)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          g.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
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
                    className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium border-2 transition-all ${
                      payType === v ? 'bg-indigo-50 border-indigo-400 text-indigo-700' : 'bg-white border-slate-200 text-slate-600'
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {enrollGroup && payType === 'full' && (
            <div>
              <p className="text-xs text-slate-400 font-medium mb-2">Шаг 3 — Сумма курса</p>
              <input type="number" min="0" step="100" placeholder="Сумма (сом)"
                value={payAmount} onChange={e => setPayAmount(e.target.value)} className="crm-input w-full" />
            </div>
          )}
          {enrollGroup && payType === 'installment' && (
            <div className="space-y-2">
              <p className="text-xs text-slate-400 font-medium mb-2">Шаг 3 — Детали рассрочки</p>
              <input type="number" min="0" step="100" placeholder="Общая стоимость (сом)"
                value={totalCost} onChange={e => setTotalCost(e.target.value)} className="crm-input w-full" />
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="crm-input w-full" />
            </div>
          )}

          {enrollGroup && Number(client.bonus_balance) > 0 && (() => {
            const price = Number(payType === 'full' ? payAmount : totalCost)
            if (!price || price <= 0) return null
            const bonus = Math.min(Number(client.bonus_balance), price)
            return (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5 text-sm">
                <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                  <Gift size={12} /> Бонус спишется при записи
                </p>
                <div className="flex justify-between"><span className="text-slate-500">Цена курса</span><span className="font-semibold crm-money">{fmtMoney(price)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Бонус</span><span className="font-semibold text-red-500 crm-money">- {fmtMoney(bonus)}</span></div>
                <div className="h-px bg-amber-200" />
                <div className="flex justify-between font-bold text-base">
                  <span className="text-slate-700">К оплате</span>
                  <span className="text-emerald-600 crm-money">{fmtMoney(price - bonus)}</span>
                </div>
              </div>
            )
          })()}

          {enrollGroup && (
            <div className="pt-2">
              {enrollError && <p className="text-red-500 text-sm mb-2">{enrollError}</p>}
              <button onClick={handleEnroll} disabled={enrollLoading}
                className="crm-btn-primary w-full justify-center disabled:opacity-60">
                {enrollLoading
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Check size={14} />
                }
                Записать в группу #{enrollGroup.number}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Конфигурация статусов ──────────────────────────────────────────────────────
const STATUS_CONFIG = [
  {
    value:     'active',
    label:     'Активный',
    desc:      'Обучается',
    Icon:      CheckCircle,
    activeBg:  'bg-emerald-50 border-emerald-300',
    activeText:'text-emerald-700',
    iconColor: 'text-emerald-500',
    dot:       'bg-emerald-500',
  },
  {
    value:     'frozen',
    label:     'Заморозка',
    desc:      'Временно заморожен',
    Icon:      Snowflake,
    activeBg:  'bg-sky-50 border-sky-300',
    activeText:'text-sky-700',
    iconColor: 'text-sky-500',
    dot:       'bg-sky-500',
  },
  {
    value:     'completed',
    label:     'Завершил',
    desc:      'Курс завершён',
    Icon:      GraduationCap,
    activeBg:  'bg-slate-100 border-slate-300',
    activeText:'text-slate-700',
    iconColor: 'text-slate-500',
    dot:       'bg-slate-400',
  },
  {
    value:     'expelled',
    label:     'Отчислен',
    desc:      'Отчислен / возврат',
    Icon:      ShieldOff,
    activeBg:  'bg-red-50 border-red-300',
    activeText:'text-red-700',
    iconColor: 'text-red-500',
    dot:       'bg-red-500',
  },
]

// ── Бонусная панель ────────────────────────────────────────────────────────────
function BonusPanel({ clientId, currentBalance, bonusPercent = 10 }) {
  const [history,        setHistory]        = useState([])
  const [showHistory,    setShowHistory]    = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)

  const loadHistory = async () => {
    setHistoryLoading(true)
    try {
      const r = await api.get(`/bonuses/history/?client_id=${clientId}`)
      setHistory(r.data)
    } catch { } finally { setHistoryLoading(false) }
  }

  const toggleHistory = () => {
    if (!showHistory && history.length === 0) loadHistory()
    setShowHistory(v => !v)
  }

  return (
    <div className="crm-card p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <Gift size={15} className="text-amber-600" />
          </div>
          <h3 className="font-bold text-slate-800">Бонусная система</h3>
        </div>
        <button onClick={toggleHistory}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition">
          <History size={13} />{showHistory ? 'Скрыть историю' : 'История'}
        </button>
      </div>
      <div className="flex items-center justify-between p-3 bg-amber-50 rounded-xl mb-3">
        <span className="text-sm text-slate-500">Бонусный баланс</span>
        <span className={`font-bold text-lg crm-money ${Number(currentBalance) < 0 ? 'text-red-600' : 'text-amber-600'}`}>{fmtMoney(currentBalance ?? 0)}</span>
      </div>
      <p className="text-xs text-slate-400 text-center">
        {bonusPercent}% бонус начисляется после подтверждения оплаты (от суммы группы) · списывается при повторной записи в группу
      </p>
      {showHistory && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">История операций</p>
          {historyLoading ? (
            <div className="flex justify-center py-4">
              <span className="w-5 h-5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-3">Операций пока нет</p>
          ) : (
            <div className="space-y-2">
              {history.map(tx => (
                <div key={tx.id}
                  className={`flex items-start gap-3 p-3 rounded-xl text-sm ${
                    tx.type === 'accrual' ? 'bg-emerald-50' : 'bg-red-50'
                  }`}>
                  <div className="mt-0.5 shrink-0">
                    {tx.type === 'accrual'
                      ? <TrendingUp size={14} className="text-emerald-500" />
                      : <TrendingDown size={14} className="text-red-500" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400">{fmtDateTime(tx.created_at)}</p>
                    <p className="text-slate-600 text-xs truncate">{tx.description}</p>
                  </div>
                  <span className={`font-bold crm-money shrink-0 ${
                    tx.type === 'accrual' ? 'text-emerald-600' : 'text-red-500'
                  }`}>
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

// ── Главная страница ───────────────────────────────────────────────────────────
export default function ClientDetail() {
  const { id } = useParams()
  const { user } = useOutletContext()
  const [client, setClient]             = useState(null)
  const [planId, setPlanId]             = useState(null)
  const [newPassword, setNewPassword]   = useState(null)
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false)
  const [resetError, setResetError]     = useState('')
  const [statusLoading, setStatusLoading] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const [alertModal, setAlertModal]     = useState(null)
  const [refundOpen, setRefundOpen]     = useState(false)

  const load = async () => {
    const r = await api.get(`/clients/${id}/`)
    setClient(r.data)
    if (r.data.installment_plan) setPlanId(r.data.installment_plan.id)
  }

  useEffect(() => { load() }, [id])
  useEffect(() => setNewPassword(null), [id])

  const doChangeStatus = async (newStatus) => {
    if (statusLoading) return
    setStatusLoading(true)
    try { await api.post(`/clients/${id}/change_status/`, { status: newStatus }); await load() }
    finally { setStatusLoading(false) }
  }

  const changeStatus = (newStatus) => {
    if (client.group && ['completed', 'expelled'].includes(newStatus)) {
      setConfirmModal({
        title: 'Клиент в группе!',
        message: `${client.full_name} сейчас в группе #${client.group.number}.\n\nЛучше закрыть группу целиком через страницу группы — тогда все клиенты обработаются автоматически.`,
        variant: 'warning',
        confirmText: 'Всё равно изменить',
        onConfirm: async () => { setConfirmModal(null); await doChangeStatus(newStatus) },
      })
      return
    }
    doChangeStatus(newStatus)
  }

  const resetCabinetPassword = async () => {
    setResetPasswordLoading(true); setNewPassword(null); setResetError('')
    try {
      const r = await api.post(`/clients/${id}/reset_cabinet_password/`)
      setNewPassword(r.data.password); load()
    } catch (e) {
      setResetError(e.response?.data?.detail || e.message || 'Ошибка')
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

  const refundTotalPaid = client.payment_type === 'full'
    ? (full?.is_paid ? Number(full.amount) : 0)
    : (plan ? Number(plan.total_paid) : 0)

  const allReceipts = []
  if (client.payment_type === 'full' && full?.receipt)
    allReceipts.push({ id: full.id, date: full.paid_at, amount: full.amount, label: 'Полная оплата', receipt: full.receipt })
  if (client.payment_type === 'installment' && plan?.payments?.length)
    plan.payments.forEach((p, i) => allReceipts.push({
      id: p.id, date: p.paid_at, amount: p.amount, label: `Платёж ${i + 1}`, receipt: p.receipt || null
    }))

  const payProgress = plan
    ? Math.min(plan.total_cost > 0 ? (Number(plan.total_paid) / Number(plan.total_cost)) * 100 : 0, 100)
    : null

  return (
    <AdminLayout user={user}>
      {/* ── Хедер ── */}
      <div className="flex items-start gap-4 mb-6 flex-wrap">
        <Link to="/admin/clients"
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm transition mt-1">
          <ArrowLeft size={16} /> Назад
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="crm-page-title truncate">{client.full_name}</h2>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${STATUS_BADGE[client.status] || 'bg-slate-100 text-slate-600'}`}>
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

      {/* ── Данные кабинета ── */}
      <div className="crm-card p-5 mb-5"
        style={{ background: 'linear-gradient(135deg,#eef2ff 0%,#f0f9ff 100%)', borderColor: '#c7d2fe' }}>
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
            {(newPassword || client.cabinet_password) && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-indigo-600/70">{newPassword ? 'Новый пароль:' : 'Пароль:'}</span>
                <code className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border ${
                  newPassword ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-white text-indigo-800 border-indigo-100'
                }`}>
                  {newPassword || client.cabinet_password}
                </code>
                <CopyButton text={newPassword || client.cabinet_password} />
                {newPassword && <span className="text-xs text-emerald-600 font-medium">✓ Пароль обновлён</span>}
              </div>
            )}
            <p className="text-indigo-600/70 text-xs">
              Вход: <a href="/cabinet" target="_blank" rel="noreferrer" className="underline hover:text-indigo-800">/cabinet</a>
            </p>
            {resetError && <p className="text-red-500 text-xs">{resetError}</p>}
            <button onClick={resetCabinetPassword} disabled={resetPasswordLoading}
              className="crm-btn-primary text-xs py-2 disabled:opacity-60">
              {resetPasswordLoading
                ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <KeyRound size={13} />
              }
              Сбросить пароль
            </button>
          </div>
        ) : <p className="text-sm text-indigo-700/70">Кабинет не создан.</p>}
      </div>

      {/* ── Инфо + Оплата ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5">
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
                : <span className="flex items-center gap-1 text-violet-600"><Dumbbell size={13} /> Оффлайн</span>
              }
            />
            <InfoRow icon={Layers} label="Тип группы" value={GROUP_TYPE_LABEL[client.group_type]} />
            <StreamsInfoRow client={client} clientId={id} />
            <InfoRow icon={UserCircle} label="Тренер" value={client.trainer?.full_name} />
            <InfoRow icon={Calendar} label="Дата регистрации" value={client.registered_at} />
            <InfoRow icon={Gift} label="Бонусный баланс" value={fmtMoney(client.bonus_balance ?? 0)} color={Number(client.bonus_balance) < 0 ? 'text-red-600' : 'text-amber-600'} />
            <InfoRow icon={Percent} label="Бонус с оплаты (%)" value={`${bonusPercentDisplay(client.bonus_percent)}% — начислится после подтверждения оплаты`} color="text-slate-700" />
            <div className="flex items-center gap-3 py-3">
              <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0">
                <User size={14} className="text-slate-400" />
              </div>
              <span className="text-sm text-slate-500 flex-1">Зарегистрировал</span>
              <span className="text-sm font-semibold text-indigo-600">{client.registered_by_name || '—'}</span>
            </div>
          </div>
        </div>

        <div className="crm-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CreditCard size={15} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-800">Оплата</h3>
          </div>

          {client.payment_type === 'full' && full && (
            <div className="space-y-3">
              {full.course_amount != null && Number(full.course_amount) !== Number(full.amount) && (
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <span className="text-sm text-slate-500">Сумма курса</span>
                  <span className="font-bold text-slate-900 crm-money">{fmtMoney(full.course_amount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm text-slate-500">
                  {full.course_amount != null && Number(full.course_amount) !== Number(full.amount) ? 'К оплате' : 'Сумма'}
                </span>
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
                  className="flex items-center gap-2 text-indigo-600 text-sm hover:text-indigo-800 transition font-medium">
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
              <div>
                <div className="flex justify-between text-xs text-slate-400 mb-1.5">
                  <span>Прогресс</span>
                  <span className="font-semibold text-slate-600">{Math.round(payProgress)}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      payProgress >= 100 ? 'bg-emerald-500' : payProgress >= 60 ? 'bg-amber-400' : 'bg-red-400'
                    }`}
                    style={{ width: `${payProgress}%` }}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <span className="text-sm text-slate-500">Дедлайн</span>
                <span className="text-sm font-semibold text-slate-700">{plan.deadline}</span>
              </div>
              {plan.payments?.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">История платежей</p>
                  {plan.payments.map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between py-2 text-xs border-b border-slate-50 last:border-0">
                      <span className="text-slate-400">{p.paid_at}</span>
                      <span className="font-semibold text-slate-700 crm-money">{fmtMoney(p.amount)}</span>
                      {p.receipt
                        ? <a href={toAbsoluteUrl(p.receipt)} target="_blank" rel="noreferrer"
                            className="text-indigo-500 hover:text-indigo-700 transition flex items-center gap-1">
                            <Receipt size={11} /> Чек
                          </a>
                        : <span className="text-slate-300">—</span>
                      }
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── История чеков ── */}
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
                <span className="text-xs text-slate-400">{r.date ? fmtDateTime(r.date) : '—'}</span>
                <span className="text-sm font-semibold text-slate-700 crm-money">{r.label} — {fmtMoney(r.amount)}</span>
                {r.receipt
                  ? <a href={toAbsoluteUrl(r.receipt)} target="_blank" rel="noreferrer"
                      className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 text-xs font-semibold transition">
                      <Receipt size={13} /> Открыть чек →
                    </a>
                  : <span className="text-xs text-slate-300">Без чека</span>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Добавить платёж (рассрочка) ── */}
      {client.payment_type === 'installment' && plan && Number(plan.remaining) > 0 && (
        <div className="crm-card p-5 mb-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CreditCard size={15} className="text-emerald-600" />
            </div>
            <h3 className="font-bold text-slate-800">Добавить платёж</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Остаток: <strong className="text-red-500 crm-money">{fmtMoney(plan.remaining)}</strong>
          </p>
          <AddPaymentForm planId={planId} onSuccess={load} />
        </div>
      )}

      {/* ── Новый клиент: в группу без новой оплаты ── */}
      <NewClientAddToGroupPanel client={client} clientId={id} onSuccess={load} />

      {/* ── Изменить статус ── */}
      <div className="crm-card p-5 mb-5">
        <h3 className="font-bold text-slate-800 mb-1">Изменить статус</h3>
        {client.status === 'new' ? (
          <p className="text-sm text-slate-600">
            Статус <strong>«Новый»</strong> сменится на <strong>«Активный»</strong> после добавления клиента в группу.
            Вручную выставить «Активный» без группы нельзя. Для отмены регистрации используйте возврат средств.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-400 mb-4">Нажмите на нужный статус чтобы применить</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {STATUS_CONFIG.map(s => {
                const isActive = client.status === s.value
                return (
                  <button key={s.value} type="button"
                    onClick={() => !isActive && changeStatus(s.value)}
                    disabled={isActive || statusLoading}
                    className={`
                  relative flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border-2 text-sm
                  font-medium transition-all duration-150 text-center
                  ${isActive
                    ? `${s.activeBg} ${s.activeText} shadow-sm`
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50 cursor-pointer'
                  }
                  ${statusLoading ? 'opacity-50 cursor-not-allowed' : ''}
                `}
                  >
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isActive ? 'bg-white/60' : 'bg-slate-100'}`}>
                      <s.Icon size={18} className={isActive ? s.iconColor : 'text-slate-400'} />
                    </div>
                    <span className="font-semibold leading-tight">{s.label}</span>
                    <span className="text-xs opacity-60 font-normal leading-tight">{s.desc}</span>
                    {isActive && (
                      <span className="absolute top-2 right-2 text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/70 opacity-80">✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Возврат средств ── */}
      {(client.group || (full && !full.is_paid) || (plan && !plan.is_closed) || client.status === 'new') && (
        <div className="crm-card p-5 mb-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-800 mb-0.5">Возврат средств</h3>
              <p className="text-xs text-slate-400">Удержание за посещённые занятия; к возврату — остаток. Бонусы с этой оплаты аннулируются.</p>
            </div>
            <button
              type="button"
              onClick={() => setRefundOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition">
              <Undo2 size={14} /> Возврат
            </button>
          </div>
        </div>
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
            if (r.data.action === 'deleted') {
              setAlertModal({
                title: 'Клиент удалён', message: r.data.detail, variant: 'success',
                onCloseAction: () => { window.location.href = '/admin/clients' }
              })
            } else {
              setAlertModal({ title: 'Возврат выполнен', message: r.data.detail, variant: 'success' })
              load()
            }
          } catch (e) {
            setRefundOpen(false)
            setAlertModal({ title: 'Ошибка', message: e.response?.data?.detail || 'Ошибка возврата', variant: 'error' })
          }
        }}
      />

      {/* ── Повторный клиент ── */}
      <RepeatClientPanel client={client} clientId={id} onSuccess={load} />

      {/* ── Бонусная система ── */}
      <BonusPanel clientId={id} currentBalance={client.bonus_balance} bonusPercent={bonusPercentDisplay(client.bonus_percent)} />

      {/* ── Модальные окна ── */}
      {confirmModal && (
        <ConfirmModal
          open={true}
          title={confirmModal.title}
          message={confirmModal.message}
          variant={confirmModal.variant}
          confirmText={confirmModal.confirmText}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}
      {alertModal && (
        <AlertModal
          open={true}
          title={alertModal.title}
          message={alertModal.message}
          variant={alertModal.variant}
          onClose={() => {
            const action = alertModal.onCloseAction
            setAlertModal(null)
            action?.()
          }}
        />
      )}
    </AdminLayout>
  )
}
