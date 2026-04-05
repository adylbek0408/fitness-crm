import { useState } from 'react'
import { CheckCircle } from 'lucide-react'
import api from '../../api/axios'

/**
 * Форма подтверждения полной оплаты.
 * Если чек прикреплён — вызывает /payments/full/{clientId}/receipt/
 * Если чека нет — вызывает /payments/full/{clientId}/pay/
 */
export default function ConfirmFullPaymentForm({ clientId, amount, onSuccess }) {
  const [receiptAmount, setReceiptAmount] = useState(amount || '')
  const [receipt,       setReceipt]       = useState(null)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState('')
  const [success,       setSuccess]       = useState('')

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setSuccess('')
    setLoading(true)

    try {
      if (receipt) {
        const fd = new FormData()
        fd.append('receipt', receipt)
        if (receiptAmount && Number(receiptAmount) > 0) fd.append('amount', receiptAmount)
        await api.post(`/payments/full/${clientId}/receipt/`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        })
      } else {
        await api.post(`/payments/full/${clientId}/pay/`)
      }
      setSuccess('Оплата подтверждена')
      setReceipt(null)
      setTimeout(() => { if (onSuccess) onSuccess() }, 300)
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? JSON.stringify(d) : (d?.detail || 'Ошибка подтверждения'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error   && <div className="bg-red-50 text-red-600 text-sm rounded-xl p-3">{error}</div>}
      {success && <div className="bg-emerald-50 text-emerald-700 text-sm rounded-xl p-3 flex items-center gap-2"><CheckCircle size={14}/>{success}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Сумма оплаты</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={receiptAmount}
            onChange={e => setReceiptAmount(e.target.value)}
            placeholder="Сумма (сом)"
            className="crm-input w-full"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Чек (необязательно)</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={e => setReceipt(e.target.files[0] || null)}
            className="crm-input w-full bg-white text-sm"
          />
          {receipt && <span className="block mt-1 text-xs text-slate-400 truncate">{receipt.name}</span>}
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 transition flex items-center justify-center gap-2"
      >
        {loading
          ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"/>
          : <CheckCircle size={15}/>}
        {loading ? 'Подтверждение...' : 'Подтвердить оплату'}
      </button>
    </form>
  )
}
