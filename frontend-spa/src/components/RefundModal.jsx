import { useState, useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { fmtMoney } from '../utils/format'

/**
 * Возврат с полем «Сумма удержания» и расчётом суммы к возврату клиенту.
 */
export default function RefundModal({
  open,
  onClose,
  onConfirm,
  clientName,
  totalPaid,
  paymentLabel = 'оплата',
  variant = 'danger',
}) {
  const [retention, setRetention] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) setRetention('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const paid = Number(totalPaid) || 0
  const r = parseFloat(String(retention).replace(',', '.')) || 0
  const refundToClient = Math.max(0, paid - r)
  const invalid = r < 0 || r > paid + 1e-9

  const variantStyles = {
    danger:  { iconBg: 'bg-red-100',    iconColor: 'text-red-600',    btnBg: 'bg-red-600 hover:bg-red-700',    btnShadow: 'shadow-red-200' },
    warning: { iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  btnBg: 'bg-amber-600 hover:bg-amber-700', btnShadow: 'shadow-amber-200' },
  }
  const vs = variantStyles[variant] || variantStyles.danger

  const handleConfirm = async () => {
    if (invalid) return
    setLoading(true)
    try {
      await onConfirm(r)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full animate-fade-in overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition">
          <X size={18} />
        </button>

        <div className="p-6">
          <div className={`w-12 h-12 rounded-2xl ${vs.iconBg} flex items-center justify-center mb-4`}>
            <AlertTriangle size={22} className={vs.iconColor} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">Возврат средств</h3>
          <p className="text-sm text-slate-500 mb-4">
            Клиент: <strong className="text-slate-700">{clientName}</strong>
            <br />
            Укажите сумму удержания за посещённые занятия (остаётся компании). Бонусы с этой оплаты будут полностью аннулированы.
          </p>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Оплачено ({paymentLabel})</span>
              <span className="font-semibold text-slate-800 crm-money">{fmtMoney(paid)}</span>
            </div>
            <label className="block">
              <span className="text-slate-600 font-medium">Сумма удержания</span>
              <input
                type="text"
                inputMode="decimal"
                value={retention}
                onChange={e => setRetention(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-800 focus:ring-2 focus:ring-red-200 focus:border-red-300 outline-none"
              />
            </label>
            <div className="flex justify-between py-2 bg-emerald-50 rounded-xl px-3 border border-emerald-100">
              <span className="text-emerald-800">К возврату клиенту</span>
              <span className="font-bold text-emerald-700 crm-money">{fmtMoney(refundToClient)}</span>
            </div>
            {invalid && (
              <p className="text-red-600 text-xs">Удержание не может быть отрицательным или больше оплаченной суммы.</p>
            )}
          </div>
        </div>

        <div className="flex gap-3 px-6 pb-6">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || invalid}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-60 ${vs.btnBg} shadow-lg ${vs.btnShadow} flex items-center justify-center gap-2`}
          >
            {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Сделать возврат
          </button>
        </div>
      </div>
    </div>
  )
}
