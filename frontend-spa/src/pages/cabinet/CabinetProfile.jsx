import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, CheckCircle2, XCircle, Sparkles, LogOut } from 'lucide-react'
import api from '../../api/axios'
import { fmtMoney, fmtDate, STATUS_LABEL, GROUP_TYPE_LABEL } from '../../utils/format'

const DAY_KEYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAY_SHORT_RU = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб']
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
// Локальная дата YYYY-MM-DD без UTC-сдвига (для UTC+6 Кыргызстан)
function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function todayISO() { return localDateISO() }
function getLessonDates(schedule, startDate) {
  const nums = parseScheduleDays(schedule)
  if (!nums.length || !startDate) return []
  const today = todayISO()  // сегодня в локальном времени (точно)
  const dates = []
  const cur = new Date(startDate + 'T00:00:00')  // парсим как локальное
  while (true) {
    const iso = localDateISO(cur)
    if (iso > today) break   // Будущие занятия — не показываем!
    if (nums.includes(cur.getDay())) dates.push(iso)
    cur.setDate(cur.getDate() + 1)
  }
  return dates.reverse()
}
function fmtDateHeader(str) {
  if (!str) return { day: '', date: '' }
  const d = new Date(str + 'T00:00:00')
  const [, m, dd] = str.split('-')
  return { day: DAY_SHORT_RU[d.getDay()], date: `${dd}.${m}` }
}

