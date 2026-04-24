export const fmtMoney = v =>
  Number(v).toLocaleString('ru-RU') + ' сом'

export const fmtDate = d => {
  if (!d) return '—'
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('ru-RU')
}

export const fmtDateTime = dt => {
  if (!dt) return '—'
  try {
    const date = new Date(dt)
    if (isNaN(date.getTime())) return String(dt)
    return date.toLocaleString('ru-RU', {
      day:    '2-digit',
      month:  '2-digit',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(dt)
  }
}

export const STATUS_BADGE = {
  new:         'bg-violet-50 text-violet-700 border border-violet-200',
  trial:       'bg-orange-50 text-orange-700 border border-orange-200',
  active:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
  completed:   'bg-slate-100 text-slate-600 border border-slate-200',
  expelled:    'bg-red-50 text-red-600 border border-red-200',
  frozen:      'bg-sky-50 text-sky-700 border border-sky-200',
  recruitment: 'bg-amber-50 text-amber-700 border border-amber-200',
}

export const STATUS_LABEL = {
  new:         'Новый',
  trial:       'Пробный',
  active:      'Активный',
  completed:   'Завершил',
  expelled:    'Отчислен',
  frozen:      'Заморозка',
  recruitment: 'Набор',
}

export const GROUP_TYPE_LABEL = {
  '1.5h': '1.5 часа',
  '2.5h': '2.5 часа',
}

// ── URL бэкенда Django (из .env) ─────────────────────────────────────────
const BACKEND_ORIGIN = import.meta.env.VITE_BACKEND_ORIGIN || ''

export const toAbsoluteUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return `${window.location.protocol}${url}`

  const normalized = url.startsWith('/') ? url : `/${url}`

  if (normalized.startsWith('/media/')) {
    if (BACKEND_ORIGIN) return `${BACKEND_ORIGIN}${normalized}`
    return `${window.location.origin}${normalized}`
  }

  return `${window.location.origin}${normalized}`
}

export const openReceiptUrl = (url) => {
  const abs = toAbsoluteUrl(url)
  if (!abs) return
  window.open(abs, '_blank', 'noopener,noreferrer')
}
