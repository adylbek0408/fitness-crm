import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  User, Phone, BookOpen, CreditCard, ChevronRight, Check,
  FlaskConical, Mail, Globe, Dumbbell, Calendar, AlertTriangle, Search
} from 'lucide-react'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'

const STEPS = ['Данные', 'Группа + Оплата']

function StepBar({ current }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((label, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={i} className="flex items-center flex-1">
            <div className="flex flex-col items-center relative flex-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                   style={done
                     ? { background: 'linear-gradient(135deg,#be185d,#7c3aed)', color: '#fff' }
                     : active
                       ? { background: '#fce7f3', color: '#be185d', border: '2px solid #be185d' }
                       : { background: '#f3f4f6', color: '#9ca3af' }
                   }>
                {done ? <Check size={13} /> : i + 1}
              </div>
              <span className="text-xs mt-1 font-medium whitespace-nowrap"
                    style={{ color: active ? '#be185d' : done ? '#6b7280' : '#9ca3af', fontSize: 10 }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="h-0.5 flex-1 mx-1 -mt-4 rounded-full transition-all"
                   style={{ background: done ? '#be185d' : '#e5e7eb' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Кнопка выбора формата ──────────────────────────────────────────────────────
function FormatButton({ label, sub, icon: Icon, selected, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1.5 px-3 py-4 rounded-xl transition-all touch-manipulation"
      style={selected
        ? { background: '#fce7f3', border: '2px solid #be185d' }
        : { background: '#fafafa', border: '2px solid #e5e7eb' }
      }>
      <Icon size={20} style={{ color: selected ? '#be185d' : '#9ca3af' }} />
      <p className="text-sm font-semibold" style={{ color: selected ? '#be185d' : '#374151' }}>{label}</p>
      {sub && <p className="text-xs" style={{ color: selected ? '#9d174d' : '#9ca3af' }}>{sub}</p>}
    </button>
  )
}

// ── Кнопка фильтра статуса ─────────────────────────────────────────────────────
function FilterTab({ label, active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="flex-1 py-2.5 rounded-xl text-xs font-semibold border-2 transition touch-manipulation"
      style={active
        ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
        : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
      {label}
    </button>
  )
}

const GROUP_TYPE_LABEL = { '1.5h': '1.5 ч', '2.5h': '2.5 ч' }

// ── Выбор даты (нативный input, работает везде) ───────────────────────────────
function DateField({ value, onChange, label }) {
  const display = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null
  return (
    <div className="space-y-1">
      <div className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 pointer-events-none transition ${
        value ? 'bg-violet-50' : 'bg-amber-50'
      }`} style={value ? { borderColor: '#7c3aed' } : { borderColor: '#f59e0b', borderStyle: 'dashed' }}>
        <Calendar size={16} className="shrink-0" style={{ color: value ? '#7c3aed' : '#d97706' }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold" style={{ color: value ? '#6d28d9' : '#92400e' }}>
            {label || 'Дата дедлайна'} {!value && '— обязательно'}
          </p>
          <p className="text-sm font-medium" style={{ color: value ? '#5b21b6' : '#b45309' }}>
            {display || 'Нажмите на поле ниже чтобы выбрать'}
          </p>
        </div>
        {value
          ? <Check size={14} className="shrink-0" style={{ color: '#7c3aed' }} />
          : <span className="text-xs font-bold shrink-0" style={{ color: '#d97706' }}>▼</span>
        }
      </div>
      <input type="date" value={value} onChange={onChange}
        className="crm-mobile-input w-full" style={{ colorScheme: 'light' }} />
    </div>
  )
}

export default function ClientRegister() {
  useOutletContext()
  const nav = useNavigate()
  useRefresh(null)

  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState(null)

  // Шаг 0 — данные
  const [firstName, setFirstName]     = useState('')
  const [lastName, setLastName]       = useState('')
  const [phone, setPhone]             = useState('')
  const [googleEmail, setGoogleEmail] = useState('')
  const [notes, setNotes]             = useState('')
  const [isTrial, setIsTrial]         = useState(false)

  // Шаг 1 — группа
  const [format, setFormat]           = useState('')   // online / offline
  const [statusFilter, setStatusFilter] = useState('recruitment')
  const [groups, setGroups]           = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState(null)

  // Шаг 1 — оплата
  const [payType, setPayType]         = useState('')
  const [payAmount, setPayAmount]     = useState('')
  const [totalCost, setTotalCost]     = useState('')
  const [deadline, setDeadline]       = useState('')
  const [bonusPercent, setBonusPercent] = useState('10')

  const loadGroups = async (fmt, st) => {
    if (!fmt) return
    setGroupsLoading(true)
    try {
      const r = await api.get('/groups/', {
        params: { status: st, page_size: 100, training_format: fmt },
      })
      setGroups(r.data.results || [])
    } catch {
      setGroups([])
    } finally {
      setGroupsLoading(false)
    }
  }

  useEffect(() => {
    if (step === 1 && format && !isTrial) {
      setSelectedGroup(null)
      loadGroups(format, statusFilter)
    }
  }, [format, statusFilter, step])

  const handleFormatSelect = (fmt) => {
    setFormat(fmt)
    setSelectedGroup(null)
    setGroups([])
    loadGroups(fmt, statusFilter)
  }

  const validateStep0 = () => {
    if (!lastName.trim())  { setError('Введите фамилию'); return false }
    if (!firstName.trim()) { setError('Введите имя'); return false }
    if (!phone.trim())     { setError('Введите телефон'); return false }
    return true
  }

  const validateStep1 = () => {
    if (!isTrial) {
      if (!selectedGroup) { setError('Выберите группу'); return false }
    }
    if (!payType) { setError('Выберите тип оплаты'); return false }
    const bp = Number(bonusPercent)
    if (!isTrial && (isNaN(bp) || bp < 0 || bp > 100)) {
      setError('Укажите процент бонуса от 0 до 100'); return false
    }
    if (payType === 'full') {
      if (!payAmount || Number(payAmount) <= 0) { setError('Введите сумму'); return false }
    }
    if (payType === 'installment') {
      if (!totalCost || Number(totalCost) <= 0) { setError('Введите стоимость рассрочки'); return false }
      if (!deadline) { setError('Укажите дедлайн рассрочки'); return false }
    }
    return true
  }

  const handleNext = () => {
    setError('')
    if (step === 0 && validateStep0()) setStep(1)
  }
  const handleBack = () => { setError(''); setStep(0) }

  const handleSubmit = async () => {
    setError('')
    if (!validateStep1()) return
    setLoading(true)

    const paymentData = payType === 'full'
      ? { amount: payAmount }
      : { total_cost: totalCost, deadline }

    const training_format = selectedGroup
      ? selectedGroup.training_format
      : (isTrial ? 'online' : 'online')

    const group_type = selectedGroup?.group_type || ''

    const body = {
      first_name:      firstName.trim(),
      last_name:       lastName.trim(),
      phone:           phone.trim(),
      google_email:    (googleEmail || '').trim().toLowerCase(),
      notes:           (notes || '').trim(),
      telegram_link:   '',
      training_format,
      group_type,
      is_repeat:       false,
      discount:        '0',
      is_trial:        isTrial,
      bonus_percent:   isTrial ? 0 : Number(bonusPercent),
      payment_type:    payType,
      payment_data:    paymentData,
    }

    try {
      const r = await api.post('/clients/', body)
      const clientId = r.data.id

      // Добавляем в выбранную группу (если не пробный)
      if (!isTrial && selectedGroup) {
        try {
          await api.post(`/clients/${clientId}/add-to-group/`, { group_id: selectedGroup.id })
        } catch (e) {
          // группа добавлена позже через карточку клиента
        }
      }

      const cabinet = r.data.cabinet_username
        ? { login: r.data.cabinet_username, password: r.data.cabinet_password }
        : null
      setCreatedCredentials(cabinet)
      setTimeout(() => {
        nav(`/mobile/clients/${clientId}`, { state: { justCreated: true, cabinet } })
      }, 2000)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object'
        ? Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('\n')
        : 'Ошибка регистрации')
    } finally {
      setLoading(false)
    }
  }

  // Экран успеха
  if (createdCredentials !== null && !loading) {
    return (
      <MobileLayout>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
               style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
            <Check size={28} className="text-white" strokeWidth={2.5} />
          </div>
          <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text)' }}>Клиент зарегистрирован!</h3>
          {createdCredentials && (
            <div className="w-full rounded-2xl p-4 text-left mt-4"
                 style={{ background: '#fce7f3', border: '1px solid #fbcfe8' }}>
              <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: '#be185d' }}>
                Данные для кабинета
              </p>
              <div className="space-y-2">
                {[['Логин', createdCredentials.login], ['Пароль', createdCredentials.password]].map(([lbl, val]) => (
                  <div key={lbl} className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--text-soft)' }}>{lbl}</span>
                    <code className="text-sm font-bold px-2 py-0.5 rounded-lg"
                          style={{ background: '#fff', color: 'var(--text)' }}>{val}</code>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: '#9d174d' }}>Сохраните и передайте клиенту</p>
            </div>
          )}
          <p className="text-xs mt-4" style={{ color: 'var(--text-xs)' }}>Переходим в карточку клиента...</p>
        </div>
      </MobileLayout>
    )
  }

  return (
    <MobileLayout>
      <div className="mb-5">
        <h2 className="text-lg font-bold tracking-tight mb-4" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Новый клиент
        </h2>
        <StepBar current={step} />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl flex items-start gap-2 text-sm whitespace-pre-line"
             style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626' }}>
          <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* ── ШАГ 0: Личные данные ─────────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-3 animate-fade-in">
          {/* ФИО + телефон */}
          <div className="rounded-2xl p-4 space-y-3"
               style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#fce7f3' }}>
                <User size={13} style={{ color: '#be185d' }} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-xs)' }}>
                Личные данные
              </span>
            </div>
            <input type="text" placeholder="Фамилия *" value={lastName}
              onChange={e => setLastName(e.target.value)} className="crm-mobile-input" />
            <input type="text" placeholder="Имя *" value={firstName}
              onChange={e => setFirstName(e.target.value)} className="crm-mobile-input" />
            <div className="relative">
              <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xs)' }} />
              <input type="tel" placeholder="Телефон *" value={phone}
                onChange={e => setPhone(e.target.value)} className="crm-mobile-input pl-11" />
            </div>
            <div className="relative">
              <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-xs)' }} />
              <input type="email" placeholder="Gmail (для входа через Google)" value={googleEmail}
                onChange={e => setGoogleEmail(e.target.value)} className="crm-mobile-input pl-11" />
            </div>
            <textarea placeholder="Заметка о клиенте (необязательно)" value={notes}
              onChange={e => setNotes(e.target.value)} rows={2} className="crm-mobile-input resize-none" />
          </div>

          {/* Тип клиента */}
          <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#fff7ed' }}>
                <FlaskConical size={13} style={{ color: '#ea580c' }} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-xs)' }}>
                Тип клиента
              </span>
            </div>
            <div className="flex gap-2">
              {[
                { val: false, label: 'Обычный', color: '#be185d', bg: '#fce7f3' },
                { val: true,  label: 'Пробный', color: '#ea580c', bg: '#fff7ed', Icon: FlaskConical },
              ].map(({ val, label, color, bg, Icon }) => (
                <button key={String(val)} type="button" onClick={() => setIsTrial(val)}
                  className="flex-1 flex items-center justify-between px-4 py-3.5 rounded-xl transition-all touch-manipulation"
                  style={isTrial === val
                    ? { background: bg, border: `2px solid ${color}` }
                    : { background: '#fafafa', border: '2px solid #e5e7eb' }
                  }>
                  <div className="flex items-center gap-1.5">
                    {Icon && <Icon size={13} style={{ color: isTrial === val ? color : '#9ca3af' }} />}
                    <p className="text-sm font-semibold" style={{ color: isTrial === val ? color : 'var(--text)' }}>
                      {label}
                    </p>
                  </div>
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0"
                       style={isTrial === val
                         ? { borderColor: color, background: color }
                         : { borderColor: '#d1d5db', background: '#fff' }}>
                    {isTrial === val && <Check size={11} className="text-white" strokeWidth={3} />}
                  </div>
                </button>
              ))}
            </div>
            {isTrial && (
              <div className="mt-3 px-3 py-2.5 rounded-xl text-xs"
                   style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>
                <FlaskConical size={11} className="inline mr-1" />
                Пробный клиент — посещает пробное занятие. В группу не добавляется.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ШАГ 1: Группа + Оплата ───────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">

          {/* Пробный — без выбора группы */}
          {isTrial && (
            <div className="rounded-2xl px-4 py-3 flex items-start gap-2"
                 style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}>
              <FlaskConical size={15} style={{ color: '#ea580c', marginTop: 1, flexShrink: 0 }} />
              <p className="text-xs" style={{ color: '#c2410c' }}>
                Пробный клиент — в группу не добавляется. Укажите оплату за пробное занятие.
              </p>
            </div>
          )}

          {/* Выбор группы — только для обычных */}
          {!isTrial && (
            <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid var(--border)' }}>
              {/* Заголовок */}
              <div className="px-4 pt-4 pb-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#ede9fe' }}>
                    <BookOpen size={13} style={{ color: '#7c3aed' }} />
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-xs)' }}>
                    Шаг 1 — Выберите группу
                  </span>
                </div>

                {/* Онлайн / Оффлайн */}
                <div className="flex gap-2 mb-3">
                  <FormatButton label="Онлайн" sub="Удалённый" icon={Globe}
                    selected={format === 'online'} onClick={() => handleFormatSelect('online')} />
                  <FormatButton label="Оффлайн" sub="Очный" icon={Dumbbell}
                    selected={format === 'offline'} onClick={() => handleFormatSelect('offline')} />
                </div>

                {/* Фильтр статуса */}
                {format && (
                  <div className="flex gap-2 mb-3">
                    <FilterTab label="Набор" active={statusFilter === 'recruitment'}
                      onClick={() => setStatusFilter('recruitment')} />
                    <FilterTab label="Активный" active={statusFilter === 'active'}
                      onClick={() => setStatusFilter('active')} />
                  </div>
                )}
              </div>

              {/* Список групп */}
              {!format && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-gray-400 text-center py-4">
                    Выберите формат чтобы увидеть группы
                  </p>
                </div>
              )}
              {format && groupsLoading && (
                <div className="flex justify-center py-6 px-4 pb-4">
                  <span className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: '#7c3aed' }} />
                </div>
              )}
              {format && !groupsLoading && groups.length === 0 && (
                <div className="px-4 pb-4">
                  <p className="text-sm text-gray-400 text-center py-4">Нет подходящих групп</p>
                </div>
              )}
              {format && !groupsLoading && groups.length > 0 && (
                <div className="px-4 pb-4 space-y-2 max-h-56 overflow-y-auto">
                  {groups.map(g => (
                    <button key={g.id} type="button"
                      onClick={() => setSelectedGroup(selectedGroup?.id === g.id ? null : g)}
                      className="w-full text-left p-3 rounded-xl border-2 transition touch-manipulation"
                      style={selectedGroup?.id === g.id
                        ? { background: '#ede9fe', borderColor: '#7c3aed' }
                        : { background: '#fafafa', borderColor: '#e5e7eb' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-gray-800">
                            {g.trainer?.full_name
                              ? `Группа #${g.number} · ${g.trainer.full_name}`
                              : `Группа #${g.number}`}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {GROUP_TYPE_LABEL[g.group_type] || (g.training_format === 'online' ? 'Онлайн' : g.group_type || '—')}
                            {' · '}
                            <span style={{ color: g.status === 'active' ? '#059669' : '#d97706' }}>
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

              {/* Подтверждение выбора */}
              {selectedGroup && (
                <div className="mx-4 mb-4 p-2.5 rounded-xl text-xs font-semibold"
                     style={{ background: '#ede9fe', color: '#6d28d9' }}>
                  ✓ Выбрана: Группа #{selectedGroup.number}
                  {selectedGroup.trainer?.full_name ? ` · ${selectedGroup.trainer.full_name}` : ''}
                </div>
              )}
            </div>
          )}

          {/* Блок оплаты */}
          <div className="rounded-2xl p-4 space-y-3" style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: '#fce7f3' }}>
                <CreditCard size={13} style={{ color: '#be185d' }} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-xs)' }}>
                {isTrial ? 'Оплата пробного занятия' : 'Шаг 2 — Оплата'}
              </span>
            </div>

            {/* Тип оплаты */}
            <div className="flex gap-2">
              {[{ v: 'full', l: 'Полная оплата' }, { v: 'installment', l: 'Рассрочка' }].map(({ v, l }) => (
                <button key={v} type="button" onClick={() => setPayType(v)}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border-2 transition touch-manipulation"
                  style={payType === v
                    ? { background: '#fce7f3', borderColor: '#be185d', color: '#be185d' }
                    : { background: '#fafafa', borderColor: '#e5e7eb', color: '#6b7280' }}>
                  {l}
                </button>
              ))}
            </div>

            {payType === 'full' && (
              <input type="number" min="0" step="100" placeholder="Сумма курса (сом) *"
                value={payAmount} onChange={e => setPayAmount(e.target.value)}
                className="crm-mobile-input" />
            )}
            {payType === 'installment' && (
              <div className="space-y-2">
                <input type="number" min="0" step="100" placeholder="Общая стоимость (сом) *"
                  value={totalCost} onChange={e => setTotalCost(e.target.value)}
                  className="crm-mobile-input" />
                <DateField value={deadline} onChange={e => setDeadline(e.target.value)} label="Дедлайн рассрочки" />
              </div>
            )}

            {/* Бонус — только для обычных */}
            {!isTrial && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Бонус с оплаты (%)</p>
                <input type="number" min={0} max={100} step={1} placeholder="Например: 10"
                  value={bonusPercent} onChange={e => setBonusPercent(e.target.value)}
                  className="crm-mobile-input" />
              </div>
            )}
          </div>

          {/* Итоговая сводка */}
          <div className="rounded-2xl p-4" style={{ background: '#fdf8fb', border: '1px solid #ece4e8' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-xs)' }}>
              Проверка данных
            </p>
            <div className="space-y-1.5 text-sm">
              {[
                ['Имя', `${lastName} ${firstName}`],
                ['Телефон', phone],
                ['Тип клиента', isTrial ? '⚗️ Пробный' : 'Обычный'],
                ...(!isTrial && selectedGroup ? [
                  ['Группа', `#${selectedGroup.number} · ${selectedGroup.trainer?.full_name || '—'}`],
                  ['Формат', selectedGroup.training_format === 'online' ? 'Онлайн' : 'Оффлайн'],
                ] : []),
                ['Оплата', payType === 'full'
                  ? `Полная — ${payAmount || '0'} сом`
                  : payType === 'installment'
                    ? `Рассрочка — ${totalCost || '0'} сом`
                    : '—'],
                ...(!isTrial ? [['Бонус', `${bonusPercent}%`]] : []),
              ].map(([lbl, val]) => (
                <div key={lbl} className="flex justify-between">
                  <span style={{ color: 'var(--text-soft)' }}>{lbl}</span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{val || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Навигация */}
      <div className="flex gap-3 mt-6">
        {step > 0 && (
          <button type="button" onClick={handleBack}
            className="flex-1 py-4 rounded-2xl text-sm font-medium transition touch-manipulation"
            style={{ background: '#fff', border: '1px solid var(--border)', color: 'var(--text-soft)' }}>
            Назад
          </button>
        )}
        {step === 0 ? (
          <button type="button" onClick={handleNext}
            className="flex-1 py-4 rounded-2xl text-sm font-semibold text-white transition flex items-center justify-center gap-2 touch-manipulation"
            style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)', boxShadow: '0 4px 14px rgba(190,24,93,0.25)' }}>
            Далее <ChevronRight size={16} />
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="flex-1 py-4 rounded-2xl text-sm font-semibold text-white transition disabled:opacity-60 flex items-center justify-center gap-2 touch-manipulation"
            style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)', boxShadow: '0 4px 14px rgba(190,24,93,0.25)' }}>
            {loading ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Сохраняем...</>
            ) : (
              <><Check size={16} /> Зарегистрировать</>
            )}
          </button>
        )}
      </div>
    </MobileLayout>
  )
}