const STATUS_STYLE = {
  active:      { bg: '#f0fdf4', color: '#15803d', label: 'Активный'  },
  frozen:      { bg: '#eff6ff', color: '#1d4ed8', label: 'Заморозка' },
  completed:   { bg: '#f3f4f6', color: '#4b5563', label: 'Завершил'  },
  expelled:    { bg: '#fff1f2', color: '#be123c', label: 'Отчислен'  },
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between items-center py-2.5 border-b" style={{ borderColor: '#f5eff2' }}>
      <span className="text-sm" style={{ color: 'var(--text-soft)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{value}</span>
    </div>
  )
}

export default function CabinetProfile() {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attendance, setAttendance] = useState(null)
  const nav = useNavigate()

  useEffect(() => {
    const t = localStorage.getItem('cabinet_access_token')
    if (!t) { nav('/cabinet'); return }
    const load = async () => {
      setLoading(true); setError('')
      try {
        const [pr, ar] = await Promise.all([
          api.get('/cabinet/me/'),
          api.get('/cabinet/attendance/?limit=200').catch(() => null),
        ])
        setProfile(pr.data)
        if (ar) setAttendance(ar.data)
      } catch (e) {
        if (e.response?.status === 401) { nav('/cabinet'); return }
        const d = e.response?.data
        setError(d?.detail ?? e.message ?? 'Ошибка загрузки')
      } finally { setLoading(false) }
    }
    load()
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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf7f8' }}>
      <div className="text-center">
        <div className="w-10 h-10 rounded-2xl mx-auto mb-4 flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
          <Sparkles size={18} className="text-white" />
        </div>
        <div className="w-6 h-6 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin mx-auto" />
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#faf7f8' }}>
      <div className="text-center">
        <p className="text-red-500 mb-4 text-sm">{error}</p>
        <button onClick={() => window.location.reload()}
          className="px-5 py-2 rounded-xl text-sm text-white font-medium"
          style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
          Повторить
        </button>
      </div>
    </div>
  )

  if (!profile) return null

  const grp = profile.current_group
  const statusStyle = STATUS_STYLE[profile.status] || STATUS_STYLE.active

  return (
    <div className="min-h-screen" style={{ background: '#faf7f8' }}>
      <div className="max-w-xl mx-auto pb-12">

        {/* ── Hero header ── */}
        <div className="relative overflow-hidden px-6 pt-10 pb-8 mb-0"
             style={{ background: 'linear-gradient(150deg, #1a1023 0%, #3b1060 60%, #1a1030 100%)' }}>
          {/* Декоративные круги */}
          <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full pointer-events-none opacity-20"
               style={{ background: 'radial-gradient(circle,#f9a8d4,transparent 70%)' }} />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full pointer-events-none opacity-10"
               style={{ background: 'radial-gradient(circle,#a78bfa,transparent 70%)' }} />

          {/* Top row */}
          <div className="relative flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                   style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)' }}>
                <Sparkles size={13} className="text-white" strokeWidth={2} />
              </div>
              <span className="text-white text-xs font-medium opacity-70">Личный кабинет</span>
            </div>
            <button onClick={logout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition"
              style={{ color: '#fda4af', background: 'rgba(253,164,175,0.1)', border: '1px solid rgba(253,164,175,0.2)' }}>
              <LogOut size={13} /> Выйти
            </button>
          </div>

          {/* Имя */}
          <div className="relative">
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
              {profile.last_name} {profile.first_name}
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold"
                    style={{ background: statusStyle.bg, color: statusStyle.color }}>
                {statusStyle.label}
              </span>
              {grp && (
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Поток #{grp.number} · {GROUP_TYPE_LABEL[grp.group_type] || grp.group_type}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 space-y-3 pt-4">

          {/* ── Бонусы ── */}
          <div className="rounded-2xl p-5 flex items-center justify-between"
               style={{ background: '#fff', border: '1px solid #ece4e8' }}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#c9afc0' }}>
                Бонусный баланс
              </p>
              <p className="text-2xl font-bold" style={{ color: '#be185d', letterSpacing: '-0.03em' }}>
                {fmtMoney(profile.balance)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                 style={{ background: '#fce7f3' }}>
              <span className="text-xl">🌸</span>
            </div>
          </div>

          {/* ── Мои данные ── */}
          <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #ece4e8' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#c9afc0' }}>
              Мои данные
            </p>
            <div>
              <Row label="Телефон" value={profile.phone ?? '—'} />
              <Row label="Формат" value={profile.training_format === 'online' ? 'Онлайн' : 'Оффлайн'} />
              <Row label="Тип группы" value={GROUP_TYPE_LABEL[profile.group_type] || profile.group_type} />
              {profile.registered_at && (
                <div className="flex justify-between items-center pt-2.5">
                  <span className="text-sm" style={{ color: 'var(--text-soft)' }}>Дата регистрации</span>
                  <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{fmtDate(profile.registered_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Текущий поток ── */}
          {grp && (
            <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #ece4e8' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#c9afc0' }}>
                Текущий поток
              </p>
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold" style={{ color: 'var(--text)' }}>Поток #{grp.number}</span>
                <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                      style={{ background: '#f0fdf4', color: '#15803d' }}>
                  {grp.status === 'active' ? 'Идёт обучение' : grp.status === 'recruitment' ? 'Набор' : 'Завершён'}
                </span>
              </div>
              {grp.trainer && (
                <p className="text-xs mt-1" style={{ color: 'var(--text-soft)' }}>
                  Тренер: <strong>{grp.trainer}</strong>
                </p>
              )}
              {grp.schedule && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-soft)' }}>
                  Расписание: <strong>{scheduleLabel(grp.schedule)}</strong>
                </p>
              )}
            </div>
          )}

          {/* ── Завершённые потоки ── */}
          {profile.completed_flows?.length > 0 && (
            <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #ece4e8' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#c9afc0' }}>
                Завершённые потоки
              </p>
              <ul className="space-y-2">
                {profile.completed_flows.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <Check size={14} style={{ color: '#be185d' }} className="shrink-0" />
                    <span className="font-medium">Поток #{f.number}</span>
                    <span style={{ color: 'var(--text-xs)' }}>·</span>
                    <span style={{ color: 'var(--text-soft)' }}>{GROUP_TYPE_LABEL[f.group_type] || f.group_type}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!grp && !profile.completed_flows?.length && (
            <div className="rounded-2xl p-5 text-center" style={{ background: '#fdf8fb', border: '1px dashed #e0c8d5' }}>
              <p className="text-sm" style={{ color: 'var(--text-xs)' }}>
                Информация о потоках отобразится после зачисления в группу
              </p>
            </div>
          )}

          {/* ── История посещаемости ── */}
          {attendance && (
            <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #ece4e8' }}>

              {/* Шапка */}
              <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3"
                   style={{ borderBottom: '1px solid #f5eff2' }}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#c9afc0' }}>
                    История посещаемости
                  </p>
                  {grp?.schedule && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-xs)' }}>
                      {scheduleLabel(grp.schedule)}
                    </p>
                  )}
                </div>
                {/* Счётчики — пересчитываем с учётом логики «по умолчанию присутствовал» */}
                {(() => {
                const totalLessons = lessonDates.length || attendance.total
                const nbCount = attendance.absent
                const presentCount = totalLessons - nbCount
                return (
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                    <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{totalLessons}</p>
                    <p className="text-xs" style={{ color: 'var(--text-xs)' }}>Всего</p>
                    </div>
                    <div className="w-px h-8 bg-rose-100" />
                    <div className="text-center">
                    <p className="text-base font-bold" style={{ color: '#16a34a' }}>{presentCount}</p>
                    <p className="text-xs" style={{ color: 'var(--text-xs)' }}>Был(а)</p>
                    </div>
                      <div className="w-px h-8 bg-rose-100" />
                    <div className="text-center">
                      <p className="text-base font-bold" style={{ color: '#be123c' }}>{nbCount}</p>
                      <p className="text-xs" style={{ color: 'var(--text-xs)' }}>НБ</p>
                    </div>
                  </div>
                )
              })()}
              </div>

              {/* Таблица */}
              {lessonDates.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse"
                         style={{ minWidth: `${lessonDates.length * 52 + 160}px` }}>
                    <thead style={{ background: '#fdf8fa', borderBottom: '1px solid #ece4e8' }}>
                      <tr>
                        <th className="text-left px-4 py-2.5 font-medium sticky left-0 bg-[#fdf8fa] z-10"
                            style={{ color: 'var(--text-soft)', minWidth: 140 }}>
                          Имя
                        </th>
                        {lessonDates.map(date => {
                          const { day, date: d } = fmtDateHeader(date)
                          return (
                            <th key={date} className="text-center px-1 py-2" style={{ minWidth: 48 }}>
                              <div className="font-semibold" style={{ color: 'var(--text-soft)' }}>{day}</div>
                              <div className="font-normal" style={{ color: 'var(--text-xs)' }}>{d}</div>
                            </th>
                          )
                        })}
                        <th className="text-center px-3 py-2.5 font-semibold sticky right-0 bg-[#fdf8fa]"
                            style={{ color: '#be123c', minWidth: 52 }}>НБ</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="px-4 py-3 font-semibold sticky left-0 bg-white z-10"
                            style={{ color: 'var(--text)', borderBottom: '1px solid #f5eff2' }}>
                          {profile.last_name} {profile.first_name}
                        </td>
                        {lessonDates.map(date => {
                          const rec = attMap[date]
                          // Нет записи = присутствовал по умолчанию (✓)
                          // Запись с is_absent=true = НБ
                          // Запись с is_absent=false = явно отмечен как присутствующий (✓)
                          const isAbsent = rec?.is_absent === true
                          return (
                            <td key={date} className="px-1 py-3 text-center"
                                style={{ borderBottom: '1px solid #f5eff2' }}>
                              {isAbsent
                                ? <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                                         style={{ background: '#fff1f2', color: '#be123c' }}>НБ</span>
                                : <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
                                         style={{ background: '#f0fdf4', color: '#15803d' }}>✓</span>
                              }
                            </td>
                          )
                        })}
                        <td className="px-3 py-3 text-center sticky right-0 bg-white"
                            style={{ borderBottom: '1px solid #f5eff2' }}>
                          {attendance.absent > 0
                            ? <span className="font-bold" style={{ color: '#be123c' }}>{attendance.absent}</span>
                            : <span style={{ color: '#ccc' }}>0</span>
                          }
                        </td>
                      </tr>
                    </tbody>
                    <tfoot style={{ background: '#fdf8fa', borderTop: '1px solid #ece4e8' }}>
                      <tr>
                        <td className="px-4 py-2 text-xs sticky left-0 bg-[#fdf8fa]"
                            style={{ color: 'var(--text-xs)' }}>
                          Занятий: {lessonDates.length}
                        </td>
                        {lessonDates.map(date => {
                          const rec = attMap[date]
                          const isAbsent = rec?.is_absent === true
                          return (
                            <td key={date} className="px-1 py-2 text-center">
                              {isAbsent
                                ? <span className="font-bold text-xs" style={{ color: '#be123c' }}>НБ</span>
                                : <span className="text-xs" style={{ color: '#16a34a' }}>✓</span>
                              }
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-center sticky right-0 bg-[#fdf8fa]">
                          <span className="font-bold text-xs" style={{ color: attendance.absent > 0 ? '#be123c' : '#ccc' }}>
                            {attendance.absent}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : attendance.records.length > 0 ? (
                /* Запасной список */
                <div className="p-4 space-y-1.5">
                  {attendance.records.map((r, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm"
                         style={{ background: r.is_absent ? '#fff1f2' : '#f0fdf4' }}>
                      <span className="font-medium" style={{ color: 'var(--text)' }}>{fmtDate(r.lesson_date)}</span>
                      {r.is_absent
                        ? <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#be123c' }}>
                            <XCircle size={13} /> НБ
                          </span>
                        : <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#15803d' }}>
                            <CheckCircle2 size={13} /> Был(а)
                          </span>
                      }
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-center py-8" style={{ color: 'var(--text-xs)' }}>
                  Занятий пока не было
                </p>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
