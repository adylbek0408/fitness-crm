import { useEffect } from 'react'
import { CheckCircle, AlertTriangle, X, Info } from 'lucide-react'

/**
 * Модальное окно-уведомление (замена alert()).
 *
 * Props:
 *   open      — boolean
 *   onClose   — () => void
 *   title     — string
 *   message   — string | ReactNode
 *   variant   — 'success' | 'error' | 'info' (default: 'info')
 */
export default function AlertModal({
  open, onClose,
  title = 'Уведомление',
  message = '',
  variant = 'info',
}) {
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape' || e.key === 'Enter') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const styles = {
    success: { iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', Icon: CheckCircle, btnBg: 'bg-emerald-600 hover:bg-emerald-700' },
    error:   { iconBg: 'bg-red-100',     iconColor: 'text-red-600',     Icon: AlertTriangle, btnBg: 'bg-red-600 hover:bg-red-700' },
    info:    { iconBg: 'bg-indigo-100',   iconColor: 'text-indigo-600',  Icon: Info, btnBg: 'bg-indigo-600 hover:bg-indigo-700' },
  }
  const s = styles[variant] || styles.info

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-sm w-full animate-fade-in overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition">
          <X size={18} />
        </button>

        <div className="p-6 text-center">
          <div className={`w-12 h-12 rounded-2xl ${s.iconBg} flex items-center justify-center mx-auto mb-4`}>
            <s.Icon size={22} className={s.iconColor} />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed whitespace-pre-line">{message}</p>
        </div>

        <div className="px-6 pb-6">
          <button type="button" onClick={onClose}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold text-white transition ${s.btnBg}`}>
            Понятно
          </button>
        </div>
      </div>
    </div>
  )
}
