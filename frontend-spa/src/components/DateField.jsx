import { useState, useMemo, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { ru } from 'date-fns/locale'
import { Calendar, X } from 'lucide-react'
import 'react-day-picker/dist/style.css'

function toDateFromIso(iso) {
  if (!iso) return undefined
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

function toIsoFromDate(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * DateField — красивый date-picker для десктопного интерфейса.
 * Аналог MobileDateField, но для admin-страниц.
 *
 * Props:
 *   value     — ISO string "YYYY-MM-DD" или ''
 *   onChange  — (iso: string) => void
 *   label     — подпись над полем (опционально)
 *   placeholder — текст-заглушка
 *   align     — 'left' | 'right' (где открывается попап)
 */
export default function DateField({
  value,
  onChange,
  placeholder = 'дд.мм.гггг',
  label,
  align = 'left',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = useMemo(() => toDateFromIso(value), [value])

  const displayValue = selected
    ? selected.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : ''

  useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      {label && (
        <label className="crm-filter-label">{label}</label>
      )}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`crm-input flex items-center justify-between gap-2 cursor-pointer text-left transition-all hover:border-pink-300 ${
          open ? 'border-pink-400 shadow-[0_0_0_3px_rgba(190,24,93,0.10)]' : ''
        } ${value ? 'text-slate-800' : 'text-slate-400'}`}
        style={{ minWidth: 130 }}
      >
        <span className="text-[13px] flex-1 truncate">
          {displayValue || placeholder}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); onChange('') }}
            className="text-slate-300 hover:text-slate-500 transition shrink-0 cursor-pointer"
          >
            <X size={13} />
          </span>
        ) : (
          <Calendar size={13} className="text-slate-300 shrink-0" />
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 top-[calc(100%+6px)] bg-white rounded-2xl shadow-2xl border border-slate-100 p-2 admin-daypicker-wrap animate-fade-in"
          style={{ [align === 'right' ? 'right' : 'left']: 0 }}
        >
          <DayPicker
            mode="single"
            locale={ru}
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (!date) return
              onChange(toIsoFromDate(date))
              setOpen(false)
            }}
          />
          {value && (
            <div className="px-3 pb-2 border-t border-slate-100 pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => { onChange(''); setOpen(false) }}
                className="text-xs text-slate-400 hover:text-red-500 transition font-medium"
              >
                Сбросить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
