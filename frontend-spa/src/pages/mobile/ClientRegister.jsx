import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'
import { useRefresh } from '../../contexts/RefreshContext'

export default function ClientRegister() {
  const { user } = useOutletContext()
  const nav = useNavigate()
  useRefresh(null)
  const [paymentType, setPaymentType] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState(null)

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setSuccess('')
    const fd = new FormData(e.target)
    const pt = fd.get('payment_type')
    let paymentData = {}
    if (pt === 'full') paymentData = { amount: 0 }
    if (pt === 'installment') paymentData = { total_cost: fd.get('total_cost'), deadline: fd.get('deadline') }
    const body = {
      first_name: fd.get('first_name'), last_name: fd.get('last_name'),
      phone: fd.get('phone'),
      training_format: fd.get('training_format'), group_type: fd.get('group_type'),
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
      e.target.reset(); setPaymentType('')
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
              <p>Логин: <code className="bg-green-100 px-1 rounded">{createdCredentials.login}</code></p>
              <p>Пароль: <code className="bg-green-100 px-1 rounded">{createdCredentials.password}</code></p>
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
          {[['last_name','Фамилия *',true],['first_name','Имя *',true]].map(([n,p,r]) => (
            <input key={n} type="text" name={n} placeholder={p} required={r}
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          ))}
          <input type="tel" name="phone" placeholder="Телефон *" required
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
          <h3 className="font-medium text-gray-700 text-sm">Обучение</h3>
          <select name="training_format" required className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Формат обучения *</option>
            <option value="online">Онлайн</option>
            <option value="offline">Оффлайн</option>
          </select>
          <select name="group_type" required className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Тип группы *</option>
            <option value="1.5h">1.5 часа</option>
            <option value="2.5h">2.5 часа</option>
          </select>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
          <h3 className="font-medium text-gray-700 text-sm">Оплата</h3>
          <select name="payment_type" required value={paymentType} onChange={e => setPaymentType(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Тип оплаты *</option>
            <option value="full">Полная оплата</option>
            <option value="installment">Рассрочка</option>
          </select>
          {paymentType === 'installment' && (
            <>
              <input type="number" name="total_cost" placeholder="Общая стоимость (сом) *" required
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <label className="block text-sm text-gray-600">Дедлайн оплаты *</label>
              <input type="date" name="deadline" required
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
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
