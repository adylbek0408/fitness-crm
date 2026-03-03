import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import api from '../../api/axios'
import MobileLayout from '../../components/MobileLayout'

export default function ClientRegister() {
  const { user } = useOutletContext()
  const nav = useNavigate()
  const [groups, setGroups] = useState([])
  const [trainers, setTrainers] = useState([])
  const [paymentType, setPaymentType] = useState('')
  const [isRepeat, setIsRepeat] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/groups/?status=active&page_size=100'),
      api.get('/trainers/?page_size=100'),
    ]).then(([g, t]) => { setGroups(g.data.results || []); setTrainers(t.data.results || []) })
  }, [])

  const handleSubmit = async e => {
    e.preventDefault(); setError(''); setSuccess('')
    const fd = new FormData(e.target)
    const pt = fd.get('payment_type')
    let paymentData = {}
    if (pt === 'full') paymentData = { amount: fd.get('full_amount') }
    if (pt === 'installment') paymentData = { total_cost: fd.get('total_cost'), deadline: fd.get('deadline') }
    const body = {
      first_name: fd.get('first_name'), last_name: fd.get('last_name'),
      middle_name: fd.get('middle_name') || '', phone: fd.get('phone'),
      training_format: fd.get('training_format'), group_type: fd.get('group_type'),
      is_repeat: fd.get('is_repeat') === 'on', discount: fd.get('discount') || '0',
      payment_type: pt, payment_data: paymentData,
    }
    if (fd.get('group_id')) body.group = fd.get('group_id')
    if (fd.get('trainer_id')) body.trainer = fd.get('trainer_id')
    try {
      const r = await api.post('/clients/', body)
      setSuccess(`Клиент ${r.data.full_name} успешно зарегистрирован!`)
      e.target.reset(); setPaymentType(''); setIsRepeat(false)
      setTimeout(() => nav(`/mobile/clients/${r.data.id}`), 1500)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? Object.entries(d).map(([k,v]) => `${k}: ${v}`).join('\n') : 'Ошибка')
    }
  }

  return (
    <MobileLayout>
      <h2 className="text-xl font-bold text-gray-800 mb-6">Новый клиент</h2>
      {success && <div className="bg-green-50 text-green-700 rounded-xl p-4 mb-4 text-sm">{success}</div>}
      {error && <div className="bg-red-50 text-red-600 rounded-xl p-4 mb-4 text-sm whitespace-pre-line">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
          <h3 className="font-medium text-gray-700 text-sm">Личные данные</h3>
          {[['last_name','Фамилия *',true],['first_name','Имя *',true],['middle_name','Отчество',false]].map(([n,p,r]) => (
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
          <select name="group_id" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Поток (опционально)</option>
            {groups.map(g => <option key={g.id} value={g.id}>Поток #{g.number} ({g.group_type})</option>)}
          </select>
          <select name="trainer_id" className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Тренер (опционально)</option>
            {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
          </select>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
          <h3 className="font-medium text-gray-700 text-sm">Повторный клиент</h3>
          <label className="flex items-center gap-3">
            <input type="checkbox" name="is_repeat" checked={isRepeat} onChange={e => setIsRepeat(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
            <span className="text-sm text-gray-700">Повторный клиент</span>
          </label>
          {isRepeat && (
            <input type="number" name="discount" placeholder="Скидка (%)" min="0" max="100"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          )}
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
          <h3 className="font-medium text-gray-700 text-sm">Оплата</h3>
          <select name="payment_type" required value={paymentType} onChange={e => setPaymentType(e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="">Тип оплаты *</option>
            <option value="full">Полная оплата</option>
            <option value="installment">Рассрочка</option>
          </select>
          {paymentType === 'full' && (
            <input type="number" name="full_amount" placeholder="Сумма (сом) *" required
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          )}
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
