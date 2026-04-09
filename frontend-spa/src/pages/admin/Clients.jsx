import { useState, useEffect, useRef } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import {
  CheckCircle, Clock, Globe, Dumbbell, RotateCcw,
  ChevronDown, Search, SlidersHorizontal, X, ChevronLeft, ChevronRight,
  Download, Loader,
} from 'lucide-react'
import jsPDF from 'jspdf'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import DateField from '../../components/DateField'
import { STATUS_BADGE, STATUS_LABEL, fmtMoney, fmtDate } from '../../utils/format'
import { attachRobotoFontsToPdf, PDF_BODY_FONT } from '../../utils/pdfRobotoFonts'

// ─────────────────────────────────────────────────────────────────────────────
// STATUS DROPDOWN
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'active',    label: 'Активный',  dot: 'bg-emerald-500' },
  { value: 'frozen',    label: 'Заморозка', dot: 'bg-blue-500'    },
  { value: 'completed', label: 'Завершил',  dot: 'bg-slate-400'   },
  { value: 'expelled',  label: 'Отчислен',  dot: 'bg-red-500'     },
]

function StatusDropdown({ clientId, currentStatus, onChanged }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  useEffect(() => {
    if (error) { const t = setTimeout(() => setError(''), 3000); return () => clearTimeout(t) }
  }, [error])

  if (currentStatus === 'new') {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE.new}`}>
        {STATUS_LABEL.new}
      </span>
    )
  }

  const changeStatus = async (newStatus) => {
    if (newStatus === currentStatus) { setOpen(false); return }
    setLoading(true); setOpen(false); setError('')
    try {
      const r = await api.post(`/clients/${clientId}/change_status/`, { status: newStatus })
      onChanged(clientId, r.data.status)
    } catch (e) { setError(e.response?.data?.detail || 'Ошибка') }
    finally { setLoading(false) }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={loading}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition
          ${STATUS_BADGE[currentStatus] || 'bg-slate-100 text-slate-600'} hover:opacity-80 disabled:opacity-50 cursor-pointer`}
      >
        {loading
          ? <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : STATUS_LABEL[currentStatus] || currentStatus}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute z-50 top-8 left-0 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 min-w-[150px] animate-fade-in">
          {STATUS_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => changeStatus(opt.value)}
              className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-50 transition flex items-center gap-2.5
                ${opt.value === currentStatus ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
              {opt.label}
              {opt.value === currentStatus && <CheckCircle size={12} className="ml-auto text-indigo-500" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PAY BADGE
// ─────────────────────────────────────────────────────────────────────────────
function PayBadge({ c }) {
  if (c.payment_type === 'full') {
    return c.full_payment?.is_paid
      ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle size={12} /> Оплачено</span>
      : <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium"><Clock size={12} /> Не оплачено</span>
  }
  return c.installment_plan && Number(c.installment_plan.remaining) <= 0
    ? <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><CheckCircle size={12} /> Закрыта</span>
    : <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
        <Clock size={12} /> {fmtMoney(c.installment_plan?.remaining || 0)}
      </span>
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATION — чистый jsPDF, без html2canvas
// ─────────────────────────────────────────────────────────────────────────────
const PDF_STATUS_RGB = {
  new:       [109, 40, 217],
  active:    [5,   150, 105],
  frozen:    [2,   132, 199],
  completed: [71,  85,  105],
  expelled:  [220, 38,  38 ],
}

/**
 * Генерирует PDF-отчёт по клиентам с помощью чистого jsPDF (векторный текст).
 * Roboto + Identity-H — корректная кириллица (не Helvetica).
 * Каждый клиент — отдельный блок с авто-переносом страниц.
 */
async function buildClientsPDF(allClients, historyMap, summary, filterLabels) {
  const pdf   = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  await attachRobotoFontsToPdf(pdf)
  const PW    = pdf.internal.pageSize.getWidth()   // 210
  const PH    = pdf.internal.pageSize.getHeight()  // 297
  const ML    = 14   // margin left
  const MR    = 14   // margin right
  const CW    = PW - ML - MR
  const MT    = 14   // margin top first page
  const MB    = 18   // margin bottom (чуть больше для подвала)

  let y    = MT
  let page = 1

  /** Ширина текста в блоке клиента */
  const textW = CW - 4
  /** Макс. строк истории в одном PDF (защита от десятков страниц на одного клиента) */
  const PDF_HISTORY_MAX_ROWS = 15

  /** Единый ритм строк (мм) и сетка «подпись — значение» */
  const LINE = 5
  const LABEL_W = 38
  const GAP_AFTER_TITLE = 5

  // Цвет линий
  const setGray = (v = 200) => pdf.setDrawColor(v, v, v)

  // ── добавить страницу с мини-шапкой ──────────────────────────────────────
  const addContinuationPage = () => {
    pdf.addPage()
    page++
    y = 12
    pdf.setFontSize(9)
    pdf.setFont(PDF_BODY_FONT, 'normal')
    pdf.setTextColor(90, 90, 110)
    pdf.text(`FITNESS CRM — База клиентов   ·   стр. ${page}`, ML, y)
    setGray(200)
    pdf.setLineWidth(0.35)
    pdf.line(ML, y + 2, ML + CW, y + 2)
    y = 22
  }

  // ── Проверка переноса ─────────────────────────────────────────────────────
  const checkBreak = (need) => {
    if (y + need > PH - MB) { addContinuationPage(); return true }
    return false
  }

  // ── Вспомогательные функции текста ───────────────────────────────────────
  const bold   = () => pdf.setFont(PDF_BODY_FONT, 'bold')
  const normal = () => pdf.setFont(PDF_BODY_FONT, 'normal')
  const rgb    = (r, g, b) => pdf.setTextColor(r, g, b)
  const gray   = (v) => pdf.setTextColor(v, v, v)
  const sz     = (n) => pdf.setFontSize(n)

  /** Многострочный текст; `\n` — новый абзац. Возвращает занятую высоту (мм). */
  const wrapText = (text, x, startY, maxW, lineH = LINE) => {
    let yy = startY
    const paragraphs = String(text || '').split(/\n+/)
    paragraphs.forEach((para, pi) => {
      const chunk = (para || ' ').trim() || ' '
      const lines = pdf.splitTextToSize(chunk, maxW)
      pdf.text(lines, x, yy)
      yy += Math.max(lines.length, 1) * lineH
      if (pi < paragraphs.length - 1) yy += lineH * 0.2
    })
    return yy - startY
  }

  /**
   * Строка: подпись слева (фикс. ширина), значение справа с переносами.
   * Возвращает прибавку к y (мм).
   */
  const rowKeyVal = (baseX, yRef, label, value, {
    labelGray = 100,
    valueRgb = [55, 55, 62],
    fontSize = 8.5,
    labelW = LABEL_W,
    blockTextW = textW,
  } = {}) => {
    const valWInner = blockTextW - labelW - 2
    const valX = baseX + labelW
    const lines = pdf.splitTextToSize(
      value === null || value === undefined || value === '' ? '—' : String(value),
      valWInner
    )
    sz(fontSize)
    bold(); gray(labelGray)
    pdf.text(label, baseX, yRef)
    normal(); rgb(...valueRgb)
    pdf.text(lines, valX, yRef)
    return Math.max(lines.length, 1) * LINE
  }

  // ── ШАПКА ОТЧЁТА (первая страница) ────────────────────────────────────────
  sz(18); bold(); rgb(30, 20, 40)
  pdf.text('FITNESS CRM — База клиентов', ML, y)
  y += 7

  sz(9); normal(); gray(100)
  const dateStr = new Date().toLocaleString('ru-RU', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
  pdf.text(`Дата отчёта: ${dateStr}`, ML, y)

  // Кол-во клиентов справа
  sz(9); bold(); rgb(190, 24, 93)
  pdf.text(`${summary?.total ?? allClients.length} клиентов`, PW - MR, y, { align: 'right' })
  y += 5

  if (filterLabels.length > 0) {
    sz(8.5); normal(); gray(100)
    const labelText = `Фильтры: ${filterLabels.join('  ·  ')}`
    const lh = wrapText(labelText, ML, y, CW, 4)
    y += lh + 1
  }

  // Цветная линия под шапкой
  pdf.setDrawColor(190, 24, 93)
  pdf.setLineWidth(0.6)
  pdf.line(ML, y, ML + CW, y)
  y += 5

  // Сводка по статусам
  if (summary?.by_status) {
    const entries = Object.entries(summary.by_status)
    if (entries.length > 0) {
      let x = ML
      entries.forEach(([st, n]) => {
        const [r, g, b] = PDF_STATUS_RGB[st] || [71, 85, 105]
        sz(8); normal(); rgb(r, g, b)
        const label = `${STATUS_LABEL[st] || st}: ${n}`
        pdf.text(label, x, y)
        x += pdf.getTextWidth(label) + 10
      })
      y += 7
    }
  }

  setGray(220); pdf.setLineWidth(0.15)
  pdf.line(ML, y, ML + CW, y)
  y += 6

  const lx = ML + 3
  const cardInnerW = textW - 4

  // ── КАЖДЫЙ КЛИЕНТ — сетка подпись / значение ──────────────────────────────
  allClients.forEach((c, idx) => {
    const fp      = c.full_payment
    const ip      = c.installment_plan
    const history = historyMap[c.id] || []
    const [sr, sg, sb] = PDF_STATUS_RGB[c.status] || [71, 85, 105]

    checkBreak(85)

    sz(13); bold(); rgb(28, 24, 42)
    pdf.text(`${idx + 1}. ${c.full_name}${c.is_repeat ? '  (повторно)' : ''}`, lx, y)
    y += GAP_AFTER_TITLE + 3

    y += rowKeyVal(lx, y, 'Статус', STATUS_LABEL[c.status] || c.status, {
      labelGray: 92,
      valueRgb: [sr, sg, sb],
      fontSize: 9,
    })
    y += 2
    setGray(238)
    pdf.setLineWidth(0.22)
    pdf.line(lx, y, lx + textW, y)
    y += 4

    y += rowKeyVal(lx, y, 'Телефон', c.phone)
    y += rowKeyVal(lx, y, 'Формат', c.training_format === 'online' ? 'Онлайн' : 'Оффлайн')
    if (c.group_type === '1.5h' || c.group_type === '2.5h') {
      y += rowKeyVal(lx, y, 'Тип группы', c.group_type === '1.5h' ? '1.5 ч' : '2.5 ч')
    }
    if (c.registered_at) y += rowKeyVal(lx, y, 'Регистрация', fmtDate(c.registered_at))
    if (c.registered_by_name) y += rowKeyVal(lx, y, 'Менеджер', c.registered_by_name)
    if (c.trainer?.full_name) y += rowKeyVal(lx, y, 'Тренер', c.trainer.full_name)
    if (c.group) {
      const g = c.group
      y += rowKeyVal(
        lx,
        y,
        'Текущий поток',
        `№${g.number}${g.group_type ? ` (${g.group_type === '1.5h' ? '1.5 ч' : '2.5 ч'})` : ''}`
      )
    }
    if (Number(c.bonus_balance) > 0) {
      y += rowKeyVal(lx, y, 'Бонус', `${fmtMoney(c.bonus_balance)} сом`)
    }

    y += 4
    sz(9); bold(); gray(62)
    pdf.text('Оплата', lx, y)
    y += 6

    if (c.payment_type === 'full' && fp) {
      const paid = fp.is_paid
      y += rowKeyVal(lx, y, 'Тип', paid ? 'Полная оплата' : 'Полная (не подтверждена)')
      if (fp.course_amount && Number(fp.course_amount) !== Number(fp.amount)) {
        y += rowKeyVal(lx, y, 'Сумма курса', `${fmtMoney(fp.course_amount)} сом`)
      }
      y += rowKeyVal(lx, y, 'К оплате', `${fmtMoney(fp.amount)} сом`)
      const stText = paid
        ? `Оплачено${fp.paid_at ? ` · ${new Date(fp.paid_at).toLocaleDateString('ru-RU')}` : ''}`
        : 'Не оплачено'
      y += rowKeyVal(lx, y, 'Статус оплаты', stText, {
        valueRgb: paid ? [18, 125, 72] : [195, 55, 55],
      })

    } else if (c.payment_type === 'installment' && ip) {
      y += rowKeyVal(lx, y, 'Тип', 'Рассрочка')
      y += rowKeyVal(lx, y, 'По договору', `${fmtMoney(ip.total_cost)} сом`)
      y += rowKeyVal(lx, y, 'Оплачено', `${fmtMoney(ip.total_paid)} сом`)
      y += rowKeyVal(lx, y, 'Остаток', `${fmtMoney(ip.remaining)} сом`)
      y += rowKeyVal(lx, y, 'Дедлайн', String(ip.deadline))

      if (ip.payments?.length > 0) {
        y += 3
        checkBreak(10 + ip.payments.length * LINE)
        sz(8.5); bold(); gray(85)
        pdf.text(`Платежи (${ip.payments.length})`, lx, y)
        y += 6
        ip.payments.forEach((p, pi) => {
          const note = p.note ? ` · ${p.note}` : ''
          y += rowKeyVal(
            lx + 2,
            y,
            `${pi + 1}.`,
            `${p.paid_at} · ${fmtMoney(p.amount)} сом${note}`,
            { labelW: 16, blockTextW: textW - 4 }
          )
        })
      }

    } else {
      sz(8.5); normal(); gray(130)
      pdf.text('Нет данных об оплате', lx, y)
      y += LINE
    }

    y += 4

    if (history.length > 0) {
      const totalH = history.length
      const showAll = totalH <= PDF_HISTORY_MAX_ROWS
      const slice = showAll ? history : history.slice(0, PDF_HISTORY_MAX_ROWS)

      checkBreak(24 + slice.length * 28)
      sz(9); bold(); gray(58)
      pdf.text(`История потоков (${totalH})`, lx, y)
      y += 6

      if (!showAll) {
        sz(8); normal(); gray(125)
        y += wrapText(
          `В отчёте: первые ${PDF_HISTORY_MAX_ROWS} из ${totalH} записей архива. Полный список — в карточке клиента.`,
          lx,
          y,
          textW,
          LINE * 0.92
        )
        y += 4
      }

      slice.forEach((h, hi) => {
        checkBreak(30)
        const closed = h.payment_is_closed
        const gShort = `№${h.group_number}${h.group_type ? ` (${h.group_type === '1.5h' ? '1.5 ч' : '2.5 ч'})` : ''}`
        const cardTop = y - 1
        const ix = lx + 2
        const iw = cardInnerW

        if (hi > 0) {
          y += 3
          setGray(238)
          pdf.setLineWidth(0.18)
          pdf.line(lx, y - 1, lx + textW, y - 1)
          y += 4
        }

        sz(8); bold(); gray(120)
        pdf.text(`Запись ${hi + 1} / ${totalH}`, ix, y)
        y += LINE + 1

        y += rowKeyVal(ix, y, 'Поток', gShort, { blockTextW: iw, labelW: 34 })
        y += rowKeyVal(ix, y, 'Тренер', h.trainer_name || '—', { blockTextW: iw, labelW: 34 })
        y += rowKeyVal(
          ix,
          y,
          'Период',
          `${h.start_date || '—'} — ${h.ended_at || '—'}`,
          { blockTextW: iw, labelW: 34 }
        )
        const payKind = h.payment_type === 'full' ? 'Полная' : 'Рассрочка'
        y += rowKeyVal(ix, y, 'Вид оплаты', payKind, { blockTextW: iw, labelW: 34 })
        y += rowKeyVal(
          ix,
          y,
          'Архив сумм',
          `${fmtMoney(h.payment_paid)} / ${fmtMoney(h.payment_amount)} сом`,
          { blockTextW: iw, labelW: 34 }
        )
        y += rowKeyVal(
          ix,
          y,
          'Закрытие',
          closed ? 'Да, задолженность по потоку закрыта' : 'Возможен остаток (по архиву)',
          { valueRgb: closed ? [18, 115, 68] : [175, 90, 25], blockTextW: iw, labelW: 34 }
        )

        const cardH = y - cardTop + 4
        pdf.setDrawColor(215, 219, 228)
        pdf.setLineWidth(0.22)
        pdf.rect(lx, cardTop, textW + 1, cardH, 'S')
        y += 7
      })
    }

    y += 4
    setGray(205); pdf.setLineWidth(0.3)
    pdf.line(ML, y, ML + CW, y)
    y += 10
  })

  // ── Подвал последней страницы ─────────────────────────────────────────────
  sz(7.5); normal(); gray(170)
  pdf.text(
    `Сформировано: ${dateStr}   ·   Всего клиентов: ${allClients.length}   ·   FITNESS CRM`,
    PW / 2, PH - 8, { align: 'center' }
  )

  return pdf
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function Clients() {
  const { user } = useOutletContext()
  const [clients,      setClients]      = useState([])
  const [groups,       setGroups]       = useState([])
  const [count,        setCount]        = useState(0)
  const [page,         setPage]         = useState(1)
  const [search,       setSearch]       = useState('')
  const [status,       setStatus]       = useState('')
  const [format,       setFormat]       = useState('')
  const [group,        setGroup]        = useState('')
  const [groupType,    setGroupType]    = useState('')
  const [isRepeat,     setIsRepeat]     = useState(false)
  const [paymentStatus,setPaymentStatus]= useState('')
  const [registeredFrom,setRegisteredFrom]= useState('')
  const [registeredTo,  setRegisteredTo]  = useState('')
  const [registeredBy,  setRegisteredBy]  = useState('')
  const [trainerFilter, setTrainerFilter] = useState('')
  const [managersList,  setManagersList]  = useState([])
  const [trainersList,  setTrainersList]  = useState([])
  const [onlineTags,    setOnlineTags]    = useState([])
  const [onlineTagFilter,setOnlineTagFilter]= useState('')
  const [summary,      setSummary]      = useState(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [pdfLoading,   setPdfLoading]   = useState(false)
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const totalPages     = Math.ceil(count / 25)
  const loadAbortRef   = useRef(null)
  const loadGenRef     = useRef(0)

  // debounce поиска
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // ── buildFilterParams ──────────────────────────────────────────────────────
  const buildFilterParams = (pageNum) => {
    const p = new URLSearchParams()
    if (pageNum != null)     p.set('page', String(pageNum))
    if (debouncedSearch)     p.append('search',          debouncedSearch)
    if (status)              p.append('status',          status)
    if (format)              p.append('training_format', format)
    if (group)               p.append('group',           group)
    if (groupType)           p.append('group_type',      groupType)
    if (isRepeat)            p.append('is_repeat',       'true')
    if (paymentStatus)       p.append('payment_status',  paymentStatus)
    if (registeredFrom)      p.append('registered_from', registeredFrom)
    if (registeredTo)        p.append('registered_to',   registeredTo)
    if (registeredBy)        p.append('registered_by',   registeredBy)
    if (trainerFilter)       p.append('trainer',         trainerFilter)
    return p
  }

  // ── load clients + summary ─────────────────────────────────────────────────
  const load = async (p = page) => {
    loadAbortRef.current?.abort()
    const ac  = new AbortController()
    loadAbortRef.current = ac
    const gen = ++loadGenRef.current
    setLoading(true)
    const filterParams = buildFilterParams(null)
    const listParams   = new URLSearchParams(filterParams)
    listParams.set('page', String(p))
    try {
      const [r, s] = await Promise.all([
        api.get(`/clients/?${listParams}`,              { signal: ac.signal }),
        api.get(`/clients/stats-summary/?${filterParams}`, { signal: ac.signal }),
      ])
      if (gen !== loadGenRef.current) return
      setClients(r.data.results || [])
      setCount(r.data.count    || 0)
      setSummary(s.data)
    } catch (e) {
      const canceled = e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError' || e?.message === 'canceled'
      if (canceled) return
      setSummary(null)
    } finally {
      if (gen === loadGenRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    api.get('/groups/?page_size=100').then(r => {
      const gs = r.data.results || []
      setGroups(gs)
      const allTags = []
      gs.forEach(g => {
        if (Array.isArray(g.online_subscription_tags)) {
          g.online_subscription_tags.forEach(t => { if (t && !allTags.includes(t)) allTags.push(t) })
        }
      })
      setOnlineTags(allTags)
    })
    api.get('/accounts/managers/?page_size=200').then(r => setManagersList(r.data.results || r.data || []))
    api.get('/trainers/?page_size=200').then(r => setTrainersList(r.data.results || []))
  }, [])

  useEffect(() => {
    setPage(1); load(1)
  }, [debouncedSearch, status, format, group, groupType, isRepeat, paymentStatus,
      registeredFrom, registeredTo, registeredBy, trainerFilter, onlineTagFilter])

  useEffect(() => { load() }, [page])
  useEffect(() => () => { loadAbortRef.current?.abort() }, [])

  const resetFilters = () => {
    setSearch(''); setDebouncedSearch(''); setStatus(''); setFormat(''); setGroup('')
    setGroupType(''); setIsRepeat(false); setPaymentStatus(''); setRegisteredFrom('')
    setRegisteredTo(''); setRegisteredBy(''); setTrainerFilter(''); setOnlineTagFilter('')
    setPage(1); setTimeout(() => load(1), 0)
  }

  const handleStatusChanged = (id, newSt) =>
    setClients(prev => prev.map(c => c.id === id ? { ...c, status: newSt } : c))

  const hasFilters = search || debouncedSearch || status || format || group || groupType ||
    isRepeat || paymentStatus || registeredFrom || registeredTo || registeredBy ||
    trainerFilter || onlineTagFilter

  // ── Лейблы фильтров для PDF ────────────────────────────────────────────────
  const buildFilterLabels = () => {
    const labels = []
    if (status)          labels.push(`Статус: ${STATUS_LABEL[status] || status}`)
    if (format)          labels.push(`Формат: ${format === 'online' ? 'Онлайн' : 'Оффлайн'}`)
    if (groupType)       labels.push(`Тип: ${groupType === '1.5h' ? '1.5 ч' : '2.5 ч'}`)
    if (onlineTagFilter) labels.push(`Подписка: ${onlineTagFilter}`)
    if (paymentStatus)   labels.push(`Оплата: ${paymentStatus === 'paid' ? 'Оплачено' : 'Есть остаток'}`)
    if (isRepeat)        labels.push('Повторные')
    if (group) {
      const g = groups.find(x => x.id === group)
      if (g) labels.push(`Группа: №${g.number}`)
    }
    if (trainerFilter) {
      const t = trainersList.find(x => x.id === trainerFilter)
      if (t) labels.push(`Тренер: ${t.full_name}`)
    }
    if (registeredBy) {
      const m = managersList.find(x => String(x.user_id) === registeredBy)
      if (m) labels.push(`Менеджер: ${[m.last_name, m.first_name].filter(Boolean).join(' ')}`)
    }
    if (registeredFrom || registeredTo)
      labels.push(`Рег.: ${registeredFrom ? fmtDate(registeredFrom) : '...'} — ${registeredTo ? fmtDate(registeredTo) : '...'}`)
    if (debouncedSearch) labels.push(`Поиск: «${debouncedSearch}»`)
    return labels
  }

  // ── СКАЧАТЬ PDF ────────────────────────────────────────────────────────────
  const generatePDF = async () => {
    setPdfLoading(true)
    try {
      // 1. Все клиенты по фильтрам (max 500)
      const fp = buildFilterParams(null)
      fp.set('page_size', '500')
      const r = await api.get(`/clients/?${fp}`)
      const allClients = r.data.results || []

      // 2. История групп — параллельно
      const historyMap = {}
      await Promise.all(
        allClients.map(async c => {
          try {
            const hr = await api.get(`/clients/${c.id}/group-history/`)
            historyMap[c.id] = hr.data || []
          } catch {
            historyMap[c.id] = []
          }
        })
      )

      // 3. Генерируем PDF
      const pdf = await buildClientsPDF(allClients, historyMap, summary, buildFilterLabels())
      const dateLabel = new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')
      pdf.save(`Клиенты_${dateLabel}.pdf`)

    } catch (e) {
      console.error('PDF error:', e)
      const msg = e?.message || ''
      alert(
        msg.includes('Roboto') || msg.includes('шрифт')
          ? 'Не удалось загрузить шрифты для PDF. Проверьте, что файлы fonts/Roboto-*.ttf доступны.'
          : 'Ошибка при формировании PDF. Попробуйте ещё раз.'
      )
    } finally {
      setPdfLoading(false)
    }
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <AdminLayout user={user}>
      {/* Заголовок */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-widest mb-1">CRM</p>
          <h2 className="crm-page-title">База клиентов</h2>
          <p className="crm-page-subtitle">
            {count > 0 ? `${count} клиентов` : 'Поиск, фильтры и статусы'}
          </p>
        </div>
        <button
          onClick={generatePDF}
          disabled={pdfLoading || count === 0}
          className="crm-btn-primary disabled:opacity-50 flex items-center gap-2"
        >
          {pdfLoading
            ? <><Loader size={15} className="animate-spin" /> Формирование...</>
            : <><Download size={15} /> Скачать PDF</>
          }
        </button>
      </div>

      {/* Сводка по фильтрам */}
      {summary && (summary.total > 0 || hasFilters) && (
        <div className="crm-card p-3.5 mb-4 flex flex-wrap gap-2 items-center">
          <span className="text-slate-400 text-xs font-medium">По фильтрам:</span>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-semibold text-xs">
            Всего: {summary.total}
          </span>
          {Object.entries(summary.by_status || {}).map(([st, n]) => (
            <span key={st} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[st] || 'bg-slate-100 text-slate-600'}`}>
              {STATUS_LABEL[st] || st}: {n}
            </span>
          ))}
        </div>
      )}

      {/* Блок фильтров */}
      <div className="crm-card p-4 mb-5">
        <div className="flex flex-wrap gap-2 items-center">
          {/* Поиск */}
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" placeholder="Поиск по имени, телефону..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="crm-input pl-9 w-full"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            )}
          </div>

          <div className="crm-filter-group">
            <span className="crm-filter-label">Статус</span>
            <select value={status} onChange={e => setStatus(e.target.value)} className="crm-input w-36">
              <option value="">Все</option>
              <option value="new">Новые</option>
              <option value="active">Активные</option>
              <option value="frozen">Заморозка</option>
              <option value="completed">Завершили</option>
              <option value="expelled">Отчислены</option>
            </select>
          </div>

          <div className="crm-filter-group">
            <span className="crm-filter-label">Формат</span>
            <select
              value={format}
              onChange={e => { setFormat(e.target.value); setGroupType(''); setOnlineTagFilter('') }}
              className="crm-input w-36"
            >
              <option value="">Все</option>
              <option value="online">Онлайн</option>
              <option value="offline">Оффлайн</option>
            </select>
          </div>

          {format !== 'online' && (
            <div className="crm-filter-group">
              <span className="crm-filter-label">Тип</span>
              <select value={groupType} onChange={e => setGroupType(e.target.value)} className="crm-input w-28">
                <option value="">Все</option>
                <option value="1.5h">1.5 ч</option>
                <option value="2.5h">2.5 ч</option>
              </select>
            </div>
          )}
          {format === 'online' && onlineTags.length > 0 && (
            <div className="crm-filter-group">
              <span className="crm-filter-label">Подписка</span>
              <select value={onlineTagFilter} onChange={e => setOnlineTagFilter(e.target.value)} className="crm-input w-36">
                <option value="">Все</option>
                {onlineTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={() => setShowAdvanced(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition self-end ${
              showAdvanced ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal size={13} /> Ещё фильтры
          </button>
          {hasFilters && (
            <button onClick={resetFilters} className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-700 transition self-end pb-0.5">
              <X size={13} /> Сбросить
            </button>
          )}
        </div>

        {showAdvanced && (
          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-3 items-end animate-fade-in">
            <div className="crm-filter-group">
              <span className="crm-filter-label">Группа</span>
              <select value={group} onChange={e => setGroup(e.target.value)} className="crm-input w-40">
                <option value="">Все группы</option>
                {groups.map(g => <option key={g.id} value={g.id}>Группа {g.number}</option>)}
              </select>
            </div>
            <div className="crm-filter-group">
              <span className="crm-filter-label">Тренер</span>
              <select value={trainerFilter} onChange={e => setTrainerFilter(e.target.value)} className="crm-input w-40">
                <option value="">Все тренеры</option>
                {trainersList.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div className="crm-filter-group">
              <span className="crm-filter-label">Менеджер</span>
              <select value={registeredBy} onChange={e => setRegisteredBy(e.target.value)} className="crm-input w-44">
                <option value="">Все менеджеры</option>
                {managersList.filter(m => m.user_id).map(m => (
                  <option key={m.id} value={String(m.user_id)}>
                    {[m.last_name, m.first_name].filter(Boolean).join(' ') || m.username}
                  </option>
                ))}
              </select>
            </div>
            <div className="crm-filter-group">
              <span className="crm-filter-label">Оплата</span>
              <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)} className="crm-input w-40">
                <option value="">Все</option>
                <option value="paid">Оплачено</option>
                <option value="unpaid">Есть остаток</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none pb-1">
              <input
                type="checkbox" checked={isRepeat} onChange={e => setIsRepeat(e.target.checked)}
                className="rounded border-slate-300 text-pink-600 focus:ring-pink-500/30"
              />
              Повторные
            </label>
            <div className="flex items-end gap-2 flex-wrap">
              <div className="crm-filter-group">
                <span className="crm-filter-label">Рег. с</span>
                <DateField value={registeredFrom} onChange={setRegisteredFrom} />
              </div>
              <div className="crm-filter-group">
                <span className="crm-filter-label">Рег. по</span>
                <DateField value={registeredTo} onChange={setRegisteredTo} align="right" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Таблица клиентов */}
      <div className="crm-card overflow-hidden">
        {/* Мобильный вид */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading && (
            <div className="p-8 text-center">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}
          {!loading && clients.length === 0 && (
            <div className="p-12 text-center text-slate-400">
              <Search size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">Клиенты не найдены</p>
            </div>
          )}
          {!loading && clients.map(c => (
            <div key={c.id} className="p-4 hover:bg-slate-50 transition">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-slate-900">{c.full_name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{c.phone}</p>
                </div>
                <StatusDropdown clientId={c.id} currentStatus={c.status} onChanged={handleStatusChanged} />
              </div>
              <div className="flex flex-wrap gap-2 items-center text-xs text-slate-500 mb-3">
                <span className="flex items-center gap-1">
                  {c.training_format === 'online' ? <Globe size={12} /> : <Dumbbell size={12} />}
                  {c.training_format === 'online' ? 'Онлайн' : 'Оффлайн'}
                </span>
                {c.group && <span className="text-slate-400">· Группа {c.group.number}</span>}
                {c.is_repeat && <span className="flex items-center gap-0.5 text-indigo-500"><RotateCcw size={11} /> Повторный</span>}
                <span className="ml-auto"><PayBadge c={c} /></span>
              </div>
              <Link to={`/admin/clients/${c.id}`} className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition">
                Открыть карточку →
              </Link>
            </div>
          ))}
        </div>

        {/* Десктоп */}
        <div className="hidden md:block">
          {loading ? (
            <div className="py-12 text-center">
              <div className="w-6 h-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : (
            <div className="crm-table-wrap">
              <table className="crm-table min-w-[1080px]">
                <thead>
                  <tr>
                    <th>Клиент</th><th>Телефон</th><th>Формат</th>
                    <th>Группа</th><th>Оплата</th><th>Дата рег.</th>
                    <th>Менеджер</th><th>Статус</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.length === 0 ? (
                    <tr><td colSpan={9} className="text-center py-12 text-slate-400">
                      <Search size={24} className="mx-auto mb-2 opacity-30" />
                      Клиенты не найдены
                    </td></tr>
                  ) : clients.map(c => (
                    <tr key={c.id}>
                      <td>
                        <p className="font-semibold text-slate-900">{c.full_name}</p>
                        {c.is_repeat && (
                          <p className="text-xs text-indigo-500 flex items-center gap-1 mt-0.5">
                            <RotateCcw size={11} /> Повторный
                          </p>
                        )}
                      </td>
                      <td className="text-slate-600">{c.phone}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                          c.training_format === 'online' ? 'bg-blue-50 text-blue-700' : 'bg-violet-50 text-violet-700'
                        }`}>
                          {c.training_format === 'online' ? <Globe size={11} /> : <Dumbbell size={11} />}
                          {c.training_format === 'online' ? 'Онлайн' : 'Оффлайн'}
                        </span>
                      </td>
                      <td className="text-slate-600 text-sm">
                        {c.group ? <span className="font-medium">#{c.group.number}</span> : <span className="text-slate-300">—</span>}
                      </td>
                      <td><PayBadge c={c} /></td>
                      <td className="text-slate-500 text-xs">{fmtDate(c.registered_at)}</td>
                      <td className="text-slate-500 text-xs">{c.registered_by_name || '—'}</td>
                      <td><StatusDropdown clientId={c.id} currentStatus={c.status} onChanged={handleStatusChanged} /></td>
                      <td>
                        <Link to={`/admin/clients/${c.id}`} className="text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition">
                          Открыть →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Пагинация */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="crm-btn-secondary disabled:opacity-40">
            <ChevronLeft size={16} /> Назад
          </button>
          <span className="text-sm text-slate-500">
            Страница <span className="font-semibold text-slate-800">{page}</span> из {totalPages}
            <span className="text-slate-400 ml-2">· {count} клиентов</span>
          </span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="crm-btn-secondary disabled:opacity-40">
            Вперёд <ChevronRight size={16} />
          </button>
        </div>
      )}
    </AdminLayout>
  )
}
