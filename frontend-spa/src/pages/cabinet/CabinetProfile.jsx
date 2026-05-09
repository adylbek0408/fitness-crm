import { useState, useEffect, useMemo } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  CheckCircle2, XCircle, LogOut, Gift, User, Play, Radio, Archive,
  ChevronDown, ChevronRight, Calendar, Phone, Sparkles,
} from 'lucide-react'
import api from '../../api/axios'
import { fmtMoney, fmtDate, GROUP_TYPE_LABEL } from '../../utils/format'

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

const STATUS_STYLE = {
  active:    { bg: 'rgba(187,247,208,0.25)', color: '#bbf7d0', label: 'Активный'  },
  frozen:    { bg: 'rgba(191,219,254,0.25)', color: '#bfdbfe', label: 'Заморозка' },
  completed: { bg: 'rgba(229,231,235,0.25)', color: '#e5e7eb', label: 'Завершил'  },
  expelled:  { bg: 'rgba(254,202,202,0.25)', color: '#fecaca', label: 'Отчислен'  },
}

function Section({ title, icon: Icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-2xl bg-white border border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-[var(--primary-pale)]/30 transition"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          {Icon && <Icon size={16} className="text-[var(--primary)]" aria-hidden />}
          <span className="font-semibold text-[var(--text)]">{title}</span>
        </span>
        <ChevronDown
          size={18}
          className={`text-[var(--text-xs)] transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-[var(--border-soft)]">
          {children}
        </div>
      )}
    </section>
  )
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b last:border-b-0 border-[var(--border-soft)]">
      <span className="text-[13px] text-[var(--text-soft)]">{label}</span>
      <span className="text-[13px] font-medium text-[var(--text)] text-right">{value}</span>
    </div>
  )
}

export default function CabinetProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attendance, setAttendance] = useState(null)
  const [activeStream, setActiveStream] = useState(null)
  const nav = useNavigate()

  useEffect(() => {
    const t = localStorage.getItem('cabinet_access_token')
    if (!t) { nav('/cabinet'); return }
    const load = async () => {
      setLoading(true); setError('')
      try {
        const [pr, ar, sr] = await Promise.all([
          api.get('/cabinet/me/'),
          api.get('/cabinet/attendance/?limit=200').catch(() => null),
          api.get('/cabinet/education/streams/active/').catch(() => null),
        ])
        setProfile(pr.data)
        if (ar) setAttendance(ar.data)
        if (sr) setActiveStream(sr.data?.stream || null)
      } catch (e) {
        if (e.response?.status === 401) { nav('/cabinet'); return }
        const d = e.response?.data
        setError(d?.detail ?? e.message ?? 'Ошибка загрузки')
      } finally { setLoading(false) }
    }
    load()
    const t2 = setInterval(() => {
      api.get('/cabinet/education/streams/active/')
        .then(r => setActiveStream(r.data?.stream || null))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(t2)
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

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
      <div className="w-7 h-7 border-2 border-[var(--primary-pale)] border-t-[var(--primary)] rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--bg)]">
      <div className="text-center max-w-xs">
        <p className="text-rose-500 mb-4 text-sm">{error}</p>
        <button onClick={() => window.location.reload()}
          className="px-5 py-2.5 rounded-xl text-sm text-white font-medium bg-gradient-to-br from-[var(--primary)] to-[var(--accent)]">
          Повторить
        </button>
      </div>
    </div>
  )

  if (!profile) return null

  const grp = profile.current_group
  const statusStyle = STATUS_STYLE[profile.status] || STATUS_STYLE.active
  const initial = (profile.first_name || profile.last_name || '?').charAt(0).toUpperCase()

  // Attendance counts for stats row
  const totalLessons = lessonDates.length || (attendance?.total ?? 0)
  const absentCount = attendance?.absent ?? 0
  const presentCount = Math.max(0, totalLessons - absentCount)
  const attendancePct = totalLessons > 0 ? Math.round((presentCount / totalLessons) * 100) : 0

  // Last 21 lessons for the dot strip (most recent on the right)
  const recentLessons = lessonDates.slice(-21)

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-md sm:max-w-2xl mx-auto pb-10">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <header
          className="relative px-5 pt-6 pb-7 text-white overflow-hidden"
          style={{ background: 'linear-gradient(150deg, #1a1023 0%, #3b1060 60%, #1a1030 100%)' }}
        >
          <div className="absolute -top-12 -right-10 w-44 h-44 rounded-full opacity-25 pointer-events-none"
               style={{ background: 'radial-gradient(circle,#f9a8d4,transparent 70%)' }} />

          <div className="relative flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-2xl shrink-0 flex items-center justify-center text-lg font-bold shadow-lg"
                   style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] opacity-60 font-medium">Личный кабинет</p>
                <h1 className="text-[18px] sm:text-[19px] font-bold tracking-tight truncate">
                  {profile.first_name} {profile.last_name}
                </h1>
              </div>
            </div>
            <button
              onClick={logout}
              aria-label="Выйти"
              className="shrink-0 p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 active:bg-white/15 transition focus:outline-none focus:ring-2 focus:ring-white/30"
            >
              <LogOut size={18} />
            </button>
          </div>

          <div className="relative mt-4 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border"
                  style={{ background: statusStyle.bg, color: statusStyle.color, borderColor: statusStyle.color + '40' }}>
              {statusStyle.label}
            </span>
            {grp && (
              <span className="text-[12px] text-white/60">
                Группа #{grp.number} · {GROUP_TYPE_LABEL[grp.group_type] || grp.group_type}
              </span>
            )}
          </div>
        </header>

        {/* ── LIVE banner ──────────────────────────────────────── */}
        {activeStream && (
          <Link
            to="/cabinet/stream"
            className="block mx-3 -mt-4 relative z-10 rounded-2xl px-4 py-3.5 shadow-lg active:scale-[0.99] transition"
            style={{ background: 'linear-gradient(135deg,#e11d48,#ec4899)' }}
            aria-label="Перейти в эфир"
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
                <Radio size={20} className="text-white animate-pulse" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  <span className="text-[10px] font-bold tracking-[0.18em] text-white">LIVE</span>
                </div>
                <p className="text-[14px] font-semibold text-white truncate">
                  {activeStream.title || 'Эфир идёт сейчас'}
                </p>
                <p className="text-[11.5px] text-white/80">Тапните, чтобы присоединиться →</p>
              </div>
            </div>
          </Link>
        )}

        <div className={`px-3 ${activeStream ? 'pt-4' : 'pt-4'} space-y-3`}>

          {/* ── Quick action tiles ─────────────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/cabinet/lessons"
              className="rounded-2xl p-4 bg-white border border-[var(--border)] active:scale-[0.98] transition shadow-sm hover:shadow-md"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                   style={{ background: 'linear-gradient(135deg,#fce7f3,#fbcfe8)' }}>
                <Play size={20} className="text-[var(--primary)]" />
              </div>
              <p className="font-semibold text-[14.5px] text-[var(--text)]">Мои уроки</p>
              <p className="text-[11.5px] text-[var(--text-xs)] mt-0.5">Видео и аудио</p>
            </Link>

            <Link
              to="/cabinet/archive"
              className="rounded-2xl p-4 bg-white border border-[var(--border)] active:scale-[0.98] transition shadow-sm hover:shadow-md"
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
                   style={{ background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)' }}>
                <Archive size={20} className="text-[var(--accent)]" />
              </div>
              <p className="font-semibold text-[14.5px] text-[var(--text)]">Архив</p>
              <p className="text-[11.5px] text-[var(--text-xs)] mt-0.5">Записи эфиров</p>
            </Link>
          </div>

          {/* ── Stream pending tile (when no active stream) ───── */}
          {!activeStream && (
            <Link
              to="/cabinet/stream"
              className="rounded-2xl p-4 bg-white border border-[var(--border)] flex items-center gap-3 active:scale-[0.99] transition"
            >
              <div className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg,#fdf2f8,#fbcfe8)' }}>
                <Radio size={20} className="text-[var(--primary)]" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[14.5px] text-[var(--text)]">Прямой эфир</p>
                <p className="text-[11.5px] text-[var(--text-xs)]">Появится, когда тренер начнёт</p>
              </div>
              <ChevronRight size={16} className="text-[var(--text-xs)] shrink-0" />
            </Link>
          )}

          {/* ── Stats: bonus + attendance % ────────────────────── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl p-4 bg-white border border-[var(--border)]">
              <div className="flex items-center gap-1.5 mb-2 text-[11px] uppercase tracking-wider text-[var(--text-xs)] font-semibold">
                <Gift size={12} aria-hidden /> Бонусы
              </div>
              <p className="text-[20px] font-bold text-[var(--primary)] leading-none tracking-tight">
                {fmtMoney(profile.balance)}
              </p>
            </div>
            <div className="rounded-2xl p-4 bg-white border border-[var(--border)]">
              <div className="flex items-center gap-1.5 mb-2 text-[11px] uppercase tracking-wider text-[var(--text-xs)] font-semibold">
                <Sparkles size={12} aria-hidden /> Посещаемость
              </div>
              <p className="text-[20px] font-bold leading-none tracking-tight"
                 style={{ color: attendancePct >= 80 ? '#16a34a' : attendancePct >= 50 ? '#d97706' : '#be123c' }}>
                {totalLessons === 0 ? '—' : `${attendancePct}%`}
              </p>
              {totalLessons > 0 && (
                <p className="text-[11px] text-[var(--text-xs)] mt-1">{presentCount} из {totalLessons}</p>
              )}
            </div>
          </div>

          {/* ── Attendance dot strip ───────────────────────────── */}
          {recentLessons.length > 0 && (
            <div className="rounded-2xl p-4 bg-white border border-[var(--border)]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--text-xs)] font-semibold">
                  <Calendar size={12} aria-hidden /> Последние занятия
                </div>
                {grp?.schedule && (
                  <span className="text-[11px] text-[var(--text-xs)]">{scheduleLabel(grp.schedule)}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {recentLessons.map(date => {
                  const rec = attMap[date]
                  const isAbsent = rec?.is_absent === true
                  return (
                    <div
                      key={date}
                      title={`${shortDate(date)} — ${isAbsent ? 'НБ' : 'был(а)'}`}
                      className={`relative w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold ${
                        isAbsent
                          ? 'bg-rose-50 text-rose-600 border border-rose-200'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                      }`}
                    >
                      {isAbsent ? 'НБ' : '✓'}
                    </div>
                  )
                })}
              </div>

              {recentLessons.length >= 21 && lessonDates.length > 21 && (
                <p className="text-[11px] text-[var(--text-xs)] mt-2.5">
                  Показаны последние 21 из {lessonDates.length}
                </p>
              )}
            </div>
          )}

          {/* ── Empty state for attendance ─────────────────────── */}
          {!loading && recentLessons.length === 0 && (
            <div className="rounded-2xl px-4 py-5 text-center bg-white border border-dashed border-[var(--border)]">
              <p className="text-[13px] text-[var(--text-xs)]">
                {grp ? 'Занятий пока не было' : 'Группа появится здесь после зачисления'}
              </p>
            </div>
          )}

          {/* ── Collapsible: Current group ─────────────────────── */}
          {grp && (
            <Section title="Текущая группа" icon={User}>
              <div className="space-y-0">
                <Row label="Номер" value={`#${grp.number}`} />
                <Row label="Тип" value={GROUP_TYPE_LABEL[grp.group_type] || grp.group_type} />
                {grp.trainer && <Row label="Тренер" value={grp.trainer} />}
                {grp.schedule && <Row label="Расписание" value={scheduleLabel(grp.schedule)} />}
                <Row label="Статус" value={
                  grp.status === 'active' ? 'Идёт обучение' :
                  grp.status === 'recruitment' ? 'Набор' : 'Завершён'
                } />
              </div>
            </Section>
          )}

          {/* ── Collapsible: Personal data ─────────────────────── */}
          <Section title="Мои данные" icon={Phone}>
            <div className="space-y-0">
              <Row label="Телефон" value={profile.phone ?? '—'} />
              <Row label="Формат" value={profile.training_format === 'online' ? 'Онлайн' : 'Оффлайн'} />
              <Row label="Тип группы" value={GROUP_TYPE_LABEL[profile.group_type] || profile.group_type} />
              {profile.registered_at && <Row label="Регистрация" value={fmtDate(profile.registered_at)} />}
            </div>
          </Section>

          {/* ── Completed groups ───────────────────────────────── */}
          {profile.completed_flows?.length > 0 && (
            <Section title={`Завершённые потоки (${profile.completed_flows.length})`} icon={CheckCircle2}>
              <ul className="space-y-1.5">
                {profile.completed_flows.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 py-1 text-[13px]">
                    <CheckCircle2 size={13} className="text-[var(--primary)] shrink-0" />
                    <span className="font-medium">Группа #{f.number}</span>
                    <span className="text-[var(--text-xs)]">·</span>
                    <span className="text-[var(--text-soft)]">{GROUP_TYPE_LABEL[f.group_type] || f.group_type}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* ── Detailed attendance log (for power users) ──────── */}
          {attendance?.records?.length > 0 && (
            <Section title={`Детальная история (${absentCount > 0 ? `${absentCount} НБ` : 'без пропусков'})`} icon={XCircle}>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {attendance.records.slice(0, 50).map((r, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-[13px] ${
                      r.is_absent ? 'bg-rose-50' : 'bg-emerald-50'
                    }`}
                  >
                    <span className="font-medium text-[var(--text)]">{fmtDate(r.lesson_date)}</span>
                    {r.is_absent
                      ? <span className="inline-flex items-center gap-1 text-[12px] font-bold text-rose-600">
                          <XCircle size={13} /> НБ
                        </span>
                      : <span className="inline-flex items-center gap-1 text-[12px] font-bold text-emerald-600">
                          <CheckCircle2 size={13} /> Был(а)
                        </span>
                    }
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
