/**
 * AppSelect — fully styled dropdown using Headless UI Listbox.
 *
 * Drop-in replacement for native <select>:
 *   - Keep all <option> children unchanged
 *   - Keep value / onChange(e) unchanged (e.target.value pattern)
 *   - Use className for outer width (e.g. "w-36")
 *   - variant="mobile" for larger touch targets
 */
import React from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import { Fragment } from 'react'

function parseOptions(children) {
  return React.Children.toArray(children)
    .filter(child => child && child.type === 'option')
    .map(child => ({
      value: child.props.value ?? '',
      label: child.props.children ?? '',
    }))
}

const SIZES = {
  default: { button: 'h-9 pl-3 pr-8 text-[13px] rounded-xl', icon: 15 },
  mobile:  { button: 'h-11 pl-3.5 pr-10 text-[15px] rounded-xl', icon: 17 },
}

export default function AppSelect({
  value,
  onChange,
  children,
  className = '',
  variant = 'default',
  disabled = false,
  id,
  required,
}) {
  const sz      = SIZES[variant] ?? SIZES.default
  const options = parseOptions(children)
  const selected = options.find(o => String(o.value) === String(value)) ?? options[0] ?? { value: '', label: '' }

  const handleChange = (opt) => {
    onChange({ target: { value: opt.value } })
  }

  return (
    <Listbox value={selected} onChange={handleChange} disabled={disabled}>
      <div className={`relative ${className}`}>
        {/* Trigger button */}
        <Listbox.Button
          id={id}
          className={[
            'w-full flex items-center justify-between gap-2',
            'bg-white border border-gray-200 text-gray-700 font-medium',
            'focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400',
            'hover:border-rose-200 transition-colors duration-150',
            'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
            sz.button,
          ].join(' ')}
        >
          <span className="truncate text-left">{selected.label}</span>
          <ChevronDown size={sz.icon} className="shrink-0 text-rose-400" aria-hidden />
        </Listbox.Button>

        {/* Dropdown */}
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
          enter="transition ease-out duration-150"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
        >
          <Listbox.Options className="absolute z-50 mt-1 w-full min-w-[140px] bg-white border border-gray-100 rounded-2xl shadow-xl py-1.5 focus:outline-none overflow-auto max-h-60">
            {options.map((opt) => (
              <Listbox.Option key={opt.value} value={opt} as={Fragment}>
                {({ active, selected: isSelected }) => (
                  <li
                    className={[
                      'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer select-none',
                      active ? 'bg-rose-50 text-rose-700' : 'text-gray-700',
                    ].join(' ')}
                  >
                    <span className="w-4 shrink-0 flex items-center justify-center">
                      {isSelected && <Check size={13} className="text-rose-500" />}
                    </span>
                    <span className="flex-1 truncate">{opt.label}</span>
                  </li>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  )
}
