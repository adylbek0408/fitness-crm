/**
 * Lightweight global toast notification system.
 *
 * Usage:
 *   const toast = useToast()
 *   toast.success('Урок удалён')
 *   toast.error('Ошибка сети')
 *   toast.info('Информация')
 *
 * Add <ToastProvider> once at app root (already in AdminLayout).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

/* ── Context ──────────────────────────────────────────────────────────────── */
const ToastCtx = createContext(null)

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

/* ── Provider ─────────────────────────────────────────────────────────────── */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback(id => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 320)
  }, [])

  const add = useCallback((message, variant = 'success', duration = 2800) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev.slice(-4), { id, message, variant, leaving: false }])
    setTimeout(() => remove(id), duration)
    return id
  }, [remove])

  const api = {
    success: (msg, dur)  => add(msg, 'success', dur),
    error:   (msg, dur)  => add(msg, 'error',   dur ?? 5000),
    info:    (msg, dur)  => add(msg, 'info',     dur),
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <ToastContainer toasts={toasts} onRemove={remove} />,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}

/* ── Container ────────────────────────────────────────────────────────────── */
function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: 'min(360px, calc(100vw - 32px))' }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  )
}

/* ── Item ─────────────────────────────────────────────────────────────────── */
const VARIANTS = {
  success: {
    bg:   'bg-white border border-emerald-100 shadow-[0_4px_24px_rgba(16,185,129,0.15)]',
    icon: <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />,
    bar:  'bg-emerald-400',
    text: 'text-gray-800',
  },
  error: {
    bg:   'bg-white border border-rose-100 shadow-[0_4px_24px_rgba(244,63,94,0.15)]',
    icon: <AlertTriangle size={18} className="text-rose-500 shrink-0" />,
    bar:  'bg-rose-400',
    text: 'text-gray-800',
  },
  info: {
    bg:   'bg-white border border-indigo-100 shadow-[0_4px_24px_rgba(99,102,241,0.12)]',
    icon: <Info size={18} className="text-indigo-500 shrink-0" />,
    bar:  'bg-indigo-400',
    text: 'text-gray-800',
  },
}

function ToastItem({ toast, onRemove }) {
  const v = VARIANTS[toast.variant] || VARIANTS.info
  const mounted = useRef(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Trigger enter animation on next frame
    const t = requestAnimationFrame(() => setVisible(true))
    mounted.current = true
    return () => cancelAnimationFrame(t)
  }, [])

  const leaving = toast.leaving

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-2xl',
        'transition-all duration-300 ease-out will-change-transform',
        v.bg,
        visible && !leaving
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-6',
      ].join(' ')}
      style={{ minWidth: 240 }}
    >
      {v.icon}
      <p className={`flex-1 text-sm font-medium leading-snug ${v.text}`}>{toast.message}</p>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Закрыть"
        className="text-gray-300 hover:text-gray-500 transition shrink-0 -mr-1 mt-0.5"
      >
        <X size={14} />
      </button>
    </div>
  )
}
