import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Download, Loader, ChevronDown, ChevronUp, Check, Search, X } from 'lucide-react'
import jsPDF from 'jspdf'
import api from '../../api/axios'
import AdminLayout from '../../components/AdminLayout'
import { fmtMoney } from '../../utils/format'

const DAY_KEYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_SHORT_RU = ['Vs','Pn','Vt','Sr','Cht','Pt','Sb']
const DAY_LABELS_RU = { Mon:'Pn', Tue:'Vt', Wed:'Sr', Thu:'Cht', Fri:'Pt', Sat:'Sb', Sun:'Vs' }

const TRANSLIT = {
  'A':'A','B':'B','V':'V','G':'G','D':'D','E':'E','Yo':'Yo','Zh':'Zh','Z':'Z','I':'I','Y':'Y','K':'K','L':'L','M':'M','N':'N','O':'O','P':'P','R':'R','S':'S','T':'T','U':'U','F':'F','Kh':'Kh','Ts':'Ts','Ch':'Ch','Sh':'Sh','Sch':'Sch',
  '\u0410':'A','\u0411':'B','\u0412':'V','\u0413':'G','\u0414':'D','\u0415':'E','\u0401':'Yo','\u0416':'Zh','\u0417':'Z','\u0418':'I','\u0419':'Y','\u041a':'K','\u041b':'L','\u041c':'M','\u041d':'N','\u041e':'O','\u041f':'P','\u0420':'R','\u0421':'S','\u0422':'T','\u0423':'U','\u0424':'F','\u0425':'Kh','\u0426':'Ts','\u0427':'Ch','\u0428':'Sh','\u0429':'Sch','\u042a':"'",'\u042b':'Y','\u042c':"'",'\u042d':'E','\u042e':'Yu','\u042f':'Ya',
  '\u0430':'a','\u0431':'b','\u0432':'v','\u0433':'g','\u0434':'d','\u0435':'e','\u0451':'yo','\u0436':'zh','\u0437':'z','\u0438':'i','\u0439':'y','\u043a':'k','\u043b':'l','\u043c':'m','\u043d':'n','\u043e':'o','\u043f':'p','\u0440':'r','\u0441':'s','\u0442':'t','\u0443':'u','\u0444':'f','\u0445':'kh','\u0446':'ts','\u0447':'ch','\u0448':'sh','\u0449':'sch','\u044a':"'",'\u044b':'y','\u044c':"'",'\u044d':'e','\u044e':'yu','\u044f':'ya',
}
function tl(s) { return String(s||'').split('').map(c=>TRANSLIT[c]??c).join('') }
function fmtP(v) { return String(v||'').replace(/\u0441\u043e\u043c/g,'som').split('').map(c=>TRANSLIT[c]??c).join('') }

