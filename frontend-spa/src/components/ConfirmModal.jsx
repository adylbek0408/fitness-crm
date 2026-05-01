import { useState, useEffect, useRef } from 'react'
import { AlertTriangle, X } from 'lucide-react'

/**
 * Переиспользуемый модальный компонент подтверждения.
 *
 * Props:
 *   open       — boolean
 *   onClose    — () => void
 *   onConfirm  — async () => void   (может быть async)
 *   title      — string
 *   message    — string | ReactNode
 *   confirmText — string (default: 'Подтвердить')
 *   cancelText  — string (default: 'Отмена')
 *   variant     — 'danger' | 'warning' | 'info' (default: 'danger')
 */
export default function ConfirmModal({
  open, onClose, onConfirm,
  title = 'Подтверждение',
  message = 'Вы уверены?',
  confirmText = 'Подтвердить',
  cancelText = 'Отмена',
  variant = 'danger',
}) {
  const [loading, setLoading] = useState(false)
  const cancelRef = useRef(null)

  // ESC + body scroll lock + focus management
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape' && !loading) onClose() }
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Default focus on cancel — safer for destructive actions
    const t = setTimeout(() => cancelRef.current?.focus(), 0)
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prev
      clearTimeout(t)
    }
  }, [open, onClose, loading])

  if (!open) return null

  const variantStyles = {
    danger:  { iconBg: 'bg-red-100',    iconColor: 'text-red-600',    btnBg: 'bg-red-600 hover:bg-red-700',    btnShadow: 'shadow-red-200',    ring: 'focus:ring-red-300' },
    warning: { iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  btnBg: 'bg-amber-600 hover:bg-amber-700', btnShadow: 'shadow-amber-200', ring: 'focus:ring-amber-300' },
    info:    { iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', btnBg: 'bg-indigo-600 hover:bg-indigo-700', btnShadow: 'shadow-indigo-200', ring: 'focus:ring-indigo-300' },
  }
  const vs = variantStyles[variant] || variantStyles.danger

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={!loading ? onClose : undefined}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full animate-fade-in overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={loading}
          aria-label="Закрыть"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-slate-300 rounded disabled:opacity-50"
        >
          <X size={18} />
        </button>

        <div className="p-6">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-2xl ${vs.iconBg} flex items-center justify-center mb-4`}>
            <AlertTriangle size={22} className={vs.iconColor} aria-hidden="true" />
          </div>

          {/* Title */}
          <h3 id="confirm-title" className="text-lg font-bold text-slate-800 mb-2">{title}</h3>

          {/* Message */}
          <div id="confirm-message" className="text-sm text-slate-500 leading-relaxed whitespace-pre-line">
            {message}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 px-6 pb-6">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-60 ${vs.btnBg} shadow-lg ${vs.btnShadow} ${vs.ring} focus:outline-none focus:ring-2 flex items-center justify-center gap-2`}
          >
            {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
