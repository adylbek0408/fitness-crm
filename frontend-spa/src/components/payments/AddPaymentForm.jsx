import { useState } from 'react'
import api from '../../api/axios'

export default function AddPaymentForm({ planId, onSuccess }) {
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState('')
  const [note, setNote] = useState('')
  const [receipt, setReceipt] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('amount', amount)
      formData.append('paid_at', paidAt)
      if (note) formData.append('note', note)
      if (receipt) formData.append('receipt', receipt)

      await api.post(
        `/payments/installment/${planId}/payments/`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )

      setAmount('')
      setPaidAt('')
      setNote('')
      setReceipt(null)
      if (onSuccess) {
        setTimeout(() => onSuccess(), 100)
      }
    } catch (e) {
      const d = e.response?.data
      setError(typeof d === 'object' ? JSON.stringify(d) : (d?.detail || 'Ошибка'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 items-end">
      {error && (
        <div className="w-full bg-red-50 text-red-600 text-sm rounded-xl p-3 mb-2">
          {error}
        </div>
      )}
      <div className="min-w-0">
        <label className="block text-xs text-gray-500 mb-1">Сумма *</label>
        <input
          type="number"
          required
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        />
      </div>
      <div className="min-w-0">
        <label className="block text-xs text-gray-500 mb-1">Дата *</label>
        <input
          type="date"
          required
          value={paidAt}
          onChange={e => setPaidAt(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        />
      </div>
      <div className="min-w-0">
        <label className="block text-xs text-gray-500 mb-1">Комментарий</label>
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-full"
        />
      </div>
      <div className="min-w-0">
        <label className="block text-xs text-gray-500 mb-1">Чек (необязательно)</label>
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={e => setReceipt(e.target.files[0] || null)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-full bg-white"
        />
        {receipt && (
          <span className="block mt-1 text-xs text-gray-500 truncate">
            {receipt.name}
          </span>
        )}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="sm:col-span-2 xl:col-span-4 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition"
      >
        {loading ? 'Сохранение...' : 'Добавить'}
      </button>
    </form>
  )
}