function parseScheduleDays(schedule) {
  if (!schedule) return []
  return schedule.split(' ')[0].split(',').filter(d=>DAY_KEYS.includes(d)).map(d=>DAY_KEYS.indexOf(d))
}
function scheduleLabel(schedule) {
  if (!schedule) return '-'
  const parts = schedule.split(' ')
  const days = parts[0].split(',').map(d=>DAY_LABELS_RU[d]||d).join(', ')
  return days+(parts[1]?` ${parts[1]}`:'')
}
function formatDateWithDay(str) {
  if (!str) return ''
  const date = new Date(str+'T00:00:00')
  const [y,m,d] = str.split('-')
  const RU=['Vs','Pn','Vt','Sr','Cht','Pt','Sb']
  return `${RU[date.getDay()]} ${d}.${m}.${y}`
}
function formatDatePDF(str) {
  if (!str) return ''
  const date = new Date(str+'T00:00:00')
  const [y,m,d] = str.split('-')
  const EN=['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  return `${EN[date.getDay()]} ${d}.${m}`
}
// Локальная дата YYYY-MM-DD без UTC-сдвига
function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayISO() { return localDateISO() }
function getLessonDates(schedule, startDate) {
  const nums = parseScheduleDays(schedule)
  if (!nums.length||!startDate) return []
  const today = todayISO()
  const dates = []
  const cur = new Date(startDate + 'T00:00:00')
  while (true) {
    const iso = localDateISO(cur)
    if (iso > today) break  // будущее — не включаем
    if (nums.includes(cur.getDay())) dates.push(iso)
    cur.setDate(cur.getDate()+1)
  }
  return dates.reverse()
}

const STATUS_LABEL_RU = { recruitment:'Nabor', active:'Aktivny', completed:'Zavershen' }
const STATUS_LABEL_UI = { recruitment:'Набор', active:'Активный', completed:'Завершён' }
const STATUS_COLOR = { active:'bg-green-100 text-green-700', recruitment:'bg-yellow-100 text-yellow-700', completed:'bg-gray-100 text-gray-600' }
const GROUP_TYPE_LABEL = { '1.5h':'1.5 ч', '2.5h':'2.5 ч' }

function generatePDF({ dash, byGroup, byTrainer, nbGroupsData, attendanceData }) {
  const pdf = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' })
  const PW=pdf.internal.pageSize.getWidth(), PH=pdf.internal.pageSize.getHeight()
  const ML=12, CW=PW-ML*2
  let y=14
  const np=()=>{ pdf.addPage(); y=14 }
  const cy=(n=10)=>{ if(y+n>PH-10) np() }
  const pt=(s,x,yy,o={})=>pdf.text(String(s??''),x,yy,o)
  const hl=(yy,col=[200,200,200])=>{ pdf.setDrawColor(...col); pdf.line(ML,yy,PW-ML,yy); pdf.setDrawColor(0) }
  const fr=(x,yy,w,h,col)=>{ pdf.setFillColor(...col); pdf.rect(x,yy,w,h,'F'); pdf.setFillColor(255,255,255) }

  pdf.setFontSize(15); pdf.setTextColor(30,30,30); pt('Asylzada CRM - Report',ML,y)
  pdf.setFontSize(8); pdf.setTextColor(150,150,150); pt(new Date().toLocaleDateString('ru-RU'),PW-ML,y,{align:'right'})
  y+=7; hl(y); y+=8

  if (dash) {
    const cards=[['Total revenue',fmtP(fmtMoney(dash.total_revenue)),[37,99,235]],['Online revenue',fmtP(fmtMoney(dash.online_revenue)),[79,70,229]],['Offline revenue',fmtP(fmtMoney(dash.offline_revenue)),[147,51,234]],['Total absent',String(dash.total_absences),[220,38,38]]]
    const cw=CW/4
    cards.forEach(([label,val,rgb],i)=>{
      const cx=ML+i*cw
      fr(cx,y-4,cw-3,18,[245,247,250])
      pdf.setFontSize(7); pdf.setTextColor(120,120,120); pt(label,cx+3,y+2)
      pdf.setFontSize(11); pdf.setTextColor(...rgb); pt(val,cx+3,y+11)
    })
    y+=24
  }

  pdf.setFontSize(10); pdf.setTextColor(40,40,40); pt('Revenue by groups',ML,y); y+=5
  const gc=[{w:25},{w:65},{w:35},{w:28},{w:0}]; gc[4].w=CW-gc.slice(0,4).reduce((s,c)=>s+c.w,0)
  fr(ML,y-3,CW,8,[237,242,255]); pdf.setFontSize(7.5); pdf.setTextColor(60,60,180)
  let cx=ML+2; ['Group','Trainer','Status','Clients','Revenue'].forEach((h,i)=>{pt(h,cx,y+3);cx+=gc[i].w}); y+=8
  byGroup.forEach((g,i)=>{
    cy(7); if(i%2===0) fr(ML,y-3,CW,7,[250,251,255])
    pdf.setFontSize(7.5); pdf.setTextColor(40,40,40); cx=ML+2
    const row=[`#${g.group_number}`,tl(g.trainer||'-'),STATUS_LABEL_RU[g.status]||g.status,String(g.client_count),fmtP(fmtMoney(g.revenue))]
    gc.forEach((col,ci)=>{pt(row[ci],cx,y+2);cx+=col.w}); y+=7
  })
  y+=8

  cy(20); pdf.setFontSize(10); pdf.setTextColor(40,40,40); pt('Revenue by trainers',ML,y); y+=5
  const tc=[{w:90},{w:40},{w:0}]; tc[2].w=CW-tc.slice(0,2).reduce((s,c)=>s+c.w,0)
  fr(ML,y-3,CW,8,[237,242,255]); pdf.setFontSize(7.5); pdf.setTextColor(60,60,180)
  cx=ML+2; ['Trainer','Clients','Revenue'].forEach((h,i)=>{pt(h,cx,y+3);cx+=tc[i].w}); y+=8
  byTrainer.forEach((tr,i)=>{
    cy(7); if(i%2===0) fr(ML,y-3,CW,7,[250,251,255])
    pdf.setFontSize(7.5); pdf.setTextColor(40,40,40); cx=ML+2
    const row=[tl(tr.trainer_name),String(tr.client_count),fmtP(fmtMoney(tr.revenue))]
    tc.forEach((col,ci)=>{pt(row[ci],cx,y+2);cx+=col.w}); y+=7
  })

  nbGroupsData.forEach(({group,clients})=>{
    const offline=clients.filter(c=>c.training_format==='offline')
    if (!offline.length) return
    const dates=getLessonDates(group.schedule,group.start_date)
    if (!dates.length) return
    const att=attendanceData[group.id]||{}
    np()
    pdf.setFontSize(13); pdf.setTextColor(30,30,30)
    pt(`Attendance - Group #${group.number}`,ML,y); y+=6
    pdf.setFontSize(8); pdf.setTextColor(100,100,100)
    pt(`Trainer: ${tl(group.trainer?.full_name||'-')}  |  Schedule: ${group.schedule||'-'}  |  Start: ${group.start_date}  |  Offline: ${offline.length}`,ML,y)
    y+=5; hl(y,[180,180,180]); y+=7

    const nameW=52,totalW=16,dColW=Math.min((CW-nameW-totalW)/dates.length,18),usedDW=dColW*dates.length
    fr(ML,y-3,CW,9,[237,242,255]); pdf.setFontSize(6.5); pdf.setTextColor(60,60,180); pt('Client',ML+2,y+3)
    dates.forEach((date,di)=>{
      const dx=ML+nameW+di*dColW+dColW/2
      const parts=formatDatePDF(date).split(' ')
      pt(parts[0]||'',dx,y+1.5,{align:'center'}); pt(parts[1]||'',dx,y+5.5,{align:'center'})
    })
    pt('NB',ML+nameW+usedDW+totalW/2,y+3,{align:'center'}); y+=9

    offline.forEach((client,ci)=>{
      cy(7); if(ci%2===0) fr(ML,y-3,CW,7,[250,251,255])
      pdf.setFontSize(7); pdf.setTextColor(40,40,40)
      const name=tl(client.full_name); pt(name.length>26?name.slice(0,24)+'...':name,ML+2,y+2)
      let nb=0
      dates.forEach((date,di)=>{
        const dx=ML+nameW+di*dColW+dColW/2
        const recMap=att[date]
        const isAbsent=recMap?.[client.id]===true, isPresent=recMap?.[client.id]===false
        if (isAbsent) { nb++; fr(dx-5,y-2,10,6,[254,226,226]); pdf.setFontSize(6); pdf.setTextColor(185,28,28); pt('NB',dx,y+2,{align:'center'}) }
        else if (isPresent) { fr(dx-5,y-2,10,6,[220,252,231]); pdf.setFontSize(6); pdf.setTextColor(21,128,61); pt('v',dx,y+2,{align:'center'}) }
        else { pdf.setFontSize(6); pdf.setTextColor(200,200,200); pt('-',dx,y+2,{align:'center'}) }
      })
      const tx=ML+nameW+usedDW+totalW/2
      if(nb>0){fr(tx-5,y-2,10,6,[254,226,226]);pdf.setFontSize(7.5);pdf.setTextColor(185,28,28);pdf.setFont(undefined,'bold');pt(String(nb),tx,y+2,{align:'center'});pdf.setFont(undefined,'normal')}
      else{pdf.setFontSize(7);pdf.setTextColor(150,150,150);pt('0',tx,y+2,{align:'center'})}
      y+=7
    })

    cy(9); hl(y,[200,200,200]); y+=2; fr(ML,y-1,CW,8,[243,244,246])
    pdf.setFontSize(6.5); pdf.setTextColor(80,80,80); pt('Total NB:',ML+2,y+4)
    dates.forEach((date,di)=>{
      const dx=ML+nameW+di*dColW+dColW/2
      const cnt=offline.filter(c=>att[date]?.[c.id]===true).length
      pdf.setFontSize(7)
      if(cnt>0){pdf.setTextColor(185,28,28);pdf.setFont(undefined,'bold');pt(String(cnt),dx,y+4,{align:'center'});pdf.setFont(undefined,'normal')}
      else{pdf.setTextColor(100,180,100);pt('0',dx,y+4,{align:'center'})}
    })
    const totalNB=offline.reduce((s,c)=>s+dates.filter(d=>att[d]?.[c.id]===true).length,0)
    const tx=ML+nameW+usedDW+totalW/2
    pdf.setFontSize(9);pdf.setTextColor(185,28,28);pdf.setFont(undefined,'bold');pt(String(totalNB),tx,y+4,{align:'center'});pdf.setFont(undefined,'normal')
  })
  return pdf
}

// ОПТИМИЗИРОВАННЫЙ компонент:
// ОДИН запрос /attendance/group/{id}/all/ вместо N запросов (N = количество занятий)
function GroupAttendanceHistory({ group, clients, onAttendanceLoaded }) {
  const offlineClients = useMemo(() => clients.filter(c=>c.training_format==='offline'), [clients])
  const lessonDates = useMemo(() => getLessonDates(group.schedule, group.start_date), [group.schedule, group.start_date])
  // attendance: { 'YYYY-MM-DD': { clientId: is_absent(bool), ... }, ... }
  const [attendance, setAttendance] = useState(null)  // null = ещё не загружено
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (!offlineClients.length || !lessonDates.length) {
      setLoading(false)
      setAttendance({})
      return
    }
    setLoading(true)
    // ОДИН запрос вместо N!
    api.get(`/attendance/group/${group.id}/all/`)
      .then(r => {
        // r.data: { 'YYYY-MM-DD': [{client: uuid, is_absent: bool}, ...], ... }
        // Преобразуем в { date: { clientId: is_absent } }
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
  }, [group.id])  // запуск только при смене группы

  if (!offlineClients.length) return (
    <div className="crm-card p-4 text-center text-sm" style={{ color: 'var(--text-xs)' }}>
      Поток #{group.number} — нет офлайн-клиентов
    </div>
  )
  if (!lessonDates.length) return (
    <div className="crm-card p-4 text-center text-sm" style={{ color: 'var(--text-xs)' }}>
      Поток #{group.number} — нет прошедших занятий
    </div>
  )

  // Считаем статистику по принципу "по умолчанию присутствовал"
  const att = attendance || {}
  const totalAbsent = offlineClients.reduce((s, c) =>
    s + lessonDates.filter(d => att[d]?.[c.id] === true).length, 0
  )

  const dateAbsent = (date) => offlineClients.filter(c => att[date]?.[c.id] === true).length

  return (
    <div className="crm-card overflow-hidden">
      {/* Шапка */}
      <div className="px-5 py-3 border-b flex flex-wrap items-center gap-3"
           style={{ background: '#fdf8fa' }}>
        <div className="flex items-center gap-2">
          <button onClick={()=>setExpanded(v=>!v)} style={{ color: 'var(--text-xs)' }}
                  className="hover:opacity-70 transition">
            {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
          </button>
          <span className="font-semibold" style={{ color: 'var(--text)' }}>Поток #{group.number}</span>
          <span className="text-xs" style={{ color: 'var(--text-xs)' }}>
            {GROUP_TYPE_LABEL[group.group_type]} · {scheduleLabel(group.schedule)}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-soft)' }}>
          Тренер: <strong>{group.trainer?.full_name||'—'}</strong>
        </span>
        <span className="text-xs" style={{ color: 'var(--text-soft)' }}>
          Старт: <strong>{group.start_date}</strong>
        </span>
        <div className="ml-auto flex items-center gap-4 text-sm">
          {loading && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-xs)' }}>
              <Loader size={12} className="animate-spin" /> Загрузка...
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--text-soft)' }}>
            Занятий: <strong>{lessonDates.length}</strong>
          </span>
          <span className="text-xs font-medium" style={{ color: '#2563eb' }}>
            Офлайн: {offlineClients.length}
          </span>
          <span className="text-xs font-semibold" style={{ color: '#be123c' }}>
            НБ: {loading ? '...' : totalAbsent}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 600 }}>
            <thead style={{ background: '#fdf8fa', borderBottom: '1px solid var(--border)' }}>
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold"
                    style={{ color: 'var(--text-soft)', minWidth: 160 }}>Клиент</th>
                {lessonDates.map(date => {
                  const [day, d] = formatDateWithDay(date).split(' ')
                  return (
                    <th key={date} className="text-center px-1 py-2"
                        style={{ color: 'var(--text-soft)', minWidth: 56 }}>
                      <div className="font-semibold">{day}</div>
                      <div style={{ color: 'var(--text-xs)', fontWeight: 400 }}>{d}</div>
                    </th>
                  )
                })}
                <th className="text-center px-4 py-2.5 font-semibold"
                    style={{ color: '#be123c', minWidth: 48 }}>НБ</th>
              </tr>
            </thead>
            <tbody>
              {offlineClients.map((client, i) => {
                const clientAbsent = lessonDates.filter(d => att[d]?.[client.id] === true).length
                return (
                  <tr key={client.id}
                      style={{ background: i%2===0 ? '#fff' : '#fdf8fa',
                               borderBottom: '1px solid var(--border-soft)' }}>
                    <td className="px-4 py-2 font-medium truncate" style={{ color: 'var(--text)', maxWidth: 160 }}>
                      {client.full_name}
                    </td>
                    {lessonDates.map(date => {
                      // Нет записи = присутствовал (по умолчанию)
                      const isAbsent = att[date]?.[client.id] === true
                      return (
                        <td key={date} className="px-1 py-2 text-center">
                          {loading && attendance === null
                            ? <span style={{ color: '#e5e7eb' }}>··</span>
                            : isAbsent
                              ? <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                                       style={{ background: '#fff1f2', color: '#be123c' }}>НБ</span>
                              : <span className="inline-flex items-center justify-center w-6 h-6 rounded-full"
                                       style={{ background: '#f0fdf4', color: '#15803d' }}>
                                  <Check size={11}/>
                                </span>
                          }
                        </td>
                      )
                    })}
                    <td className="px-4 py-2 text-center">
                      {clientAbsent > 0
                        ? <span className="px-2 py-0.5 rounded-full font-bold text-xs"
                                 style={{ background: '#fff1f2', color: '#be123c' }}>{clientAbsent}</span>
                        : <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 12 }}>0</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot style={{ background: '#fdf8fa', borderTop: '1px solid var(--border)' }}>
              <tr>
                <td className="px-4 py-2 font-semibold text-xs" style={{ color: 'var(--text-soft)' }}>
                  Итого НБ:
                </td>
                {lessonDates.map(date => {
                  const cnt = dateAbsent(date)
                  return (
                    <td key={date} className="px-1 py-2 text-center">
                      {loading && attendance === null
                        ? <span style={{ color: '#e5e7eb' }}>-</span>
                        : cnt > 0
                          ? <span className="font-bold" style={{ color: '#be123c' }}>{cnt}</span>
                          : <span style={{ color: '#16a34a' }}>0</span>
                      }
                    </td>
                  )
                })}
                <td className="px-4 py-2 text-center font-bold" style={{ color: '#be123c' }}>
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

export default function Statistics() {
  const { user } = useOutletContext()
  const [dash, setDash] = useState(null)
  const [byGroup, setByGroup] = useState([])
  const [byTrainer, setByTrainer] = useState([])
  const [trainers, setTrainers] = useState([])
  const [allGroups, setAllGroups] = useState([])
  const [filters, setFilters] = useState({date_from:'',date_to:'',training_format:'',trainer_id:''})
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedGroupIds, setSelectedGroupIds] = useState([])
  const [nbGroupsData, setNbGroupsData] = useState([])
  const [nbLoading, setNbLoading] = useState(false)
  const [showGroupPicker, setShowGroupPicker] = useState(false)
  const attendanceCache = useRef({})
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerStatus, setPickerStatus] = useState('active')
  const [pickerDateFrom, setPickerDateFrom] = useState('')
  const [pickerDateTo, setPickerDateTo] = useState('')

  useEffect(()=>{
    api.get('/trainers/?page_size=100').then(r=>setTrainers(r.data.results||[]))
    api.get('/groups/?page_size=1000').then(r=>setAllGroups(r.data.results||[]))
    loadStats({})
  },[])

  useEffect(()=>{
    if (!selectedGroupIds.length){setNbGroupsData([]);return}
    loadSelectedGroups()
  },[selectedGroupIds.join(',')])

  const loadSelectedGroups = async () => {
    setNbLoading(true)
    try {
      const results = await Promise.all(selectedGroupIds.map(async gid=>{
        const group=allGroups.find(g=>g.id===gid); if(!group) return null
        const r=await api.get(`/groups/${gid}/clients/`)
        return {group, clients:Array.isArray(r.data)?r.data:r.data.results||[]}
      }))
      setNbGroupsData(results.filter(Boolean))
    } finally { setNbLoading(false) }
  }

  const loadStats = async (f) => {
    const params=new URLSearchParams()
    if(f.date_from) params.append('date_from',f.date_from)
    if(f.date_to) params.append('date_to',f.date_to)
    if(f.training_format) params.append('training_format',f.training_format)
    if(f.trainer_id) params.append('trainer_id',f.trainer_id)
    const [d,g,tr]=await Promise.all([api.get(`/statistics/dashboard/?${params}`),api.get(`/statistics/by-group/?${params}`),api.get(`/statistics/by-trainer/?${params}`)])
    setDash(d.data);setByGroup(g.data);setByTrainer(tr.data)
  }

  const handleAttendanceLoaded = useCallback((groupId,attMap)=>{attendanceCache.current[groupId]=attMap},[])
  const toggleGroup = gid=>setSelectedGroupIds(prev=>prev.includes(gid)?prev.filter(id=>id!==gid):[...prev,gid])
  const set = (k,v)=>setFilters(f=>({...f,[k]:v}))
  const applyFilters = ()=>{loadStats(filters);if(selectedGroupIds.length)loadSelectedGroups()}
  const resetFilters = ()=>{
    const f={date_from:'',date_to:'',training_format:'',trainer_id:''}
    setFilters(f);setSelectedGroupIds([]);setNbGroupsData([])
    setPickerSearch('');setPickerStatus('active');setPickerDateFrom('');setPickerDateTo('')
    attendanceCache.current={};loadStats(f)
  }

  const filteredGroups = useMemo(()=>allGroups.filter(g=>{
    if(pickerStatus&&g.status!==pickerStatus) return false
    if(pickerSearch){const q=pickerSearch.toLowerCase();if(!String(g.number).includes(q)&&!(g.trainer?.full_name||'').toLowerCase().includes(q)) return false}
    if(pickerDateFrom&&g.start_date<pickerDateFrom) return false
    if(pickerDateTo&&g.start_date>pickerDateTo) return false
    return true
  }),[allGroups,pickerSearch,pickerStatus,pickerDateFrom,pickerDateTo])

  const selectFiltered = ()=>setSelectedGroupIds(prev=>[...new Set([...prev,...filteredGroups.map(g=>g.id)])])

  const generateFullPDF = ()=>{
    setIsGenerating(true)
    try {
      const pdf=generatePDF({dash,byGroup,byTrainer,nbGroupsData,attendanceData:attendanceCache.current})
      pdf.save(`Report_${new Date().toLocaleDateString('ru-RU').replace(/\./g,'-')}.pdf`)
    } finally { setIsGenerating(false) }
  }

  return (
    <AdminLayout user={user}>
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h2 className="crm-page-title">Статистика и отчёты</h2>
          <p className="crm-page-subtitle mt-1">Финансовая аналитика и журнал посещаемости — всё в одном PDF</p>
        </div>
        <button onClick={generateFullPDF} disabled={isGenerating} className="crm-btn-primary flex items-center gap-2 disabled:opacity-60">
          {isGenerating?<><Loader size={16} className="animate-spin"/> Генерация...</>:<><Download size={16}/> Скачать PDF</>}
        </button>
      </div>

      <div className="crm-card p-4 mb-6">
        <div className="flex gap-3 flex-wrap items-end mb-4">
          {[['date_from','Дата от'],['date_to','Дата до']].map(([k,label])=>(
            <div key={k}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <input type="date" value={filters[k]} onChange={e=>set(k,e.target.value)} className="crm-input w-full sm:w-auto"/>
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Формат</label>
            <select value={filters.training_format} onChange={e=>set('training_format',e.target.value)} className="crm-input">
              <option value="">Все</option><option value="online">Онлайн</option><option value="offline">Оффлайн</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Тренер</label>
            <select value={filters.trainer_id} onChange={e=>set('trainer_id',e.target.value)} className="crm-input">
              <option value="">Все тренеры</option>
              {trainers.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
          </div>
          <button onClick={applyFilters} className="crm-btn-primary">Применить</button>
          <button onClick={resetFilters} className="crm-btn-secondary">Сбросить</button>
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-500 font-medium">Потоки для НБ:</span>
            <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
              {selectedGroupIds.length===0?<span className="text-xs text-gray-400 italic">не выбраны</span>
                :selectedGroupIds.map(gid=>{const g=allGroups.find(x=>x.id===gid);if(!g)return null;return(
                  <span key={gid} className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    #{g.number}<button onClick={()=>toggleGroup(gid)} className="hover:text-red-500 ml-0.5">x</button>
                  </span>
                )})}
            </div>
            <button onClick={()=>setShowGroupPicker(v=>!v)} className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded-lg px-2.5 py-1.5 hover:bg-blue-50 transition shrink-0">
              {showGroupPicker?<ChevronUp size={13}/>:<ChevronDown size={13}/>}
              {showGroupPicker?'Скрыть':'Выбрать потоки'}
            </button>
          </div>

          {showGroupPicker && (
            <div className="mt-3 pt-3 border-t">
              <div className="bg-gray-50 rounded-xl p-3 mb-3 flex flex-wrap gap-3 items-end">
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"/>
                  <input type="text" placeholder="Поиск..." value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)} className="crm-input pl-7 w-48 text-xs"/>
                  {pickerSearch&&<button onClick={()=>setPickerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"><X size={12}/></button>}
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
                {(pickerSearch||pickerStatus!=='active'||pickerDateFrom||pickerDateTo)&&(
                  <button onClick={()=>{setPickerSearch('');setPickerStatus('active');setPickerDateFrom('');setPickerDateTo('')}} className="text-xs text-gray-400 hover:underline">Сбросить</button>
                )}
                <div className="ml-auto text-xs text-gray-500">Найдено: <strong>{filteredGroups.length}</strong> из {allGroups.length}</div>
              </div>
              <div className="flex items-center gap-3 mb-2 text-xs">
                <button onClick={selectFiltered} className="text-blue-600 hover:underline font-medium">Выбрать найденные ({filteredGroups.length})</button>
                <button onClick={()=>setSelectedGroupIds(allGroups.map(g=>g.id))} className="text-blue-600 hover:underline">Все {allGroups.length}</button>
                <button onClick={()=>setSelectedGroupIds([])} className="text-gray-400 hover:underline">Снять все</button>
              </div>
              {filteredGroups.length===0?<div className="text-center py-6 text-gray-400 text-sm">Нет потоков</div>:(
                <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto pr-1">
                  {filteredGroups.map(g=>{const isSel=selectedGroupIds.includes(g.id);return(
                    <button key={g.id} onClick={()=>toggleGroup(g.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border-2 transition ${isSel?'bg-blue-600 text-white border-blue-600':'bg-white text-gray-700 border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}>
                      {isSel&&<Check size={11}/>}
                      Поток #{g.number}
                      <span className={`px-1.5 py-0.5 rounded text-xs ${isSel?'bg-blue-500 text-white':STATUS_COLOR[g.status]||'bg-gray-100'}`}>{STATUS_LABEL_UI[g.status]||g.status}</span>
                      {g.group_type&&<span className="opacity-60">{GROUP_TYPE_LABEL[g.group_type]}</span>}
                      {g.trainer?.full_name&&<span className="opacity-50 hidden sm:inline">· {g.trainer.full_name.split(' ')[0]}</span>}
                      {g.start_date&&<span className="opacity-40">{g.start_date.slice(0,7)}</span>}
                    </button>
                  )})}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {dash&&(
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          {[['Общий доход',fmtMoney(dash.total_revenue),'text-blue-600'],['Онлайн доход',fmtMoney(dash.online_revenue),'text-indigo-500'],['Оффлайн доход',fmtMoney(dash.offline_revenue),'text-purple-500'],['Всего НБ',dash.total_absences,'text-red-500']].map(([label,val,color])=>(
            <div key={label} className="crm-card p-5"><p className="text-xs text-gray-500 mb-1">{label}</p><p className={`text-xl font-bold ${color}`}>{val}</p></div>
          ))}
        </div>
      )}

      <div className="crm-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b"><h3 className="font-medium text-gray-700">Доход по потокам</h3></div>
        <div className="crm-table-wrap hidden md:block">
          <table className="crm-table min-w-[760px]">
            <thead><tr><th>Поток</th><th>Тренер</th><th>Статус</th><th>Клиентов</th><th className="text-right">Доход</th></tr></thead>
            <tbody>
              {byGroup.length===0?<tr><td colSpan={5} className="text-center py-6 text-gray-400">Нет данных</td></tr>
                :byGroup.map(g=>(
                  <tr key={g.group_id}>
                    <td className="px-5 py-3 font-medium">Поток #{g.group_number}</td>
                    <td className="px-5 py-3 text-gray-600">{g.trainer||'—'}</td>
                    <td className="px-5 py-3 text-gray-600">{STATUS_LABEL_UI[g.status]||g.status}</td>
                    <td className="px-5 py-3 text-gray-600">{g.client_count}</td>
                    <td className="px-5 py-3 text-right font-medium text-blue-600">{fmtMoney(g.revenue)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="crm-card overflow-hidden mb-8">
        <div className="px-5 py-4 border-b"><h3 className="font-medium text-gray-700">Доход по тренерам</h3></div>
        <div className="crm-table-wrap hidden md:block">
          <table className="crm-table min-w-[620px]">
            <thead><tr><th>Тренер</th><th>Клиентов</th><th className="text-right">Доход</th></tr></thead>
            <tbody>
              {byTrainer.length===0?<tr><td colSpan={3} className="text-center py-6 text-gray-400">Нет данных</td></tr>
                :byTrainer.map(t=>(
                  <tr key={t.trainer_id}>
                    <td className="px-5 py-3 font-medium">{t.trainer_name}</td>
                    <td className="px-5 py-3 text-gray-600">{t.client_count}</td>
                    <td className="px-5 py-3 text-right font-medium text-blue-600">{fmtMoney(t.revenue)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedGroupIds.length>0&&(
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h3 className="font-semibold text-gray-800 text-lg">Журнал посещаемости</h3>
            <span className="text-sm text-gray-500">Потоки: {selectedGroupIds.map(gid=>allGroups.find(x=>x.id===gid)).filter(Boolean).map(g=>`#${g.number}`).join(', ')}</span>
          </div>
          {nbLoading?<div className="crm-card p-8 text-center text-gray-400 flex items-center justify-center gap-2"><Loader size={18} className="animate-spin"/> Загрузка...</div>
            :<div className="space-y-5">{nbGroupsData.map(({group,clients})=>(
              <GroupAttendanceHistory key={group.id} group={group} clients={clients} onAttendanceLoaded={handleAttendanceLoaded}/>
            ))}</div>
          }
        </div>
      )}
    </AdminLayout>
  )
}
