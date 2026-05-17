import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  LogOut, Radio, CheckCircle2, XCircle,
  Calendar, Phone, Users, Gift, ChevronRight,
  Sparkles, BookOpen, Archive,
} from 'lucide-react'
import api from '../../api/axios'
import { fmtMoney, fmtDate, GROUP_TYPE_LABEL } from '../../utils/format'
import CabinetNav from '../../components/CabinetNav'

const DAY_KEYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_LABELS = { Mon:'Пн',Tue:'Вт',Wed:'Ср',Thu:'Чт',Fri:'Пт',Sat:'Сб',Sun:'Вс' }

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
function getLessonDates(schedule, startDate) {
  const nums = parseScheduleDays(schedule)
  if (!nums.length || !startDate) return []
  const today = localDateISO()
  const dates = []
  const cur = new Date(startDate + 'T00:00:00')
  while (true) {
    const iso = localDateISO(cur)
    if (iso > today) break
    if (nums.includes(cur.getDay())) dates.push(iso)
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}
function shortDate(iso) {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

const STATUS_META = {
  new:       { label: 'Новый',     color: '#7c3aed', bg: 'rgba(221,214,254,0.3)' },
  trial:     { label: 'Пробный',   color: '#d97706', bg: 'rgba(253,230,138,0.3)' },
  active:    { label: 'Активный',  color: '#16a34a', bg: 'rgba(187,247,208,0.3)' },
  frozen:    { label: 'Заморозка', color: '#2563eb', bg: 'rgba(191,219,254,0.3)' },
  completed: { label: 'Завершил',  color: '#6b7280', bg: 'rgba(229,231,235,0.3)' },
  expelled:  { label: 'Отчислен', color: '#dc2626', bg: 'rgba(254,202,202,0.3)' },
}

export default function CabinetProfile() {
  const [profile, setProfile]         = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [attendance, setAttendance]   = useState(null)
  const [activeStream, setActiveStream] = useState(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) { nav('/cabinet'); return }
    const load = async () => {
      setLoading(true); setError('')
      try {
        const [pr, ar, sr] = await Promise.all([
          api.get('/cabinet/me/'),
          api.get('/cabinet/attendance/?limit=200').catch(() => null),
          api.get('/cabinet/education/streams/active/').catch(() => null),
        ])
        setProfile(pr.data)
        // Cache lesson access flag so LessonsList can show payment message
        localStorage.setItem('cabinet_lesson_access', pr.data.has_lesson_access ? '1' : '0')
        if (ar) setAttendance(ar.data)
        if (sr) setActiveStream(sr.data?.stream || null)
      } catch (e) {
        if (e.response?.status === 401) { nav('/cabinet'); return }
        setError(e.response?.data?.detail ?? e.message ?? 'Ошибка загрузки')
      } finally { setLoading(false) }
    }
    load()
    const poll = setInterval(() => {
      api.get('/cabinet/education/streams/active/')
        .then(r => setActiveStream(r.data?.stream || null))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(poll)
  }, [nav])

  const logout = () => {
    localStorage.removeItem('cabinet_access_token')
    localStorage.removeItem('cabinet_refresh_token')
    nav('/cabinet')
  }

  const lessonDates = useMemo(() => {
    if (!profile?.current_group?.schedule || !profile?.current_group?.start_date) return []
    return getLessonDates(profile.current_group.schedule, profile.current_group.start_date)
  }, [profile])

  const attMap = useMemo(() => {
    if (!attendance?.records) return {}
    const m = {}
    attendance.records.forEach(r => { m[r.lesson_date] = r })
    return m
  }, [attendance])

  /* ── Loading ──────────────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gray-50">
      <div className="text-center">
        <p className="text-rose-500 mb-4 text-sm">{error}</p>
        <button onClick={() => window.location.reload()}
          className="px-5 py-2.5 rounded-xl text-sm text-white font-medium bg-rose-500">
          Повторить
        </button>
      </div>
    </div>
  )

  if (!profile) return null

  const grp = profile.current_group
  const status = STATUS_META[profile.status] || STATUS_META.active
  const initial = (profile.first_name || profile.last_name || '?').charAt(0).toUpperCase()

  const totalLessons = lessonDates.length || (attendance?.total ?? 0)
  const absentCount = attendance?.absent ?? 0
  const presentCount = Math.max(0, totalLessons - absentCount)
  const attendancePct = totalLessons > 0 ? Math.round((presentCount / totalLessons) * 100) : null
  const recentLessons = lessonDates.slice(-21)

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden px-5 pt-10 pb-8"
        style={{ background: 'linear-gradient(145deg,#1a0a26 0%,#4a0e6b 55%,#1a0a30 100%)' }}
      >
        {/* ambient glow */}
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full pointer-events-none opacity-20"
             style={{ background: 'radial-gradient(circle,#f9a8d4,transparent 70%)' }} />
        <div className="absolute -bottom-10 -left-10 w-44 h-44 rounded-full pointer-events-none opacity-15"
             style={{ background: 'radial-gradient(circle,#c084fc,transparent 70%)' }} />

        <div className="relative flex items-start justify-between gap-3">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-xl shrink-0"
              style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}
            >
              {initial}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-white/50 font-medium mb-0.5">
                Личный кабинет
              </p>
              <h1 className="text-[20px] font-bold text-white leading-tight">
                {profile.first_name} {profile.last_name}
              </h1>
              <span
                className="inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: status.bg, color: status.color }}
              >
                {status.label}
              </span>
            </div>
          </div>

          <button onClick={logout} aria-label="Выйти"
            className="p-2.5 rounded-xl text-white/50 hover:text-white hover:bg-white/10 transition shrink-0">
            <LogOut size={18} />
          </button>
        </div>

        {/* Group info strip(s) */}
        {grp && (
          <div className="relative mt-5 space-y-1.5">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-white/60 text-[12px]">
                <Users size={12} />
                <span>Группа #{grp.number}</span>
              </div>
              {grp.trainer && (
                <div className="flex items-center gap-1.5 text-white/60 text-[12px]">
                  <span>·</span>
                  <span>{grp.trainer}</span>
                </div>
              )}
              {grp.schedule && (
                <div className="flex items-center gap-1.5 text-white/60 text-[12px]">
                  <Calendar size={11} />
                  <span>{scheduleLabel(grp.schedule)}</span>
                </div>
              )}
            </div>
            {profile.second_group && (
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                  <Users size={11} />
                  <span>Группа #{profile.second_group.number}</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[9px] font-semibold tracking-wider">2-я</span>
                </div>
                {profile.second_group.trainer && (
                  <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                    <span>·</span>
                    <span>{profile.second_group.trainer}</span>
                  </div>
                )}
                {profile.second_group.schedule && (
                  <div className="flex items-center gap-1.5 text-white/50 text-[11px]">
                    <Calendar size={10} />
                    <span>{scheduleLabel(profile.second_group.schedule)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── LIVE BANNER ──────────────────────────────────────────── */}
      {activeStream && (
        <Link
          to="/cabinet/stream"
          className="block mx-4 -mt-4 relative z-10 rounded-2xl px-4 py-3.5 shadow-xl active:scale-[0.99] transition"
          style={{ background: 'linear-gradient(135deg,#e11d48,#ec4899)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Radio size={18} className="text-white animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-black tracking-[0.2em] text-white">LIVE</span>
              </div>
              <p className="text-[14px] font-semibold text-white truncate">
                {activeStream.title || 'Эфир идёт сейчас'}
              </p>
            </div>
            <ChevronRight size={18} className="text-white/70 shrink-0" />
          </div>
        </Link>
      )}

      <div className={`px-4 space-y-3 ${activeStream ? 'mt-5' : 'mt-4'}`}>

        {/* ── STATS ROW ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Attendance */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
              <Sparkles size={11} /> Посещаемость
            </div>
            {attendancePct !== null ? (
              <>
                <p className="text-[28px] font-black leading-none"
                   style={{ color: attendancePct >= 80 ? '#16a34a' : attendancePct >= 50 ? '#d97706' : '#dc2626' }}>
                  {attendancePct}%
                </p>
                <p className="text-[11px] text-gray-400 mt-1">{presentCount} из {totalLessons} занятий</p>
              </>
            ) : (
              <p className="text-[28px] font-black text-gray-200 leading-none">—</p>
            )}
          </div>

          {/* Bonus */}
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">
              <Gift size={11} /> Бонусы
            </div>
            <p className="text-[28px] font-black text-rose-600 leading-none">
              {fmtMoney(profile.balance)}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">на балансе</p>
          </div>
        </div>

        {/* ── QUICK ACTIONS ───────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <Link to="/cabinet/lessons"
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm active:scale-[0.98] transition flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
              <BookOpen size={18} className="text-rose-500" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[13.5px] text-gray-800">Уроки</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Видео и аудио</p>
            </div>
          </Link>

          <Link to="/cabinet/archive"
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm active:scale-[0.98] transition flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
              <Archive size={18} className="text-violet-500" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-[13.5px] text-gray-800">Записи</p>
              <p className="text-[11px] text-gray-400 mt-0.5">Архив эфиров</p>
            </div>
          </Link>
        </div>

        {/* ── ATTENDANCE DOT STRIP ────────────────────────────────── */}
        {recentLessons.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold flex items-center gap-1.5">
                <Calendar size={11} /> Последние занятия
              </p>
              {grp?.schedule && (
                <span className="text-[11px] text-gray-400">{scheduleLabel(grp.schedule)}</span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {recentLessons.map(date => {
                const rec = attMap[date]
                const isAbsent = rec?.is_absent === true
                return (
                  <div key={date} title={`${shortDate(date)} — ${isAbsent ? 'НБ' : 'был(а)'}`}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold ${
                      isAbsent
                        ? 'bg-rose-50 text-rose-500 border border-rose-200'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                    }`}>
                    {isAbsent ? 'НБ' : '✓'}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── CONTACT & PERSONAL ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 pt-3.5 pb-1">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Мои данные</p>
          </div>
          <div className="divide-y divide-gray-50">
            <InfoRow icon={Phone} label="Телефон" value={profile.phone ?? '—'} />
            <InfoRow icon={Users} label="Формат" value={profile.training_format === 'online' ? 'Онлайн' : 'Оффлайн'} />
            {grp && <InfoRow icon={Calendar} label="Тип группы" value={GROUP_TYPE_LABEL[grp.group_type] || grp.group_type} />}
          </div>
        </div>

        {/* ── COMPLETED FLOWS ────────────────────────────────────── */}
        {profile.completed_flows?.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 pt-3.5 pb-1">
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                Завершённые потоки ({profile.completed_flows.length})
              </p>
            </div>
            <div className="divide-y divide-gray-50 px-4 pb-2">
              {profile.completed_flows.map((f, i) => (
                <div key={i} className="flex items-center gap-2 py-2.5 text-[13px]">
                  <CheckCircle2 size={13} className="text-rose-400 shrink-0" />
                  <span className="font-medium text-gray-700">Группа #{f.number}</span>
                  <span className="text-gray-400">— {GROUP_TYPE_LABEL[f.group_type] || f.group_type}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── BOTTOM NAV ───────────────────────────────────────────── */}
      <CabinetNav />
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon size={15} className="text-gray-300 shrink-0" />
      <span className="text-[13px] text-gray-500 flex-1">{label}</span>
      <span className="text-[13px] font-medium text-gray-800">{value}</span>
    </div>
  )
}
