import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { Download, Loader, ChevronDown, ChevronUp, Check, Search, X } from 'lucide-react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { fmtMoney, STATUS_LABEL } from '../../utils/format'

// ── Константы дней ─────────────────────────────────────────────────────────────
const DAY_KEYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
// Русские сокращения для экрана и PDF
const DAY_RU     = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' }
const DAY_RU_IDX = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']

// Максимум дат в PDF-таблице посещаемости (чтобы таблица не переполнялась)
const PDF_MAX_DATES = 30

function parseScheduleDays(schedule) {
  if (!schedule) return []
  return schedule.split(' ')[0].split(',').filter(d=>DAY_KEYS.includes(d)).map(d=>DAY_KEYS.indexOf(d))
}
function scheduleLabel(schedule) {
  if (!schedule) return '—'
  const parts = schedule.split(' ')
  const days = parts[0].split(',').map(d=>DAY_RU[d]||d).join(', ')
  return days + (parts[1] ? ` · ${parts[1]}` : '')
}
function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayISO() { return localDateISO() }

function getLessonDates(schedule, startDate, maxDates = Infinity) {
  const nums = parseScheduleDays(schedule)
  if (!nums.length || !startDate) return []
  const today = todayISO()
  const dates = []
  const cur = new Date(startDate + 'T00:00:00')
  while (true) {
    const iso = localDateISO(cur)
    if (iso > today) break
    if (nums.includes(cur.getDay())) dates.push(iso)
    cur.setDate(cur.getDate() + 1)
  }
  // Возвращаем последние maxDates дат (самые свежие)
  return dates.reverse().slice(0, maxDates)
}

// Формат даты для экрана: "Пн  03.04"
function formatDateWithDay(str) {
  if (!str) return ''
  const date = new Date(str + 'T00:00:00')
  const [, m, d] = str.split('-')
  return `${DAY_RU_IDX[date.getDay()]}  ${d}.${m}`
}

const STATUS_LABEL_UI = { recruitment:'Набор', active:'Активный', completed:'Завершён' }
const STATUS_COLOR    = { active:'bg-green-100 text-green-700', recruitment:'bg-yellow-100 text-yellow-700', completed:'bg-gray-100 text-gray-600' }
const GROUP_TYPE_LABEL = { '1.5h':'1.5 ч', '2.5h':'2.5 ч' }

