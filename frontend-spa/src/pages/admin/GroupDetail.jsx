import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, Link, useOutletContext } from 'react-router-dom'
import { AlertTriangle, FileDown, CheckCircle2, XCircle, ChevronLeft, ChevronRight, Calendar, Pencil, BarChart3, Lock, CalendarDays, GraduationCap, Info } from 'lucide-react'
import ConfirmModal from '../../components/ConfirmModal'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { STATUS_BADGE, STATUS_LABEL, GROUP_TYPE_LABEL } from '../../utils/format'

const DAY_KEYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_LABELS = { Mon:'Пн', Tue:'Вт', Wed:'Ср', Thu:'Чт', Fri:'Пт', Sat:'Сб', Sun:'Вс' }
const DAY_SHORT_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']

function parseScheduleDays(s) {
  if (!s) return []
  return s.split(' ')[0].split(',').filter(d => DAY_KEYS.includes(d)).map(d => DAY_KEYS.indexOf(d))
}
function scheduleLabel(s) {
  if (!s) return '—'
  const parts = s.split(' ')
  const days = parts[0].split(',').map(d => DAY_LABELS[d] || d).join(', ')
  return days + (parts[1] ? ` · ${parts[1]}` : '')
}
function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayISO() { return localDateISO() }
function formatDate(s) { if (!s) return ''; const [y,m,d]=s.split('-'); return `${d}.${m}.${y}` }
function formatDateWithDay(s) {
  if (!s) return ''
  const d = new Date(s+'T00:00:00')
  const [,m,dd]=s.split('-')
  return `${DAY_SHORT_RU[d.getDay()]}  ${dd}.${m}`
}
function getLessonDates(schedule, startDate) {
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
  return dates.reverse()
}
function buildEmptyMap(clients) {
  const m={}; clients.forEach(c=>{m[c.id]={is_absent:false,note:'',saved:true}}); return m
}

// ── Проверка: оплата клиента закрыта? ─────────────────────────────────────────
function isPaymentClosed(client) {
  if (client.payment_type === 'full') {
    return client.full_payment?.is_paid === true
  }
  if (client.payment_type === 'installment') {
    return client.installment_plan?.is_closed === true
  }
  return false
}

