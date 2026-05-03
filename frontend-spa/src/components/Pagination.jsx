import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Reusable pagination control.
 * Renders nothing when totalPages <= 1.
 *
 * Props:
 *   page         — current page (1-indexed)
 *   totalPages   — total pages
 *   onChange(p)  — fired when user clicks Prev / Next / a page number
 *   className    — wrapper override
 */
export default function Pagination({ page, totalPages, onChange, className = '' }) {
  if (!totalPages || totalPages <= 1) return null

  const safe = Math.max(1, Math.min(page, totalPages))

  // Compute a compact range of page numbers to show (max 7 entries with ellipses).
  const pages = []
  const window_ = 1 // pages on either side of current
  const add = (n) => pages.push(n)
  add(1)
  if (safe - window_ > 2) add('…l')
  for (let n = Math.max(2, safe - window_); n <= Math.min(totalPages - 1, safe + window_); n++) {
    add(n)
  }
  if (safe + window_ < totalPages - 1) add('…r')
  if (totalPages > 1) add(totalPages)

  return (
    <nav
      aria-label="Постраничная навигация"
      className={`flex items-center justify-center gap-1.5 ${className}`}
    >
      <button
        type="button"
        onClick={() => onChange(safe - 1)}
        disabled={safe <= 1}
        aria-label="Предыдущая страница"
        className="p-2 rounded-lg text-gray-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-rose-200"
      >
        <ChevronLeft size={16} />
      </button>
      {pages.map((p, i) => {
        if (typeof p !== 'number') {
          return (
            <span key={`e${i}`} className="px-1.5 text-gray-400 text-sm select-none">…</span>
          )
        }
        const active = p === safe
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={active ? 'page' : undefined}
            className={`min-w-[34px] px-2.5 py-1.5 rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-rose-200 ${
              active
                ? 'bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow'
                : 'text-gray-700 hover:bg-rose-50 hover:text-rose-600'
            }`}
          >
            {p}
          </button>
        )
      })}
      <button
        type="button"
        onClick={() => onChange(safe + 1)}
        disabled={safe >= totalPages}
        aria-label="Следующая страница"
        className="p-2 rounded-lg text-gray-600 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed transition focus:outline-none focus:ring-2 focus:ring-rose-200"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  )
}
