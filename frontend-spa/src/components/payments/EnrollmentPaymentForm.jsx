import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import api from '../../api/axios'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/**
 * Форма оплаты параллельной записи (ClientEnrollment).
 * - full:        Сумма + Чек + "Подтвердить оплату"     (как ConfirmFullPaymentForm)
 * - installment: Сумма + Дата + Чек + "Добавить"        (как AddPaymentForm)
 *
 * Props:
 *   enrollment  — объект из parallel_enrollments (нужны id, payment_type, payment_amount)
 *   clientId    — UUID клиента
 *   onDone(updatedEnrollment) — вызывается с обновлённой записью из ответа сервера
 */
export default function EnrollmentPaymentForm({ enrollment, clientId, onDone }) {
  const isFull = enrollment.payment_type === 'full'

  const [amount,  setAmount]  = useState(isFull ? (enrollment.payment_amount || '') : '')
  const [paidAt,  setPaidAt]  = useState(todayStr())
  const [receipt, setReceipt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) { setError('Укажите сумму'); return }
    if (!isFull && paidAt > todayStr()) { setError('Нельзя указывать будущую дату платежа'); return }
    setError(''); setLoading(true)
    try {
      const fd = new FormData()
      fd.append('amount', amount)
      if (!isFull) fd.append('paid_at', paidAt)
      if (receipt) fd.append('receipt', receipt)
      const res = await api.post(
        `/clients/${clientId}/enrollments/${enrollment.id}/payment/`,
        fd,
        { headers: { 'Content-Type': undefined } },
      )
      if (onDone) onDone(res.data)
    } catch (err) {
      const d = err.response?.data
      setError(d?.detail || (typeof d === 'object' ? JSON.stringify(d) : null) || 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  const colSpan = isFull ? 'sm:col-span-2' : 'sm:col-span-3'

  return (
    <form onSubmit={handleSubmit} className={`grid grid-cols-1 ${isFull ? 'sm:grid-cols-2' : 'sm:grid-cols-3'} gap-3 items-end`}>
      {error && (
        <div className={`${colSpan} bg-red-50 text-red-600 text-sm rounded-xl p-3`}>{error}</div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">
          {isFull ? 'Сумма оплаты' : 'Сумма *'}
        </label>
        <input
          type="number" required min="1" step="0.01"
          value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="Сумма (сом)"
          className="crm-mobile-input w-full"
        />
      </div>

      {!isFull && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Дата *</label>
          <input
            type="date" required
            value={paidAt}
            max={todayStr()}
            onChange={e => setPaidAt(e.target.value)}
            className="crm-mobile-input w-full"
            style={{ colorScheme: 'light' }}
          />
        </div>
      )}

      <div>
        <label className="block text-xs text-gray-500 mb-1">Чек (необязательно)</label>
        <input
          type="file" accept="image/*,.pdf"
          onChange={e => setReceipt(e.target.files[0] || null)}
          className="crm-mobile-input w-full bg-white text-sm"
        />
        {receipt && <span className="block mt-1 text-xs text-gray-400 truncate">{receipt.name}</span>}
      </div>

      <button
        type="submit" disabled={loading}
        className={`${colSpan} w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation`}
        style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
      >
        {loading
          ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          : <CheckCircle size={16} />}
        {loading ? 'Сохранение...' : isFull ? 'Подтвердить оплату' : 'Добавить'}
      </button>
    </form>
  )
}