function AttendanceTab({ groupId, groupClients, groupNumber, groupType, trainerName, schedule, startDate }) {
  const lessonDates = useMemo(() => getLessonDates(schedule, startDate), [schedule, startDate])
  const offlineClients = useMemo(() => groupClients.filter(c => c.training_format === 'offline'), [groupClients])
  const [selectedDate, setSelectedDate] = useState(() => lessonDates[0] || todayISO())
  const [records, setRecords] = useState({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [history, setHistory] = useState({})
  const pdfRef = useRef(null)
  const [pdfGenerating, setPdfGenerating] = useState(false)
  const [view, setView] = useState('journal')
  const showMsg = (type, text) => { setMsg({ type, text }); setTimeout(() => setMsg(null), 4000) }

  useEffect(() => {
    if (!offlineClients.length || !selectedDate) return
    setRecords(buildEmptyMap(offlineClients))
    setLoading(true)
    let cancelled = false
    api.get(`/attendance/group/${groupId}/?date=${selectedDate}`)
      .then(r => {
        if (cancelled) return
        const map = buildEmptyMap(offlineClients)
        r.data.forEach(rec => { if (map[rec.client]!==undefined) map[rec.client]={is_absent:rec.is_absent,note:rec.note||'',saved:true} })
        setRecords(map)
      })
      .catch(() => { if (!cancelled) setRecords(buildEmptyMap(offlineClients)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [groupId, selectedDate, offlineClients.length])

  useEffect(() => {
    if (!offlineClients.length || !lessonDates.length || view !== 'history') return
    let cancelled = false
    api.get(`/attendance/group/${groupId}/all/`)
      .then(r => {
        if (cancelled) return
        const allData = r.data
        const newHistory = {}
        lessonDates.forEach(date => {
          const recs = allData[date] || []
          const absent = recs.filter(rec => rec.is_absent).length
          newHistory[date] = { absent, present: offlineClients.length - absent, total: offlineClients.length, loaded: true }
        })
        setHistory(newHistory)
      })
      .catch(() => {
        if (cancelled) return
        const newHistory = {}
        lessonDates.forEach(date => {
          newHistory[date] = { absent: 0, present: offlineClients.length, total: offlineClients.length, loaded: true }
        })
        setHistory(newHistory)
      })
    return () => { cancelled = true }
  }, [view, groupId, lessonDates, offlineClients.length])

  const toggle = id => setRecords(prev=>({...prev,[id]:{...prev[id],is_absent:!prev[id]?.is_absent,saved:false}}))
  const markAll = isAbsent => setRecords(prev=>{
    const n={...prev}
    offlineClients.forEach(c=>{n[c.id]={...n[c.id],is_absent:isAbsent,saved:false}})
    return n
  })

  const saveAll = async () => {
    if (!offlineClients.length) return
    setSaving(true)
    try {
      const r = await api.post('/attendance/bulk-mark/', {
        lesson_date: selectedDate,
        records: offlineClients.map(c => ({ client_id: c.id, is_absent: records[c.id]?.is_absent??false, note: records[c.id]?.note??'' }))
      })
      const savedIds = new Set((r.data.saved||r.data).map(rec=>rec.client))
      setRecords(prev => {
        const n={...prev}
        offlineClients.forEach(c=>{ if(savedIds.has(c.id)||savedIds.size===0) n[c.id]={...n[c.id],saved:true} })
        if (!r.data.saved) offlineClients.forEach(c=>{n[c.id]={...n[c.id],saved:true}})
        return n
      })
      const absent=offlineClients.filter(c=>records[c.id]?.is_absent).length
      setHistory(prev=>({...prev,[selectedDate]:{absent,present:offlineClients.length-absent,total:offlineClients.length,loaded:true}}))
      const sk=r.data.skipped?.length||0
      showMsg('success', sk>0 ? `Сохранено. Пропущено онлайн: ${sk}` : `Посещаемость за ${formatDateWithDay(selectedDate)} сохранена`)
    } catch (e) {
      const d=e.response?.data
      showMsg('error', typeof d==='object' ? JSON.stringify(d).slice(0,200) : (d||'Ошибка'))
    } finally { setSaving(false) }
  }

  const generatePDF = async () => {
    if (!pdfRef.current) return
    setPdfGenerating(true)
    try {
      const canvas = await html2canvas(pdfRef.current, { scale:2, useCORS:true, logging:false, backgroundColor:'#ffffff' })
      const imgData=canvas.toDataURL('image/png')
      const pdf=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'})
      const pw=pdf.internal.pageSize.getWidth(), ph=pdf.internal.pageSize.getHeight()
      const ih=(canvas.height*pw)/canvas.width; let left=ih, pos=0
      pdf.addImage(imgData,'PNG',0,pos,pw,ih); left-=ph
      while(left>0){pos=left-ih;pdf.addPage();pdf.addImage(imgData,'PNG',0,pos,pw,ih);left-=ph}
      pdf.save(`НБ_Группа${groupNumber}_${formatDate(selectedDate)}.pdf`)
    } finally { setPdfGenerating(false) }
  }

  const absentCount=offlineClients.filter(c=>records[c.id]?.is_absent).length
  const presentCount=offlineClients.length-absentCount
  const hasUnsaved=offlineClients.some(c=>!records[c.id]?.saved)
  const currentIdx=lessonDates.indexOf(selectedDate)

  if (!schedule||parseScheduleDays(schedule).length===0)
    return <div className="crm-card p-8 text-center text-slate-400 text-sm">У группы не задано расписание.</div>
  if (!offlineClients.length)
    return <div className="crm-card p-8 text-center text-slate-400 text-sm">В группе нет офлайн-клиентов</div>

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {[{k:'journal',l:'Отметить занятие',icon:Pencil},{k:'history',l:'История занятий',icon:BarChart3}].map(({k,l,icon:TabIcon})=>(

          <button key={k} onClick={()=>setView(k)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-1.5 ${view===k?'bg-indigo-600 text-white shadow-md':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            <TabIcon size={14} />{l}
          </button>
        ))}
      </div>

      {view==='journal' && (
        <>
          <div className="crm-card p-4 mb-4">
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={()=>currentIdx<lessonDates.length-1&&setSelectedDate(lessonDates[currentIdx+1])}
                  disabled={currentIdx>=lessonDates.length-1}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition">
                  <ChevronLeft size={16}/>
                </button>
                <div className="text-center min-w-[160px]">
                  <div className="font-semibold text-slate-800 text-sm">{formatDateWithDay(selectedDate)}</div>
                  <div className="text-xs text-indigo-600 font-medium">{scheduleLabel(schedule)}</div>
                </div>
                <button onClick={()=>currentIdx>0&&setSelectedDate(lessonDates[currentIdx-1])}
                  disabled={currentIdx<=0}
                  className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 transition">
                  <ChevronRight size={16}/>
                </button>
              </div>
              <select value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} className="crm-input w-auto">
                {lessonDates.map(d=><option key={d} value={d}>{formatDateWithDay(d)}</option>)}
              </select>
              <div className="flex gap-2 text-sm">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full font-semibold border border-emerald-100">✓ {presentCount}</span>
                <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full font-semibold border border-red-100">НБ: {absentCount}</span>
                {hasUnsaved&&!loading&&<span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full font-medium text-xs border border-amber-100">● Не сохранено</span>}
              </div>
              <div className="flex gap-2 ml-auto flex-wrap">
                <button onClick={()=>markAll(false)} className="px-3 py-1.5 text-xs rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-medium transition">Сбросить НБ</button>
                <button onClick={()=>markAll(true)} className="px-3 py-1.5 text-xs rounded-xl bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 font-medium transition">Все НБ</button>
                <button onClick={generatePDF} disabled={pdfGenerating}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition disabled:opacity-50">
                  <FileDown size={13}/>{pdfGenerating?'Формирую...':'Скачать PDF'}
                </button>
                <button onClick={saveAll} disabled={saving||loading}
                  className={`px-4 py-1.5 text-xs rounded-xl text-white font-semibold transition disabled:opacity-50 ${hasUnsaved?'bg-indigo-600 hover:bg-indigo-700 shadow-md':'bg-slate-400'}`}>
                  {saving?'Сохранение...':'Сохранить'}
                </button>
              </div>
            </div>
          </div>

          {msg && (
            <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${msg.type==='success'?'crm-toast-success':'crm-toast-error'}`}>{msg.text}</div>
          )}

          <div ref={pdfRef} className="crm-card overflow-hidden">
            <div className="px-5 py-4 border-b bg-slate-50 flex flex-wrap items-center gap-4">
              <div>
                <h3 className="font-bold text-slate-800">Журнал посещаемости</h3>
                <p className="text-xs text-slate-400 mt-0.5">Группа #{groupNumber} · {GROUP_TYPE_LABEL[groupType]} · {trainerName} · {formatDateWithDay(selectedDate)}</p>
              </div>
              <div className="ml-auto flex gap-4 text-sm">
                <span className="text-emerald-700 font-semibold">Присутствуют: {presentCount}</span>
                <span className="text-red-600 font-semibold">НБ: {absentCount}</span>
                <span className="text-slate-400">Всего: {offlineClients.length}</span>
              </div>
            </div>
            {loading ? (
              <div className="py-12 text-center text-slate-400 flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/> Загрузка...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-8">#</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Клиент</th>
                      <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Телефон</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Статус</th>
                      <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">Посещаемость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offlineClients.map((c, i) => {
                      const rec = records[c.id] ?? { is_absent: false, saved: false }
                      return (
                        <tr key={c.id} className={`border-b transition-colors ${rec.is_absent?'bg-red-50':'hover:bg-slate-50'}`}>
                          <td className="px-5 py-3 text-slate-300 text-xs">{i+1}</td>
                          <td className="px-5 py-3 font-semibold">
                            <Link to={`/admin/clients/${c.id}`} className="text-slate-800 hover:text-indigo-600 transition">{c.full_name}</Link>
                            {rec.saved && <span className="ml-2 text-xs text-emerald-400">✓</span>}
                          </td>
                          <td className="px-5 py-3 text-slate-500">{c.phone}</td>
                          <td className="px-5 py-3 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <button onClick={()=>toggle(c.id)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition active:scale-95
                                ${rec.is_absent?'bg-red-100 text-red-700 border-red-200 hover:bg-red-200':'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'}`}>
                              {rec.is_absent ? <><XCircle size={13}/> НБ</> : <><CheckCircle2 size={13}/> Был</>}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {view==='history' && (
        <div className="crm-card overflow-hidden">
          <div className="px-5 py-4 border-b bg-slate-50">
            <h3 className="font-bold text-slate-800">История занятий</h3>
            <p className="text-xs text-slate-400 mt-0.5">Группа #{groupNumber} · {scheduleLabel(schedule)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="crm-table min-w-[700px]">
              <thead><tr>
                <th>Дата занятия</th><th className="text-center">Присутствовали</th>
                <th className="text-center">НБ</th><th className="text-center">Посещаемость</th><th></th>
              </tr></thead>
              <tbody>
                {lessonDates.map(date => {
                  const h = history[date]
                  const pct = h ? Math.round((h.present/h.total)*100) : null
                  return (
                    <tr key={date}>
                      <td className="font-semibold text-slate-800">{formatDateWithDay(date)}</td>
                      <td className="text-center">{!h?<span className="text-slate-200">—</span>:<span className="text-emerald-700 font-semibold">{h.present}</span>}</td>
                      <td className="text-center">
                        {!h?<span className="text-slate-200">—</span>
                          :h.absent>0?<span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-semibold text-xs">{h.absent} НБ</span>
                          :<span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs">все</span>}
                      </td>
                      <td className="text-center">
                        {pct!==null&&(
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${pct>=80?'bg-emerald-500':pct>=60?'bg-amber-400':'bg-red-400'}`} style={{width:`${pct}%`}}/>
                            </div>
                            <span className="text-xs text-slate-500">{pct}%</span>
                          </div>
                        )}
                      </td>
                      <td className="text-right">
                        <button onClick={()=>{setSelectedDate(date);setView('journal')}}
                          className="text-xs text-indigo-500 hover:text-indigo-700 font-medium transition">Открыть →</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {lessonDates.length===0&&<div className="text-center py-12 text-slate-400">Занятий ещё не было</div>}
        </div>
      )}
    </div>
  )
}

export default function GroupDetail() {
  const { id } = useParams()
  const { user } = useOutletContext()
  const [group, setGroup] = useState(null)
  const [groupClients, setGroupClients] = useState([])
  const [availableClients, setAvailableClients] = useState([])
  const [tab, setTab] = useState('current')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState(null)

  const [closeLoading, setCloseLoading] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)

  const loadGroup = useCallback(async () => { const r=await api.get(`/groups/${id}/`); setGroup(r.data) }, [id])
  const loadGroupClients = useCallback(async () => {
    const r=await api.get(`/groups/${id}/clients/`)
    setGroupClients(Array.isArray(r.data)?r.data:r.data.results||[])
  }, [id])
  const loadAvailableClients = useCallback(async () => {
    if (!group) return
    const params=new URLSearchParams()
    if (filterType) params.append('group_type',filterType)
    if (search) params.append('search',search)
    // ✅ Только активные клиенты (status=active).
    // Клиенты со статусом frozen/expelled/completed (в т.ч. после возврата)
    // НЕ должны попадать сюда — они переоформляются через «Повторный клиент»
    // в своей карточке.
    params.append('status','active')
    params.append('page_size','200')
    const r=await api.get(`/clients/?${params}`)
    const currentIds=new Set(groupClients.map(c=>c.id))
    setAvailableClients(
      (r.data.results||[]).filter(c => {
        // 1. Не в текущей группе и без группы
        if (currentIds.has(c.id) || c.group) return false
        // 2. ✅ Оплата должна быть ПОЛНОСТЬЮ ЗАКРЫТА
        // Полная: is_paid == true
        // Рассрочка: is_closed == true (весь долг закрыт)
        if (c.payment_type === 'full')        return c.full_payment?.is_paid === true
        if (c.payment_type === 'installment') return c.installment_plan?.is_closed === true
        return false
      })
    )
  }, [group,search,filterType,groupClients])

  useEffect(()=>{loadGroup()},[loadGroup])
  useEffect(()=>{if(group)loadGroupClients()},[group])
  useEffect(()=>{if(tab==='add'&&group)loadAvailableClients()},[tab,group,search,filterType])

  const showMsg=(type,text)=>{setMsg({type,text});setTimeout(()=>setMsg(null),3000)}

  const addClient = async clientId => {
    try {
      await api.post(`/groups/${id}/add-client/`,{client_id:clientId})
      showMsg('success','Клиент добавлен в группу')
      loadGroupClients(); loadAvailableClients()
    } catch(e){ showMsg('error',e.response?.data?.detail||'Ошибка') }
  }

  const removeClient = (clientId, clientName) => {
    setConfirmModal({
      title: 'Убрать клиента',
      message: `Убрать ${clientName || 'клиента'} из группы?`,
      variant: 'warning',
      confirmText: 'Убрать',
      onConfirm: async () => {
        await api.post(`/groups/${id}/remove-client/`, { client_id: clientId })
        setConfirmModal(null)
        loadGroupClients()
      },
    })
  }

  if (!group) return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin"/>
      </div>
    </AdminLayout>
  )

  const isCompleted = group.status === 'completed'

  const TABS = [
    { key:'current', label:`Клиенты группы (${groupClients.length})` },
    { key:'attendance', label:'НБ / Посещаемость' },
    // Вкладку "Добавить" скрываем для завершённых групп
    ...(!isCompleted ? [{ key:'add', label:'+ Добавить клиентов' }] : []),
  ]

  return (
    <AdminLayout user={user}>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <Link to="/admin/groups" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-700 text-sm transition">← Назад</Link>
        <div className="w-px h-5 bg-slate-200"/>
        <div className="flex items-center gap-3 flex-wrap flex-1">
          <h2 className="crm-page-title break-words">Группа #{group.number} — {GROUP_TYPE_LABEL[group.group_type]}</h2>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[group.status]}`}>
            {STATUS_LABEL[group.status]}
          </span>
        </div>
        <div className="flex gap-2">
          {!isCompleted && (
            <Link to={`/admin/groups/${id}`} className="crm-btn-secondary text-xs py-2">Редактировать</Link>
          )}
          {!isCompleted && (
            <button
              onClick={() => setConfirmModal({
                title: 'Закрыть группу',
                message: `Закрыть группу #${group.number}?\n\nВсе активные клиенты получат статус «Завершил» и будут откреплены.`,
                variant: 'danger',
                confirmText: 'Закрыть группу',
                onConfirm: async () => {
                  setCloseLoading(true); setConfirmModal(null)
                  try {
                    await api.post(`/groups/${id}/close/`)
                    showMsg('success', 'Группа закрыта')
                    loadGroup(); loadGroupClients()
                  } catch(e) { showMsg('error', e.response?.data?.detail || 'Ошибка') }
                  finally { setCloseLoading(false) }
                },
              })}
              disabled={closeLoading}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition disabled:opacity-50">
              {closeLoading ? 'Закрытие...' : <><Lock size={13} className="inline -mt-0.5" /> Закрыть группу</>}
            </button>
          )}
        </div>
      </div>

      <div className="crm-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <span className="text-indigo-500 text-xs font-bold">Тр</span>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Тренер</p>
            <p className="font-semibold text-slate-800 text-sm">{group.trainer?.full_name||'—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <Calendar size={15} className="text-violet-500"/>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Расписание</p>
            <p className="font-semibold text-indigo-600 text-sm">{scheduleLabel(group.schedule)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <CalendarDays size={15} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Дата старта</p>
            <p className="font-semibold text-slate-800 text-sm">{group.start_date||'—'}</p>
          </div>
        </div>
      </div>

      {msg && (
        <div className={`mb-4 p-3 rounded-xl text-sm font-medium ${msg.type==='success'?'crm-toast-success':'crm-toast-error'}`}>{msg.text}</div>
      )}

      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(({key,label})=>(
          <button key={key} onClick={()=>setTab(key)}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition ${
              tab===key?'bg-indigo-600 text-white shadow-md':'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab==='current' && (
        <div className="crm-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="crm-table min-w-[860px]">
              <thead><tr>
                <th>Клиент</th><th>Телефон</th><th>Тип</th><th>Формат</th><th>Статус</th><th>Менеджер</th>
                {/* ✅ Колонку "Убрать" скрываем для завершённых групп */}
                {!isCompleted && <th></th>}
              </tr></thead>
              <tbody>
                {groupClients.length===0
                  ? <tr><td colSpan={isCompleted?6:7} className="text-center py-10 text-slate-400">В группе нет клиентов</td></tr>
                  : groupClients.map(c=>(
                    <tr key={c.id}>
                      <td><Link to={`/admin/clients/${c.id}`} className="font-semibold text-slate-800 hover:text-indigo-600 transition">{c.full_name}</Link></td>
                      <td className="text-slate-600">{c.phone}</td>
                      <td className="text-slate-600 text-xs">{GROUP_TYPE_LABEL[c.group_type]}</td>
                      <td>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.training_format==='online'?'bg-blue-100 text-blue-700':'bg-violet-100 text-violet-700'}`}>
                          {c.training_format==='online'?'Онлайн':'Офлайн'}
                        </span>
                      </td>
                      <td><span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_BADGE[c.status]}`}>{STATUS_LABEL[c.status]}</span></td>
                      <td className="text-slate-400 text-xs">{c.registered_by_name||'—'}</td>
                      {!isCompleted && (
                        <td><button onClick={()=>removeClient(c.id, c.full_name)} className="text-red-400 hover:text-red-600 text-xs transition">Убрать</button></td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {isCompleted && (
            <div className="px-5 py-3 bg-slate-50 border-t text-xs text-slate-400">
              Группа завершена — редактирование списка недоступно
            </div>
          )}
        </div>
      )}

      {tab==='attendance' && (
        <AttendanceTab groupId={id} groupClients={groupClients}
          groupNumber={group.number} groupType={group.group_type}
          trainerName={group.trainer?.full_name||'—'}
          schedule={group.schedule} startDate={group.start_date}/>
      )}

      {tab==='add' && !isCompleted && (
        <div>
          <div className="crm-card p-4 mb-4">
            {/* Подсказка */}
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
            Показаны клиенты <strong>без группы</strong> с <strong>закрытой оплатой</strong>, готовые к зачислению
            </div>
            <div className="flex gap-3 flex-wrap items-center">
              <input type="text" placeholder="Поиск..." value={search} onChange={e=>setSearch(e.target.value)}
                className="crm-input w-full sm:w-64"/>
              <div className="flex gap-2">
                {[{val:'',label:'Все типы'},{val:'1.5h',label:'1.5 ч'},{val:'2.5h',label:'2.5 ч'}].map(opt=>(
                  <button key={opt.val} onClick={()=>setFilterType(opt.val)}
                    className={`px-4 py-2 rounded-xl text-sm transition ${filterType===opt.val?'bg-indigo-600 text-white':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="crm-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="crm-table min-w-[700px]">
                <thead><tr>
                  <th>Клиент</th><th>Телефон</th><th>Тип группы</th><th>Формат</th><th>Менеджер</th><th></th>
                </tr></thead>
                <tbody>
                  {availableClients.length===0
                    ? <tr><td colSpan={6} className="text-center py-10 text-slate-400">Нет клиентов без группы</td></tr>
                    : availableClients.map(c=>(
                      <tr key={c.id}>
                        <td className="font-semibold text-slate-800">{c.full_name}</td>
                        <td className="text-slate-600">{c.phone}</td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.group_type===group.group_type?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>
                            {GROUP_TYPE_LABEL[c.group_type]}
                            {c.group_type!==group.group_type&&<AlertTriangle className="inline ml-1 text-amber-500" size={12}/>}
                          </span>
                        </td>
                        <td>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${c.training_format==='online'?'bg-blue-100 text-blue-700':'bg-violet-100 text-violet-700'}`}>
                            {c.training_format==='online'?'Онлайн':'Офлайн'}
                          </span>
                        </td>
                        <td className="text-slate-400 text-xs">{c.registered_by_name||'—'}</td>
                        <td>
                          <button onClick={()=>addClient(c.id)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs px-3 py-1.5 rounded-lg transition font-semibold">
                            Добавить
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {confirmModal && (
        <ConfirmModal
          open={true}
          title={confirmModal.title}
          message={confirmModal.message}
          variant={confirmModal.variant}
          confirmText={confirmModal.confirmText}
          onConfirm={confirmModal.onConfirm}
          onClose={() => setConfirmModal(null)}
        />
      )}
    </AdminLayout>
  )
}
