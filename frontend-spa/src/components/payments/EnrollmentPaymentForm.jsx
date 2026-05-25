import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import api from '../../api/axios'

/**
 * Форма оплаты параллельной записи (ClientEnrollment).
 * Поддерживает оба типа: full (полная) и installment (рассрочка).
 * Внешний вид и паттерн идентичны AddPaymentForm / ConfirmFullPaymentForm.
 *
 * Props:
 *   enrollment  — объект из parallel_enrollments (нужны id, payment_type, payment_amount)
 *   clientId    — UUID клиента
 *   onDone(updatedEnrollment) — вызывается с обновлённой записью из ответа сервера
 */
export default function EnrollmentPaymentForm({ enrollment, clientId, onDone }) {
  const isFull = enrollment.payment_type === 'full'

  const [amount,  setAmount]  = useState(isFull ? (enrollment.payment_amount || '') : '')
  const [receipt, setReceipt] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) { setError('Укажите сумму'); return }
    setError(''); setLoading(true)
    try {
      const fd = new FormData()
      fd.append('amount', amount)
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

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">
            {isFull ? 'Сумма оплаты' : 'Сумма *'}
          </label>
          <input
            type="number" required min="1" step="0.01"
            value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="Сумма (сом)"
            className="crm-mobile-input w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1.5">Чек (необязательно)</label>
          <input
            type="file" accept="image/*,.pdf"
            onChange={e => setReceipt(e.target.files[0] || null)}
            className="crm-mobile-input w-full bg-white text-sm"
          />
          {receipt && <span className="block mt-1 text-xs text-gray-400 truncate">{receipt.name}</span>}
        </div>
      </div>

      <button
        type="submit" disabled={loading}
        className="w-full py-3 rounded-2xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 touch-manipulation"
        style={{ background: 'linear-gradient(135deg,#10b981,#059669)' }}
      >
        {loading
          ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          : <CheckCircle size={16} />}
        {loading ? 'Сохранение...' : isFull ? 'Подтвердить оплату' : 'Добавить платёж'}
      </button>
    </form>
  )
}
