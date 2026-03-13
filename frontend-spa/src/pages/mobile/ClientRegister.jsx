import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import MobileDateField from '../../components/MobileDateField'
import { useRefresh } from '../../contexts/RefreshContext'

export default function ClientRegister() {
  const { user } = useOutletContext()
  const nav = useNavigate()
  useRefresh(null)
  const [paymentType, setPaymentType] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    training_format: '',
    group_type: '',
    payment_type: '',
    total_cost: '',
    deadline: '',
  })

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setSuccess('')
    const pt = form.payment_type
    if (!pt) {
      setError('Выберите тип оплаты')
      return
    }
    if (pt === 'installment' && (!form.total_cost || !form.deadline)) {
      setError('Для рассрочки заполните сумму и дедлайн оплаты')
      return
    }
    let paymentData = {}
    if (pt === 'full') paymentData = { amount: 0 }
    if (pt === 'installment') paymentData = { total_cost: form.total_cost, deadline: form.deadline }
    const body = {
      first_name: form.first_name, last_name: form.last_name,
      phone: form.phone,
      training_format: form.training_format, group_type: form.group_type,
      is_repeat: false,
      discount: '0',
      payment_type: pt, payment_data: paymentData,
    }
    try {
      const r = await api.post('/clients/', body)
      const name = r.data.full_name
      const cabinet = r.data.cabinet_username ? { login: r.data.cabinet_username, password: r.data.cabinet_password } : null
      setSuccess(cabinet
        ? `Клиент ${name} зарегистрирован. Данные для входа в кабинет: логин ${cabinet.login}, пароль ${cabinet.password} (сохраните и передайте клиенту).`
        : `Клиент ${name} успешно зарегистрирован!`)
      setCreatedCredentials(cabinet)
      setForm({
        first_name: '',
        last_name: '',
        phone: '',
        training_format: '',
        group_type: '',
        payment_type: '',
        total_cost: '',
        deadline: '',
      })
      setPaymentType('')
      setTimeout(() => {
        if (!cabinet) nav(`/mobile/clients/${r.data.id}`)
      }, 1500)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k,v]) => `${k}: ${v}`).join('\n') : 'Ошибка')
    }
  }

  return (
    <MobileLayout>
      <h2 className="text-xl font-bold text-gray-800 mb-6">Новый клиент</h2>
      {success && (
        <div className="bg-green-50 text-green-700 rounded-xl p-4 mb-4 text-sm">
          {success}
          {createdCredentials && (
            <div className="mt-3 pt-3 border-t border-green-200">
              <p className="font-medium mb-1">Данные для кабинета клиента:</p>
              <p className="break-all">Логин: <code className="bg-green-100 px-1 rounded">{createdCredentials.login}</code></p>
              <p className="break-all">Пароль: <code className="bg-green-100 px-1 rounded">{createdCredentials.password}</code></p>
              <button type="button" onClick={() => nav(`/mobile/clients`)}
                className="mt-3 text-blue-600 font-medium text-xs">Перейти к списку клиентов</button>
            </div>
          )}
        </div>
      )}
      {error && <div className="bg-red-50 text-red-600 rounded-xl p-4 mb-4 text-sm whitespace-pre-line">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
          <h3 className="font-medium text-gray-700 text-sm">Личные данные</h3>
          <input type="text" placeholder="Фамилия *" required value={form.last_name} onChange={e => set('last_name', e.target.value)}
            className="crm-mobile-input" />
          <input type="text" placeholder="Имя *" required value={form.first_name} onChange={e => set('first_name', e.target.value)}
            className="crm-mobile-input" />
          <input type="tel" placeholder="Телефон *" required value={form.phone} onChange={e => set('phone', e.target.value)}
            className="crm-mobile-input" />
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
          <h3 className="font-medium text-gray-700 text-sm">Обучение</h3>
          <select required value={form.training_format} onChange={e => set('training_format', e.target.value)} className="crm-mobile-select">
            <option value="">Формат обучения *</option>
            <option value="online">Онлайн</option>
            <option value="offline">Оффлайн</option>
          </select>
          <select required value={form.group_type} onChange={e => set('group_type', e.target.value)} className="crm-mobile-select">
            <option value="">Тип группы *</option>
            <option value="1.5h">1.5 часа</option>
            <option value="2.5h">2.5 часа</option>
          </select>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
          <h3 className="font-medium text-gray-700 text-sm">Оплата</h3>
          <select required value={paymentType} onChange={e => { setPaymentType(e.target.value); set('payment_type', e.target.value) }}
            className="crm-mobile-select">
            <option value="">Тип оплаты *</option>
            <option value="full">Полная оплата</option>
            <option value="installment">Рассрочка</option>
          </select>
          {paymentType === 'installment' && (
            <>
              <input type="number" placeholder="Общая стоимость (сом) *" required value={form.total_cost}
                onChange={e => set('total_cost', e.target.value)}
                className="crm-mobile-input" />
              <MobileDateField label="Дедлайн оплаты *" value={form.deadline} onChange={(v) => set('deadline', v)} />
            </>
          )}
        </div>
        <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-4 rounded-2xl text-sm transition">
          Зарегистрировать клиента
        </button>
      </form>
    </MobileLayout>
  )
}
