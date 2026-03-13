export const fmtMoney = v =>
  Number(v).toLocaleString('ru-RU') + ' сом'

export const fmtDate = d =>
  d ? new Date(d).toLocaleDateString('ru-RU') : '—'

export const STATUS_BADGE = {
  active:      'bg-green-100 text-green-700',
  completed:   'bg-gray-100 text-gray-600',
  expelled:    'bg-red-100 text-red-600',
  recruitment: 'bg-yellow-100 text-yellow-700',
}

export const STATUS_LABEL = {
  active:      'Активный',
  completed:   'Завершил',
  expelled:    'Отчислен',
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
  return `${window.location.origin}${normalized}`
}
