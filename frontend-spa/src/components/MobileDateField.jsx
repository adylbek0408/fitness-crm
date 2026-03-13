import { useMemo, useState } from 'react'
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

export default function MobileDateField({ label, value, onChange, placeholder = 'Выберите дату' }) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => toDateFromIso(value), [value])

  const displayValue = selected
    ? selected.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : placeholder

  return (
    <>
      <div>
        {label && <label className="block text-sm text-slate-500 mb-1.5">{label}</label>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="crm-mobile-input text-left flex items-center justify-between"
        >
          <span className={selected ? 'text-slate-800' : 'text-slate-400'}>{displayValue}</span>
          <Calendar size={18} className="text-slate-500" />
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[1px] p-4 flex items-end sm:items-center justify-center">
          <div className="w-full sm:w-auto max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">Выберите дату</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 inline-flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 mobile-daypicker-wrap">
              <DayPicker
                mode="single"
                locale={ru}
                selected={selected}
                onSelect={(date) => {
                  if (!date) return
                  onChange(toIsoFromDate(date))
                  setOpen(false)
                }}
              />
            </div>

            <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onChange('')}
                className="crm-btn-secondary py-2 px-3"
              >
                Сбросить
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="crm-btn-primary py-2 px-3"
              >
                Готово
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