// ── PDF: финансовый раздел рендерится как HTML → html2canvas ─────────────────
// Кириллица в jsPDF требует встраивания шрифта. Проще:
// рендерим данные в скрытый div → html2canvas → PNG → в PDF.
// Всё на русском, никакой транслитерации.
function FinancePDFPreview({ dash, byGroup, byTrainer, innerRef }) {
  if (!dash) return null
  return (
    <div ref={innerRef} style={{
      width: 1100, background: '#fff', padding: '32px 40px',
      fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 13,
    }}>
      {/* Заголовок */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, borderBottom:'2px solid #e2e8f0', paddingBottom:12 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:'bold', color:'#1e293b' }}>Асылзада CRM — Финансовый отчёт</div>
          <div style={{ fontSize:12, color:'#94a3b8', marginTop:3 }}>{new Date().toLocaleDateString('ru-RU', { day:'2-digit', month:'long', year:'numeric' })}</div>
        </div>
      </div>

      {/* Карточки */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, marginBottom:28 }}>
        {[
          ['Общий доход',   Number(dash.total_revenue).toLocaleString('ru-RU') + ' сом',  '#2563eb'],
          ['Онлайн доход',  Number(dash.online_revenue).toLocaleString('ru-RU') + ' сом', '#6d28d9'],
          ['Офлайн доход',  Number(dash.offline_revenue).toLocaleString('ru-RU') + ' сом','#9333ea'],
          ['Всего НБ',      String(dash.total_absences),                                   '#dc2626'],
        ].map(([label, val, color]) => (
          <div key={label} style={{ background:'#f8fafc', borderRadius:10, padding:'14px 16px', border:'1px solid #e2e8f0' }}>
            <div style={{ fontSize:11, color:'#64748b', marginBottom:4 }}>{label}</div>
            <div style={{ fontSize:18, fontWeight:'bold', color }}>{val}</div>
          </div>
        ))}
      </div>

      {/* Регистрации */}
      {dash.clients_registered_total != null && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:15, fontWeight:'bold', color:'#1e293b', marginBottom:10 }}>Регистрация клиентов (по фильтрам дат / менеджера)</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <div style={{ background:'#f0fdf4', borderRadius:10, padding:'12px 16px', border:'1px solid #bbf7d0' }}>
              <div style={{ fontSize:11, color:'#64748b' }}>Всего за период</div>
              <div style={{ fontSize:18, fontWeight:'bold', color:'#15803d' }}>{dash.clients_registered_total}</div>
            </div>
            {dash.clients_registered_by_status && Object.entries(dash.clients_registered_by_status).map(([st, n]) => (
              <div key={st} style={{ background:'#f8fafc', borderRadius:10, padding:'12px 16px', border:'1px solid #e2e8f0' }}>
                <div style={{ fontSize:11, color:'#64748b' }}>{STATUS_LABEL[st] || st}</div>
                <div style={{ fontSize:16, fontWeight:'bold', color:'#334155' }}>{n}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Доход по группам */}
      <div style={{ marginBottom:28 }}>
        <div style={{ fontSize:15, fontWeight:'bold', color:'#1e293b', marginBottom:10 }}>Доход по группам</div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#eff6ff' }}>
              {['Группа','Тренер','Статус','Клиентов','Доход'].map(h => (
                <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#3b82f6', fontWeight:'bold', borderBottom:'1px solid #dbeafe' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byGroup.map((g, i) => (
              <tr key={g.group_id} style={{ background: i%2===0 ? '#fff' : '#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                <td style={{ padding:'7px 12px', fontWeight:'600' }}>Группа {g.group_number}</td>
                <td style={{ padding:'7px 12px', color:'#475569' }}>{g.trainer||'—'}</td>
                <td style={{ padding:'7px 12px', color:'#475569' }}>{{ recruitment:'Набор', active:'Активный', completed:'Завершён' }[g.status]||g.status}</td>
                <td style={{ padding:'7px 12px', color:'#475569' }}>{g.client_count}</td>
                <td style={{ padding:'7px 12px', color:'#2563eb', fontWeight:'600' }}>{Number(g.revenue).toLocaleString('ru-RU')} сом</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Доход по тренерам */}
      <div>
        <div style={{ fontSize:15, fontWeight:'bold', color:'#1e293b', marginBottom:10 }}>Доход по тренерам</div>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#eff6ff' }}>
              {['Тренер','Клиентов','Доход'].map(h => (
                <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#3b82f6', fontWeight:'bold', borderBottom:'1px solid #dbeafe' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byTrainer.map((t, i) => (
              <tr key={t.trainer_id} style={{ background: i%2===0 ? '#fff' : '#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                <td style={{ padding:'7px 12px', fontWeight:'600' }}>{t.trainer_name}</td>
                <td style={{ padding:'7px 12px', color:'#475569' }}>{t.client_count}</td>
                <td style={{ padding:'7px 12px', color:'#2563eb', fontWeight:'600' }}>{Number(t.revenue).toLocaleString('ru-RU')} сом</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Один блок (скриншот html2canvas) в PDF A4 portrait; кириллица сохраняется. */
function appendCanvasBlockToPdf(pdf, canvas, { addPageBefore = true } = {}) {
  if (!canvas?.width || !canvas?.height || canvas.width < 2 || canvas.height < 2) return
  const PW = pdf.internal.pageSize.getWidth()
  const PH = pdf.internal.pageSize.getHeight()
  const margin = 8
  const availW = PW - margin * 2
  const availH = PH - margin * 2
  const imgW = canvas.width
  const imgH = canvas.height
  const scaleImg = Math.min(availW / imgW, availH / imgH)
  const rendW = imgW * scaleImg
  const rendH = imgH * scaleImg

  if (addPageBefore) pdf.addPage()

  if (rendH <= availH) {
    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, rendW, rendH)
  } else {
    const rowH = availH
    const srcRowH = rowH / scaleImg
    let srcY = 0
    while (srcY < imgH) {
      if (srcY > 0) pdf.addPage()
      const srcH = Math.min(srcRowH, imgH - srcY)
      const pageCanvas = document.createElement('canvas')
      pageCanvas.width = imgW
      pageCanvas.height = srcH
      pageCanvas.getContext('2d').drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH)
      const pageRendH = srcH * scaleImg
      pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, rendW, pageRendH)
      srcY += srcH
    }
  }
}

// ── Компонент таблицы посещаемости ─────────────────────────────────────────────
function GroupAttendanceHistory({ group, clients, onAttendanceLoaded, containerRef }) {
  const offlineClients = useMemo(() => clients.filter(c => c.training_format === 'offline'), [clients])
  const lessonDates    = useMemo(() => getLessonDates(group.schedule, group.start_date), [group.schedule, group.start_date])
  const [attendance, setAttendance] = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [expanded,   setExpanded]   = useState(true)

  useEffect(() => {
    if (!offlineClients.length || !lessonDates.length) {
      setLoading(false); setAttendance({}); return
    }
    setLoading(true)
    api.get(`/attendance/group/${group.id}/all/`)
      .then(r => {
        const mapped = {}
        Object.entries(r.data).forEach(([date, recs]) => {
          mapped[date] = {}
          recs.forEach(rec => { mapped[date][rec.client] = rec.is_absent })
        })
        setAttendance(mapped)
        onAttendanceLoaded?.(group.id, mapped)
      })
      .catch(() => setAttendance({}))
      .finally(() => setLoading(false))
  }, [group.id])

  if (!offlineClients.length) return (
    <div className="crm-card p-4 text-center text-sm" style={{ color:'var(--text-xs)' }}>
      Группа #{group.number} — нет офлайн-клиентов
    </div>
  )
  if (!lessonDates.length) return (
    <div className="crm-card p-4 text-center text-sm" style={{ color:'var(--text-xs)' }}>
      Группа #{group.number} — нет прошедших занятий
    </div>
  )

  const att = attendance || {}
  const totalAbsent = offlineClients.reduce((s,c) =>
    s + lessonDates.filter(d => att[d]?.[c.id] === true).length, 0
  )
  const dateAbsent = date => offlineClients.filter(c => att[date]?.[c.id] === true).length

  return (
    <div ref={containerRef} className="crm-card overflow-hidden">
      {/* Шапка */}
      <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3" style={{ background:'#fdf8fa' }}>
        <div className="flex items-center gap-2">
          <button onClick={() => setExpanded(v => !v)} style={{ color:'var(--text-xs)' }} className="hover:opacity-70 transition">
            {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
          </button>
          <span className="font-semibold" style={{ color:'var(--text)' }}>Группа #{group.number}</span>
          <span className="text-xs" style={{ color:'var(--text-xs)' }}>
            {GROUP_TYPE_LABEL[group.group_type]} · {scheduleLabel(group.schedule)}
          </span>
        </div>
        <span className="text-xs" style={{ color:'var(--text-soft)' }}>
          Тренер: <strong>{group.trainer?.full_name||'—'}</strong>
        </span>
        <span className="text-xs" style={{ color:'var(--text-soft)' }}>
          Старт: <strong>{group.start_date}</strong>
        </span>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {loading && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color:'var(--text-xs)' }}>
              <Loader size={12} className="animate-spin" /> Загрузка...
            </span>
          )}
          <span className="text-xs" style={{ color:'var(--text-soft)' }}>
            Занятий: <strong>{lessonDates.length}</strong>
          </span>
          <span className="text-xs font-medium" style={{ color:'#2563eb' }}>
            Офлайн: {offlineClients.length}
          </span>
          <span className="text-xs font-semibold" style={{ color:'#be123c' }}>
            НБ: {loading ? '...' : totalAbsent}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth:600 }}>
            <thead style={{ background:'#fdf8fa', borderBottom:'1px solid var(--border)' }}>
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold" style={{ color:'var(--text-soft)', minWidth:160 }}>Клиент</th>
                {lessonDates.map(date => {
                  const [day, d] = formatDateWithDay(date).split('  ')
                  return (
                    <th key={date} className="text-center px-1 py-2" style={{ color:'var(--text-soft)', minWidth:56 }}>
                      <div className="font-semibold">{day}</div>
                      <div style={{ color:'var(--text-xs)', fontWeight:400 }}>{d}</div>
                    </th>
                  )
                })}
                <th className="text-center px-4 py-2.5 font-semibold" style={{ color:'#be123c', minWidth:48 }}>НБ</th>
              </tr>
            </thead>
            <tbody>
              {offlineClients.map((client, i) => {
                const clientAbsent = lessonDates.filter(d => att[d]?.[client.id] === true).length
                return (
                  <tr key={client.id} style={{ background:i%2===0?'#fff':'#fdf8fa', borderBottom:'1px solid var(--border-soft)' }}>
                    <td className="px-4 py-2 font-medium truncate" style={{ color:'var(--text)', maxWidth:160 }}>
                      {client.full_name}
                    </td>
                    {lessonDates.map(date => {
                      const isAbsent = att[date]?.[client.id] === true
                      return (
                        <td key={date} className="px-1 py-2 text-center">
                          {loading && attendance === null
                            ? <span style={{ color:'#e5e7eb' }}>··</span>
                            : isAbsent
                              ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold" style={{ background:'#fff1f2', color:'#be123c' }}>НБ</span>
                              : <span className="inline-flex items-center justify-center w-6 h-6 rounded-full" style={{ background:'#f0fdf4', color:'#15803d' }}>
                                  <Check size={11}/>
                                </span>
                          }
                        </td>
                      )
                    })}
                    <td className="px-4 py-2 text-center">
                      {clientAbsent > 0
                        ? <span className="px-2 py-0.5 rounded-full font-bold text-xs" style={{ background:'#fff1f2', color:'#be123c' }}>{clientAbsent}</span>
                        : <span style={{ color:'#16a34a', fontWeight:600, fontSize:12 }}>0</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ background:'#fdf8fa', borderTop:'1px solid var(--border)' }}>
              <tr>
                <td className="px-4 py-2 font-semibold text-xs" style={{ color:'var(--text-soft)' }}>Итого НБ:</td>
                {lessonDates.map(date => {
                  const cnt = dateAbsent(date)
                  return (
                    <td key={date} className="px-1 py-2 text-center">
                      {loading && attendance === null
                        ? <span style={{ color:'#e5e7eb' }}>-</span>
                        : cnt > 0
                          ? <span className="font-bold" style={{ color:'#be123c' }}>{cnt}</span>
                          : <span style={{ color:'#16a34a' }}>0</span>
                      }
                    </td>
                  )
                })}
                <td className="px-4 py-2 text-center font-bold" style={{ color:'#be123c' }}>
                  {loading && attendance === null ? '...' : totalAbsent}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Главный компонент Statistics ───────────────────────────────────────────────
export default function Statistics() {
  const { user } = useOutletContext()
  const [dash,      setDash]      = useState(null)
  const [byGroup,   setByGroup]   = useState([])
  const [byTrainer, setByTrainer] = useState([])
  const [trainers,  setTrainers]  = useState([])
  const [allGroups, setAllGroups] = useState([])
  const [filters,   setFilters]   = useState({
    date_from:'', date_to:'', training_format:'', trainer_id:'',
    registered_from:'', registered_to:'', registered_by_id:'',
  })
  const [managers, setManagers] = useState([])
  const [isGenerating,    setIsGenerating]    = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState([])
  const [nbGroupsData,    setNbGroupsData]    = useState([])
  const [nbLoading,       setNbLoading]       = useState(false)
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const attendanceCache = useRef({})
  // ✅ Refs для html2canvas — каждый div группы посещаемости
  const groupDivRefs = useRef({})
  const financePdfRef = useRef(null)
  const [pickerSearch,   setPickerSearch]   = useState('')
  const [pickerStatus,   setPickerStatus]   = useState('active')
  const [pickerDateFrom, setPickerDateFrom] = useState('')
  const [pickerDateTo,   setPickerDateTo]   = useState('')

  useEffect(() => {
    api.get('/trainers/?page_size=100').then(r => setTrainers(r.data.results||[]))
    api.get('/groups/?page_size=1000').then(r => setAllGroups(r.data.results||[]))
    api.get('/accounts/managers/?page_size=200').then(r => setManagers(r.data.results||r.data||[]))
    loadStats({})
  }, [])

  useEffect(() => {
    if (!selectedGroupIds.length) { setNbGroupsData([]); return }
    loadSelectedGroups()
  }, [selectedGroupIds.join(',')])

  const loadSelectedGroups = async () => {
    setNbLoading(true)
    try {
      const results = await Promise.all(selectedGroupIds.map(async gid => {
        const group = allGroups.find(g => g.id === gid); if (!group) return null
        const r = await api.get(`/groups/${gid}/clients/`)
        return { group, clients: Array.isArray(r.data) ? r.data : r.data.results||[] }
      }))
      setNbGroupsData(results.filter(Boolean))
    } finally { setNbLoading(false) }
  }

  const buildStatsParams = (f) => {
    const params = new URLSearchParams()
    if (f.date_from) params.append('date_from', f.date_from)
    if (f.date_to) params.append('date_to', f.date_to)
    if (f.training_format) params.append('training_format', f.training_format)
    if (f.trainer_id) params.append('trainer_id', f.trainer_id)
    if (f.registered_from) params.append('registered_from', f.registered_from)
    if (f.registered_to) params.append('registered_to', f.registered_to)
    if (f.registered_by_id) params.append('registered_by_id', f.registered_by_id)
    return params
  }

  /** Загрузка с сервера; возвращает данные (для PDF до отрисовки). */
  const fetchStatsData = async (f) => {
    const params = buildStatsParams(f)
    const [d, g, tr] = await Promise.all([
      api.get(`/statistics/dashboard/?${params}`),
      api.get(`/statistics/by-group/?${params}`),
      api.get(`/statistics/by-trainer/?${params}`),
    ])
    return { dash: d.data, byGroup: g.data, byTrainer: tr.data }
  }

  const loadStats = async (f) => {
    const data = await fetchStatsData(f)
    setDash(data.dash)
    setByGroup(data.byGroup)
    setByTrainer(data.byTrainer)
  }

  const handleAttendanceLoaded = useCallback((groupId, attMap) => {
    attendanceCache.current[groupId] = attMap
  }, [])

  const toggleGroup = gid => setSelectedGroupIds(prev =>
    prev.includes(gid) ? prev.filter(id => id !== gid) : [...prev, gid]
  )
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const applyFilters = () => { loadStats(filters); if(selectedGroupIds.length) loadSelectedGroups() }
  const resetFilters = () => {
    const f = {
      date_from:'', date_to:'', training_format:'', trainer_id:'',
      registered_from:'', registered_to:'', registered_by_id:'',
    }
    setFilters(f); setSelectedGroupIds([]); setNbGroupsData([])
    setPickerSearch(''); setPickerStatus('active'); setPickerDateFrom(''); setPickerDateTo('')
    attendanceCache.current = {}; loadStats(f)
  }

  const filteredGroups = useMemo(() => allGroups.filter(g => {
    if (pickerStatus && g.status !== pickerStatus) return false
    if (pickerSearch) {
      const q = pickerSearch.toLowerCase()
      if (!String(g.number).includes(q) && !(g.trainer?.full_name||'').toLowerCase().includes(q)) return false
    }
    if (pickerDateFrom && g.start_date < pickerDateFrom) return false
    if (pickerDateTo   && g.start_date > pickerDateTo)   return false
    return true
  }), [allGroups, pickerSearch, pickerStatus, pickerDateFrom, pickerDateTo])

  const selectFiltered = () => setSelectedGroupIds(prev => [...new Set([...prev, ...filteredGroups.map(g=>g.id)])])

  // ── Генерация PDF ────────────────────────────────────────────────────────────
  // Перед снимком экрана подгружаем те же фильтры, что на экране (иначе в PDF попадут старые данные).
  const generateFullPDF = async () => {
    setIsGenerating(true)
    try {
      const data = await fetchStatsData(filters)
      flushSync(() => {
        setDash(data.dash)
        setByGroup(data.byGroup)
        setByTrainer(data.byTrainer)
      })
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      let hasContent = false

      if (data.dash && financePdfRef.current) {
        try {
          const canvas = await html2canvas(financePdfRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
          })
          appendCanvasBlockToPdf(pdf, canvas, { addPageBefore: false })
          hasContent = true
        } catch (e) {
          console.error('html2canvas finance block:', e)
        }
      }

      for (const { group } of nbGroupsData) {
        const el = groupDivRefs.current[group.id]
        if (!el) continue

        try {
          const canvas = await html2canvas(el, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            logging: false,
          })
          appendCanvasBlockToPdf(pdf, canvas, { addPageBefore: hasContent })
          hasContent = true
        } catch (e) {
          console.error('html2canvas error for group', group.number, e)
        }
      }

      pdf.save(`Отчёт_${new Date().toLocaleDateString('ru-RU').replace(/\./g, '-')}.pdf`)
    } catch (e) {
      console.error('PDF generation error:', e)
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <AdminLayout user={user}>
      {dash && (
        <div
          aria-hidden
          className="finance-pdf-source"
          style={{
            position: 'fixed',
            left: -12000,
            top: 0,
            width: 1100,
            zIndex: -1,
            pointerEvents: 'none',
            overflow: 'hidden',
          }}
        >
          <FinancePDFPreview
            dash={dash}
            byGroup={byGroup}
            byTrainer={byTrainer}
            innerRef={financePdfRef}
          />
        </div>
      )}
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="crm-page-title">Статистика и отчёты</h2>
          <p className="crm-page-subtitle mt-1">PDF подставляет текущие фильтры (в т.ч. период регистрации) — нажмите «Применить» или сразу «Скачать PDF»</p>
        </div>
        <button onClick={generateFullPDF} disabled={isGenerating}
          className="crm-btn-primary flex items-center gap-2 disabled:opacity-60">
          {isGenerating
            ? <><Loader size={16} className="animate-spin"/> Генерация...</>
            : <><Download size={16}/> Скачать PDF</>
          }
        </button>
      </div>

      {/* Фильтры: один набор — те же параметры уходят в сводку и в PDF при «Скачать PDF» */}
      <div className="crm-card p-4 mb-6 space-y-4">
        <p className="text-xs text-slate-500 font-medium">Фильтры отчёта — действуют для таблиц на странице и для PDF</p>

        <div>
          <p className="text-xs font-semibold text-slate-700 mb-2">Период оплат</p>
          <p className="text-xs text-slate-400 mb-2">Учитывается в доходах и в фильтре пропусков (даты оплат / занятий)</p>
          <div className="flex gap-3 flex-wrap items-end">
            {[['date_from','От'],['date_to','До']].map(([k,label]) => (
              <div key={k}>
                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                <input type="date" value={filters[k]} onChange={e=>set(k,e.target.value)} className="crm-input w-full sm:w-auto"/>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-700 mb-2">Период регистрации клиентов</p>
          <p className="text-xs text-slate-400 mb-2">Сводка «Регистрация клиентов» в PDF и показатели по дате записи</p>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">От</label>
              <input type="date" value={filters.registered_from} onChange={e=>set('registered_from',e.target.value)} className="crm-input w-full sm:w-auto"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">До</label>
              <input type="date" value={filters.registered_to} onChange={e=>set('registered_to',e.target.value)} className="crm-input w-full sm:w-auto"/>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Менеджер (кто зарегистрировал)</label>
              <select value={filters.registered_by_id} onChange={e=>set('registered_by_id',e.target.value)} className="crm-input min-w-[200px]">
                <option value="">Все</option>
                {managers.map(m => (
                  <option key={m.id} value={m.user_id}>{m.last_name} {m.first_name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-700 mb-2">Срез по клиентам</p>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Формат обучения</label>
              <select value={filters.training_format} onChange={e=>set('training_format',e.target.value)} className="crm-input">
                <option value="">Все</option><option value="online">Онлайн</option><option value="offline">Оффлайн</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Тренер</label>
              <select value={filters.trainer_id} onChange={e=>set('trainer_id',e.target.value)} className="crm-input min-w-[180px]">
                <option value="">Все тренеры</option>
                {trainers.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap pt-1">
          <button type="button" onClick={applyFilters} className="crm-btn-primary">Применить</button>
          <button type="button" onClick={resetFilters} className="crm-btn-secondary">Сбросить</button>
        </div>

        {/* Выбор групп для НБ */}
        <div className="border-t pt-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Группы для НБ:</span>
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              {selectedGroupIds.length === 0
                ? <span className="text-xs text-gray-400 italic">не выбраны</span>
                : selectedGroupIds.map(gid => {
                    const g = allGroups.find(x => x.id === gid); if(!g) return null
                    return (
                      <span key={gid} className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                        #{g.number}
                        <button onClick={() => toggleGroup(gid)} className="hover:text-red-500 ml-0.5">×</button>
                      </span>
                    )
                  })
              }
            </div>
            <button onClick={() => setShowGroupPicker(v => !v)}
              className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition shrink-0">
              {showGroupPicker ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
              {showGroupPicker ? 'Скрыть' : 'Выбрать группы'}
            </button>
          </div>

          {showGroupPicker && (
            <div className="mt-3 pt-3 border-t">
              <div className="bg-gray-50 rounded-xl p-3 mb-3 flex flex-wrap gap-3 items-end">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input type="text" placeholder="Поиск..." value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)}
                    className="crm-input pl-7 w-48 text-xs"/>
                  {pickerSearch && <button onClick={() => setPickerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X size={12}/></button>}
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Статус</label>
                  <select value={pickerStatus} onChange={e=>setPickerStatus(e.target.value)} className="crm-input text-xs">
                    <option value="">Все</option><option value="active">Активные</option>
                    <option value="recruitment">Набор</option><option value="completed">Завершённые</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Старт от</label>
                  <input type="date" value={pickerDateFrom} onChange={e=>setPickerDateFrom(e.target.value)} className="crm-input text-xs"/>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Старт до</label>
                  <input type="date" value={pickerDateTo} onChange={e=>setPickerDateTo(e.target.value)} className="crm-input text-xs"/>
                </div>
                {(pickerSearch||pickerStatus!=='active'||pickerDateFrom||pickerDateTo) && (
                  <button onClick={() => { setPickerSearch(''); setPickerStatus('active'); setPickerDateFrom(''); setPickerDateTo('') }}
                    className="text-xs text-gray-400 hover:underline">Сбросить</button>
                )}
                <div className="ml-auto text-xs text-gray-500">
                  Найдено: <strong>{filteredGroups.length}</strong> из {allGroups.length}
                </div>
              </div>
              <div className="flex items-center gap-3 mb-2 text-xs">
                <button onClick={selectFiltered} className="text-blue-600 hover:underline font-medium">
                  Выбрать найденные ({filteredGroups.length})
                </button>
                <button onClick={() => setSelectedGroupIds(allGroups.map(g=>g.id))} className="text-blue-600 hover:underline">
                  Все {allGroups.length}
                </button>
                <button onClick={() => setSelectedGroupIds([])} className="text-gray-400 hover:underline">Снять все</button>
              </div>
              {filteredGroups.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">Нет групп</div>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto pr-1">
                  {filteredGroups.map(g => {
                    const isSel = selectedGroupIds.includes(g.id)
                    return (
                      <button key={g.id} onClick={() => toggleGroup(g.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition ${
                          isSel ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                        }`}>
                        {isSel && <Check size={11}/>}
                        Группа #{g.number}
                        <span className={`px-1.5 py-0.5 rounded text-xs ${isSel ? 'bg-blue-500 text-white' : STATUS_COLOR[g.status]||'bg-gray-100'}`}>
                          {STATUS_LABEL_UI[g.status]||g.status}
                        </span>
                        {g.group_type && <span className="opacity-60">{GROUP_TYPE_LABEL[g.group_type]}</span>}
                        {g.trainer?.full_name && <span className="opacity-50 hidden sm:inline">· {g.trainer.full_name.split(' ')[0]}</span>}
                        {g.start_date && <span className="opacity-40">{g.start_date.slice(0,7)}</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Метрики */}
      {dash && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[
            ['Общий доход',  fmtMoney(dash.total_revenue),   'text-blue-600'],
            ['Онлайн доход', fmtMoney(dash.online_revenue),  'text-indigo-500'],
            ['Офлайн доход', fmtMoney(dash.offline_revenue), 'text-purple-500'],
            ['Всего НБ',     dash.total_absences,            'text-red-500'],
          ].map(([label,val,color]) => (
            <div key={label} className="crm-card p-5">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-xl font-bold ${color}`}>{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Доход по группам */}
      <div className="crm-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b"><h3 className="font-medium text-gray-700">Доход по группам</h3></div>
        <div className="crm-table-wrap hidden md:block">
          <table className="crm-table min-w-[760px]">
            <thead><tr><th>Группа</th><th>Тренер</th><th>Статус</th><th>Клиентов</th><th className="text-right">Доход</th></tr></thead>
            <tbody>
              {byGroup.length === 0
                ? <tr><td colSpan={5} className="text-center py-6 text-gray-400">Нет данных</td></tr>
                : byGroup.map(g => (
                  <tr key={g.group_id}>
                    <td className="px-5 py-3 font-medium">Группа #{g.group_number}</td>
                    <td className="px-5 py-3 text-gray-600">{g.trainer||'—'}</td>
                    <td className="px-5 py-3 text-gray-600">{STATUS_LABEL_UI[g.status]||g.status}</td>
                    <td className="px-5 py-3 text-gray-600">{g.client_count}</td>
                    <td className="px-5 py-3 text-right font-medium text-blue-600">{fmtMoney(g.revenue)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Доход по тренерам */}
      <div className="crm-card overflow-hidden mb-8">
        <div className="px-5 py-4 border-b"><h3 className="font-medium text-gray-700">Доход по тренерам</h3></div>
        <div className="crm-table-wrap hidden md:block">
          <table className="crm-table min-w-[620px]">
            <thead><tr><th>Тренер</th><th>Клиентов</th><th className="text-right">Доход</th></tr></thead>
            <tbody>
              {byTrainer.length === 0
                ? <tr><td colSpan={3} className="text-center py-6 text-gray-400">Нет данных</td></tr>
                : byTrainer.map(t => (
                  <tr key={t.trainer_id}>
                    <td className="px-5 py-3 font-medium">{t.trainer_name}</td>
                    <td className="px-5 py-3 text-gray-600">{t.client_count}</td>
                    <td className="px-5 py-3 text-right font-medium text-blue-600">{fmtMoney(t.revenue)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* Журнал посещаемости */}
      {selectedGroupIds.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h3 className="font-semibold text-gray-800 text-lg">Журнал посещаемости</h3>
            <span className="text-sm text-gray-500">
              Группы: {selectedGroupIds.map(gid => allGroups.find(x=>x.id===gid)).filter(Boolean).map(g=>`#${g.number}`).join(', ')}
            </span>
          </div>
          {nbLoading
            ? <div className="crm-card p-8 text-center text-gray-400 flex items-center justify-center gap-2">
                <Loader size={18} className="animate-spin"/> Загрузка...
              </div>
            : (
              <div className="space-y-5">
                {nbGroupsData.map(({ group, clients }) => (
                  <GroupAttendanceHistory
                    key={group.id}
                    group={group}
                    clients={clients}
                    onAttendanceLoaded={handleAttendanceLoaded}
                    // ✅ ref для html2canvas: каждая таблица будет скриншотом в PDF
                    containerRef={el => { groupDivRefs.current[group.id] = el }}
                  />
                ))}
              </div>
            )
          }
        </div>
      )}
    </AdminLayout>
  )
}
