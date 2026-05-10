/**
 * AppSelect — styled wrapper around native <select>.
 *
 * Drop-in replacement: swap <select> for <AppSelect>, keep all
 * <option> children and value/onChange unchanged.
 *
 * Props:
 *   value, onChange, children  — same as native <select>
 *   className                  — applied to the wrapper div (use for width, e.g. "w-36")
 *   variant                    — 'default' (admin, h-9) | 'mobile' (h-11, larger text)
 *   disabled                   — passed through to native select
 *   ...rest                    — any other native select props (e.g. required, id)
 */
import { ChevronDown } from 'lucide-react'

const VARIANTS = {
  default: {
    wrap:   'h-9',
    select: 'h-9 pl-3 pr-8 text-[13px] rounded-xl',
    icon:   'right-2.5 w-[15px] h-[15px]',
  },
  mobile: {
    wrap:   'h-11',
    select: 'h-11 pl-3.5 pr-10 text-[15px] rounded-xl',
    icon:   'right-3 w-[17px] h-[17px]',
  },
}

export default function AppSelect({
  value,
  onChange,
  children,
  className = '',
  variant = 'default',
  disabled = false,
  ...rest
}) {
  const v = VARIANTS[variant] ?? VARIANTS.default

  return (
    <div className={`relative inline-flex items-center ${v.wrap} ${className}`}>
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={[
          'w-full appearance-none bg-white',
          'border border-gray-200',
          'text-gray-700 font-medium',
          'cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400',
          'hover:border-rose-200',
          'transition-colors duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          v.select,
        ].join(' ')}
        {...rest}
      >
        {children}
      </select>

      <ChevronDown
        className={`absolute top-1/2 -translate-y-1/2 text-rose-400 pointer-events-none shrink-0 ${v.icon}`}
      />
    </div>
  )
}
