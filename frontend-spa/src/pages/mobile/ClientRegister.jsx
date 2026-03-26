import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { User, Phone, BookOpen, CreditCard, ChevronRight, Check } from 'lucide-react'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import MobileDateField from '../../components/MobileDateField'
import { useRefresh } from '../../contexts/RefreshContext'

const STEPS = ['Личные данные', 'Обучение', 'Оплата']

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

function OptionButton({ label, sub, selected, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all"
      style={selected
        ? { background: '#fce7f3', border: '2px solid #be185d' }
        : { background: '#fafafa', border: '2px solid #e5e7eb' }
      }>
      <div className="text-left">
        <p className="text-sm font-semibold" style={{ color: selected ? '#be185d' : 'var(--text)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-xs)' }}>{sub}</p>}
      </div>
      <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all shrink-0"
           style={selected
             ? { borderColor: '#be185d', background: '#be185d' }
             : { borderColor: '#d1d5db', background: '#fff' }
           }>
        {selected && <Check size={11} className="text-white" strokeWidth={3} />}
      </div>
    </button>
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
  const [form, setForm] = useState({
    first_name: '', last_name: '', phone: '',
    training_format: '', group_type: '',
    payment_type: '', total_cost: '', deadline: '',
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const validateStep = () => {
    setError('')
    if (step === 0) {
      if (!form.last_name.trim()) { setError('Введите фамилию'); return false }
      if (!form.first_name.trim()) { setError('Введите имя'); return false }
      if (!form.phone.trim()) { setError('Введите телефон'); return false }
    }
    if (step === 1) {
      if (!form.training_format) { setError('Выберите формат обучения'); return false }
      if (!form.group_type) { setError('Выберите тип группы'); return false }
    }
    if (step === 2) {
      if (!form.payment_type) { setError('Выберите тип оплаты'); return false }
      if (form.payment_type === 'installment') {
        if (!form.total_cost) { setError('Введите общую стоимость'); return false }
        if (!form.deadline) { setError('Укажите дедлайн оплаты'); return false }
      }
    }
    return true
  }

  const handleNext = () => { if (validateStep()) setStep(s => s + 1) }
  const handleBack = () => { setError(''); setStep(s => s - 1) }

  const handleSubmit = async () => {
    if (!validateStep()) return
    setLoading(true); setError('')
    const pt = form.payment_type
    const paymentData = pt === 'full'
      ? { amount: 0 }
      : { total_cost: form.total_cost, deadline: form.deadline }
    const body = {
      first_name: form.first_name, last_name: form.last_name, phone: form.phone,
      training_format: form.training_format, group_type: form.group_type,
      is_repeat: false, discount: '0',
      payment_type: pt, payment_data: paymentData,
    }
    try {
      const r = await api.post('/clients/', body)
      const cabinet = r.data.cabinet_username
        ? { login: r.data.cabinet_username, password: r.data.cabinet_password }
        : null
      setCreatedCredentials(cabinet)
      setTimeout(() => {
        nav(`/mobile/clients/${r.data.id}`, { state: { justCreated: true, cabinet } })
      }, 2000)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k,v]) => `${k}: ${v}`).join('\n') : 'Ошибка регистрации')
    } finally { setLoading(false) }
  }

  // Успешная регистрация
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
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-soft)' }}>Логин</span>
                  <code className="text-sm font-bold px-2 py-0.5 rounded-lg"
                        style={{ background: '#fff', color: 'var(--text)' }}>
                    {createdCredentials.login}
                  </code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: 'var(--text-soft)' }}>Пароль</span>
                  <code className="text-sm font-bold px-2 py-0.5 rounded-lg"
                        style={{ background: '#fff', color: 'var(--text)' }}>
                    {createdCredentials.password}
                  </code>
                </div>
              </div>
              <p className="text-xs mt-3" style={{ color: '#9d174d' }}>
                Сохраните и передайте клиенту
              </p>
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
        <div className="crm-toast-error mb-4 text-sm whitespace-pre-line animate-fade-in">{error}</div>
      )}

      {/* Шаг 0: Личные данные */}
      {step === 0 && (
        <div className="space-y-3 animate-fade-in">
          <div className="rounded-2xl p-4 space-y-3"
               style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                   style={{ background: '#fce7f3' }}>
                <User size={13} style={{ color: '#be185d' }} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-xs)' }}>
                Личные данные
              </span>
            </div>
            <input type="text" placeholder="Фамилия *" required value={form.last_name}
              onChange={e => set('last_name', e.target.value)}
              className="crm-mobile-input" />
            <input type="text" placeholder="Имя *" required value={form.first_name}
              onChange={e => set('first_name', e.target.value)}
              className="crm-mobile-input" />
            <div className="relative">
              <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2"
                     style={{ color: 'var(--text-xs)' }} />
              <input type="tel" placeholder="Телефон *" required value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className="crm-mobile-input pl-11" />
            </div>
          </div>
        </div>
      )}

      {/* Шаг 1: Обучение */}
      {step === 1 && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                   style={{ background: '#ede9fe' }}>
                <BookOpen size={13} style={{ color: '#7c3aed' }} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-xs)' }}>
                Формат обучения
              </span>
            </div>
            <div className="space-y-2">
              <OptionButton label="Онлайн" sub="Удалённый формат"
                selected={form.training_format === 'online'}
                onClick={() => set('training_format', 'online')} />
              <OptionButton label="Оффлайн" sub="Очный формат"
                selected={form.training_format === 'offline'}
                onClick={() => set('training_format', 'offline')} />
            </div>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-xs)' }}>
              Тип группы
            </p>
            <div className="space-y-2">
              <OptionButton label="1.5 часа" sub="Стандартный формат"
                selected={form.group_type === '1.5h'}
                onClick={() => set('group_type', '1.5h')} />
              <OptionButton label="2.5 часа" sub="Расширенный формат"
                selected={form.group_type === '2.5h'}
                onClick={() => set('group_type', '2.5h')} />
            </div>
          </div>
        </div>
      )}

      {/* Шаг 2: Оплата */}
      {step === 2 && (
        <div className="space-y-4 animate-fade-in">
          <div className="rounded-2xl p-4" style={{ background: '#fff', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                   style={{ background: '#fce7f3' }}>
                <CreditCard size={13} style={{ color: '#be185d' }} />
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-xs)' }}>
                Тип оплаты
              </span>
            </div>
            <div className="space-y-2">
              <OptionButton label="Полная оплата" sub="Единовременный платёж"
                selected={form.payment_type === 'full'}
                onClick={() => set('payment_type', 'full')} />
              <OptionButton label="Рассрочка" sub="Оплата по частям"
                selected={form.payment_type === 'installment'}
                onClick={() => set('payment_type', 'installment')} />
            </div>
          </div>

          {form.payment_type === 'installment' && (
            <div className="rounded-2xl p-4 space-y-3 animate-fade-in"
                 style={{ background: '#fff', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-xs)' }}>
                Детали рассрочки
              </p>
              <input type="number" placeholder="Общая стоимость (сом) *" required
                value={form.total_cost} onChange={e => set('total_cost', e.target.value)}
                className="crm-mobile-input" />
              <MobileDateField label="Дедлайн оплаты *" value={form.deadline}
                onChange={v => set('deadline', v)} />
            </div>
          )}

          {/* Итоговая сводка */}
          <div className="rounded-2xl p-4" style={{ background: '#fdf8fb', border: '1px solid #ece4e8' }}>
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--text-xs)' }}>
              Проверка данных
            </p>
            <div className="space-y-1.5 text-sm">
              {[
                ['Имя', `${form.last_name} ${form.first_name}`],
                ['Телефон', form.phone],
                ['Формат', form.training_format === 'online' ? 'Онлайн' : 'Оффлайн'],
                ['Тип группы', form.group_type === '1.5h' ? '1.5 часа' : '2.5 часа'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between">
                  <span style={{ color: 'var(--text-soft)' }}>{label}</span>
                  <span className="font-medium" style={{ color: 'var(--text)' }}>{value || '—'}</span>
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
            className="flex-1 py-4 rounded-2xl text-sm font-medium transition"
            style={{ background: '#fff', border: '1px solid var(--border)', color: 'var(--text-soft)' }}>
            Назад
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={handleNext}
            className="flex-1 py-4 rounded-2xl text-sm font-semibold text-white transition flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)', boxShadow: '0 4px 14px rgba(190,24,93,0.25)' }}>
            Далее <ChevronRight size={16} />
          </button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="flex-1 py-4 rounded-2xl text-sm font-semibold text-white transition disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)', boxShadow: '0 4px 14px rgba(190,24,93,0.25)' }}>
            {loading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Сохраняем...
              </>
            ) : (
              <><Check size={16} /> Зарегистрировать</>
            )}
          </button>
        )}
      </div>
    </MobileLayout>
  )
}
