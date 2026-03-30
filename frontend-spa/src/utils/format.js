export const fmtMoney = v =>
  Number(v).toLocaleString('ru-RU') + ' сом'

export const fmtDate = d => {
  if (!d) return '—'
  // Парсим как локальную дату без UTC-сдвига
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('ru-RU')
}

export const STATUS_BADGE = {
  active:      'bg-emerald-50 text-emerald-700 border border-emerald-200',
  completed:   'bg-slate-100 text-slate-600 border border-slate-200',
  expelled:    'bg-red-50 text-red-600 border border-red-200',
  frozen:      'bg-sky-50 text-sky-700 border border-sky-200',
  recruitment: 'bg-amber-50 text-amber-700 border border-amber-200',
}

export const STATUS_LABEL = {
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

export const toAbsoluteUrl = (url) => {
  if (!url) return ''
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('//')) return `${window.location.protocol}${url}`
  const normalized = url.startsWith('/') ? url : `/${url}`
  // Для IP:port сервера — используем API base URL
  const apiBase = import.meta.env.VITE_API_BASE || 'http://83.222.10.148:8090'
  return `${apiBase}${normalized}`
}
