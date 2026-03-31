import { useState } from 'react'
import api from '../../api/axios'

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function AddPaymentForm({ planId, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(todayStr())
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')

    // Фронтовая защита от будущей даты
    if (paidAt > todayStr()) {
      setError('Нельзя указывать будущую дату платежа')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('amount', amount)
      formData.append('paid_at', paidAt)
      if (receipt) formData.append('receipt', receipt)

      await api.post(
        `/payments/installment/${planId}/payments/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )

      setAmount('')
      setPaidAt(todayStr())
      setReceipt(null)
      if (onSuccess) setTimeout(() => onSuccess(), 100)
    } catch (e) {
      const d = e.response?.data
      if (d?.paid_at) setError(`Дата: ${d.paid_at[0]}`)
      else setError(typeof d === 'object' ? JSON.stringify(d) : (d?.detail || 'Ошибка'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
      {error && (
        <div className="sm:col-span-3 bg-red-50 text-red-600 text-sm rounded-xl p-3">
          {error}
        </div>
      )}
      <div className="min-w-0">
        <label className="block text-xs text-gray-500 mb-1">Сумма *</label>
        <input
          type="number" required min="1"
          value={amount} onChange={e => setAmount(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        />
      </div>
      <div className="min-w-0">
        <label className="block text-xs text-gray-500 mb-1">Дата *</label>
        <input
          type="date" required
          value={paidAt}
          max={todayStr()}
          onChange={e => setPaidAt(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        />
      </div>
      <div className="min-w-0">
        <label className="block text-xs text-gray-500 mb-1">Чек (необязательно)</label>
        <input
          type="file" accept="image/*,.pdf"
          onChange={e => setReceipt(e.target.files[0] || null)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-full bg-white"
        />
        {receipt && <span className="block mt-1 text-xs text-gray-500 truncate">{receipt.name}</span>}
      </div>
      <button
        type="submit" disabled={loading}
        className="sm:col-span-3 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition"
      >
        {loading ? 'Сохранение...' : 'Добавить'}
      </button>
    </form>
  )
}
