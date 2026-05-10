import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  BarChart3, Users, Activity, AlertCircle,
  CheckCircle2, Eye, X, Headphones, Play, Phone, RefreshCw,
  ChevronLeft, ChevronRight, BookOpen, UserX,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, Cell,
} from 'recharts'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'

const INACTIVE_PAGE_SIZE = 20
const TABS = ['overview', 'lessons', 'students']

export default function EducationStats() {
  const { user } = useOutletContext()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState([])
  const [filterGroup, setFilterGroup] = useState('')
  const [inactiveDays, setInactiveDays] = useState(7)
  const [tab, setTab] = useState('overview')
  const [openLesson, setOpenLesson] = useState(null)
  const [inactivePage, setInactivePage] = useState(1)

  const reload = (lessonId = null) => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (filterGroup) p.set('group', filterGroup)
    if (inactiveDays) p.set('inactive_days', inactiveDays)
    if (lessonId) p.set('lesson', lessonId)
    api.get(`/education/stats/?${p.toString()}`)
      .then(r => {
        setData(r.data)
        setInactivePage(1) // reset pagination on reload
        if (lessonId && r.data.lesson_detail) setOpenLesson(r.data.lesson_detail)
      })
      .catch(e => setError(e.response?.data?.detail || 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    api.get('/groups/?page_size=200&training_format=online')
      .then(r => setGroups(r.data?.results || r.data || []))
      .catch(() => {})
  }, [])

  useEffect(() => { reload() }, [filterGroup, inactiveDays])

  const summary = data?.summary
  const lessons = data?.lessons || []
  const inactive = data?.inactive_clients || []

  const sortedLessons = useMemo(
    () => [...lessons].sort((a, b) => {
      if (a.viewers_count !== b.viewers_count) return b.viewers_count - a.viewers_count
      return (b.avg_percent || 0) - (a.avg_percent || 0)
    }),
    [lessons],
  )

  // Chart data: top 10 lessons by viewers, horizontal bars
  const chartData = useMemo(() =>
    sortedLessons.slice(0, 10).map(l => ({
      name: l.title.length > 28 ? l.title.slice(0, 28) + '…' : l.title,
      fullName: l.title,
      avg: l.avg_percent,
      viewers: l.viewers_count,
    })),
    [sortedLessons],
  )

  // Pagination
  const totalPages = Math.max(1, Math.ceil(inactive.length / INACTIVE_PAGE_SIZE))
  const safePage = Math.min(inactivePage, totalPages)
  const pagedInactive = inactive.slice(
    (safePage - 1) * INACTIVE_PAGE_SIZE,
    safePage * INACTIVE_PAGE_SIZE,
  )

  const tabLabels = {
    overview: 'Обзор',
    lessons: `Уроки${lessons.length ? ` (${lessons.length})` : ''}`,
    students: `Студенты${inactive.length ? ` (${inactive.length})` : ''}`,
  }

  return (
    <AdminLayout user={user}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 sm:mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white shadow-md shrink-0">
          <BarChart3 size={20} />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 leading-tight">Аналитика</h1>
          <p className="text-xs text-gray-500">
            {summary
              ? <>Уроков <span className="font-semibold text-gray-700">{summary.total_lessons}</span> · Среднее <span className="font-semibold text-rose-600">{summary.avg_completion_percent}%</span></>
              : 'Прогресс студентов по урокам'}
          </p>
        </div>
      </div>

      {/* Filters — always visible */}
      <div className="bg-white rounded-2xl border border-rose-100 p-4 mb-4 shadow-sm flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs text-gray-500 block mb-1 font-medium">Группа</label>
          <select
            value={filterGroup}
            onChange={e => setFilterGroup(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 bg-white text-sm"
          >
            <option value="">Все группы</option>
            {groups.map(g => <option key={g.id} value={g.id}>Группа {g.number}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1 font-medium">Порог неактивности (дней)</label>
          <input
            type="number" min={1} max={365} value={inactiveDays}
            onChange={e => setInactiveDays(Number(e.target.value) || 7)}
            className="px-3 py-2 border border-gray-200 rounded-xl w-28 focus:outline-none focus:ring-2 focus:ring-rose-300 text-sm"
          />
        </div>
        <button
          onClick={() => reload()}
          disabled={loading}
          className="sm:ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 transition text-sm font-medium disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm mb-4">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-4">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition ${
              tab === t
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tabLabels[t]}
          </button>
        ))}
      </div>

      {/* ── TAB: OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Всего уроков" value={summary?.total_lessons ?? '—'}
              icon={BookOpen} gradient="from-rose-100 to-pink-200" iconColor="text-rose-500" loading={loading} />
            <SummaryCard label="Студентов с доступом" value={summary?.total_clients_eligible ?? '—'}
              icon={Users} gradient="from-pink-100 to-purple-100" iconColor="text-pink-500" loading={loading} />
            <SummaryCard label="Среднее % просмотра" value={summary ? `${summary.avg_completion_percent}%` : '—'}
              icon={Activity} gradient="from-emerald-100 to-teal-100" iconColor="text-emerald-600" loading={loading} />
            <SummaryCard label={`Неактивны ${summary?.inactive_days ?? inactiveDays}+ дн.`}
              value={summary?.inactive ?? '—'}
              icon={UserX} gradient="from-amber-100 to-orange-100" iconColor="text-amber-600" loading={loading} />
          </div>

          {/* Recharts: lesson completion bar chart */}
          <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={17} className="text-rose-400" />
              <span className="font-semibold text-gray-800 text-sm">Средний % просмотра по урокам</span>
              <span className="text-xs text-gray-400 ml-1">(топ 10)</span>
            </div>

            {loading && (
              <div className="h-56 flex items-center justify-center text-gray-400 text-sm">Загрузка…</div>
            )}

            {!loading && chartData.length === 0 && (
              <div className="h-56 flex items-center justify-center text-gray-400 text-sm">
                Нет данных для отображения
              </div>
            )}

            {!loading && chartData.length > 0 && (
              <ResponsiveContainer width="100%" height={chartData.length * 42 + 16}>
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                  barCategoryGap="30%"
                >
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickCount={6}
                    tick={{ fontSize: 11, fill: '#9ca3af' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={160}
                    tick={{ fontSize: 12, fill: '#374151' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#fef2f2' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div className="bg-white border border-rose-100 rounded-xl shadow-lg px-3 py-2 text-xs max-w-[220px]">
                          <p className="font-semibold text-gray-800 mb-1 leading-tight">{d.fullName}</p>
                          <p className="text-rose-600">Среднее: <b>{d.avg}%</b></p>
                          <p className="text-gray-500">Зрителей: <b>{d.viewers}</b></p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="avg" radius={[0, 6, 6, 0]} maxBarSize={20}>
                    {chartData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.avg >= 75 ? '#10b981' : entry.avg >= 40 ? '#f59e0b' : '#f43f5e'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}

            {/* Color legend */}
            {!loading && chartData.length > 0 && (
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> ≥75%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> 40–74%</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> &lt;40%</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB: LESSONS ── */}
      {tab === 'lessons' && (
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm">
          <div className="p-4 border-b border-rose-50 font-semibold flex items-center gap-2 text-sm">
            <Eye size={16} className="text-rose-500" /> Уроки и просмотры
          </div>
          {loading && (
            <div className="p-8 text-center text-gray-400">Загрузка…</div>
          )}
          {!loading && sortedLessons.length === 0 && (
            <div className="p-8 text-center text-gray-400">Нет опубликованных уроков по выбранным фильтрам.</div>
          )}
          <div className="divide-y">
            {sortedLessons.map(l => (
              <button
                key={l.id}
                onClick={() => reload(l.id)}
                className="w-full text-left flex items-center gap-3 p-4 hover:bg-rose-50/50 transition"
              >
                <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                  {l.lesson_type === 'audio' ? <Headphones size={16} /> : <Play size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{l.title}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {l.lesson_type === 'audio' ? 'Аудио' : 'Видео'}
                    {l.groups.length > 0 && ` · ${l.groups.map(g => typeof g === 'object' ? `Группа ${g.number}` : g).join(', ')}`}
                  </div>
                  {/* inline progress bar */}
                  <div className="mt-1.5 h-1 bg-gray-100 rounded-full overflow-hidden w-full max-w-[160px]">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${l.avg_percent}%`,
                        background: l.avg_percent >= 75 ? '#10b981' : l.avg_percent >= 40 ? '#f59e0b' : '#f43f5e',
                      }}
                    />
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-5 shrink-0">
                  <Stat label="Зрителей" value={l.viewers_count} />
                  <Stat label="Среднее" value={`${l.avg_percent}%`} accent />
                  <Stat label="Завершили" value={l.completed_count}
                    icon={l.completed_count > 0 ? CheckCircle2 : null} />
                </div>
                <div className="flex sm:hidden text-xs gap-2 text-gray-500 shrink-0">
                  <span>{l.viewers_count} зр.</span>
                  <span className="text-rose-600 font-semibold">{l.avg_percent}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB: STUDENTS ── */}
      {tab === 'students' && (
        <div className="bg-white rounded-2xl border border-rose-100 shadow-sm">
          <div className="p-4 border-b border-rose-50 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <span className="font-semibold text-sm flex-1">
              Неактивные онлайн-студенты ({inactive.length})
            </span>
            {totalPages > 1 && (
              <span className="text-xs text-gray-400">стр. {safePage} / {totalPages}</span>
            )}
          </div>

          {!loading && inactive.length === 0 && (
            <div className="p-10 text-center text-gray-400">Все онлайн-студенты активны.</div>
          )}

          <div className="divide-y">
            {pagedInactive.map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-semibold text-sm shrink-0">
                  {(c.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{c.last_name} {c.first_name}</div>
                  <div className="text-xs text-gray-400 truncate flex items-center gap-1.5">
                    <Phone size={10} /> {c.phone}
                    {c.group_name && <span>· {c.group_name}</span>}
                  </div>
                </div>
                <div className="text-xs text-right shrink-0 w-20">
                  {c.last_watched_at
                    ? <span className="text-gray-500">{new Date(c.last_watched_at).toLocaleDateString('ru')}</span>
                    : <span className="text-rose-500 font-medium">не смотрел</span>
                  }
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="p-3 border-t border-rose-50 flex items-center justify-between gap-2">
              <button
                onClick={() => setInactivePage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
              >
                <ChevronLeft size={15} /> Назад
              </button>
              <span className="text-xs text-gray-500">
                {(safePage - 1) * INACTIVE_PAGE_SIZE + 1}–{Math.min(safePage * INACTIVE_PAGE_SIZE, inactive.length)} из {inactive.length}
              </span>
              <button
                onClick={() => setInactivePage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-30 transition"
              >
                Вперёд <ChevronRight size={15} />
              </button>
            </div>
          )}
        </div>
      )}

      {openLesson && (
        <LessonDetailModal lesson={openLesson} onClose={() => setOpenLesson(null)} />
      )}
    </AdminLayout>
  )
}

function SummaryCard({ label, value, icon: Icon, gradient, iconColor, loading }) {
  return (
    <div className={`rounded-2xl p-4 border bg-gradient-to-br ${gradient} shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-gray-600 mb-1">{label}</div>
          <div className={`text-2xl font-bold ${loading ? 'animate-pulse text-gray-300' : ''}`}>
            {loading ? '—' : value}
          </div>
        </div>
        <Icon size={26} className={`${iconColor} shrink-0`} />
      </div>
    </div>
  )
}

function Stat({ label, value, accent, icon: Icon }) {
  return (
    <div className="text-right">
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-sm font-semibold flex items-center gap-1 justify-end ${accent ? 'text-rose-600' : 'text-gray-800'}`}>
        {Icon && <Icon size={13} className="text-emerald-500" />}
        {value}
      </div>
    </div>
  )
}

function LessonDetailModal({ lesson, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-gray-400">Урок</div>
            <h3 className="font-semibold truncate">{lesson.title}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {lesson.viewers.length === 0 && (
            <div className="p-8 text-center text-gray-400">Этот урок ещё никто не открывал.</div>
          )}
          <div className="divide-y">
            {lesson.viewers.map(v => (
              <div key={v.client_id} className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-semibold text-sm shrink-0">
                  {(v.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{v.last_name} {v.first_name}</div>
                  <div className="text-xs text-gray-400 truncate">
                    {v.phone}
                    {v.last_watched_at && ` · ${new Date(v.last_watched_at).toLocaleDateString('ru')}`}
                  </div>
                </div>
                <div className="shrink-0 w-28">
                  <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                    {v.is_completed && <CheckCircle2 size={12} className="text-emerald-500" />}
                    <span className="font-semibold">{v.percent_watched}%</span>
                  </div>
                  <div className="h-1.5 bg-rose-50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-400 to-pink-500"
                      style={{ width: `${v.percent_watched}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
