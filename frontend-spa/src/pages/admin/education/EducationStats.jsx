import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  RefreshCw, CheckCircle2, X, Phone,
  ChevronLeft, ChevronRight, Play, Headphones, BarChart2, Download,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
} from 'recharts'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'
import AppSelect from '../../../components/ui/AppSelect'
import { pickList } from '../../../utils/format'

const PAGE = 20
const CHART_PAGE = 10

export default function EducationStats() {
  const { user } = useOutletContext()
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [groups, setGroups]       = useState([])
  const [filterGroup, setFilterGroup] = useState('')
  const [openLesson, setOpenLesson]   = useState(null)
  const [inactivePage, setInactivePage] = useState(1)
  const [chartPage, setChartPage]     = useState(1)

  const reload = (lessonId = null) => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (filterGroup) p.set('group', filterGroup)
    if (lessonId)    p.set('lesson', lessonId)
    api.get(`/education/stats/?${p.toString()}`)
      .then(r => {
        setData(r.data)
        setInactivePage(1)
        setChartPage(1)
        if (lessonId && r.data.lesson_detail) setOpenLesson(r.data.lesson_detail)
      })
      .catch(e => setError(e.response?.data?.detail || 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    api.get('/groups/?page_size=200')
      .then(r => setGroups(pickList(r.data)))
      .catch(() => {})
  }, [])

  useEffect(() => { reload() }, [filterGroup])

  const summary  = data?.summary
  const lessons  = data?.lessons  || []
  const inactive = data?.inactive_clients || []

  const sortedLessons = useMemo(
    () => [...lessons].sort((a, b) =>
      b.viewers_count !== a.viewers_count
        ? b.viewers_count - a.viewers_count
        : (b.avg_percent || 0) - (a.avg_percent || 0)
    ),
    [lessons],
  )

  const chartTotalPages = Math.max(1, Math.ceil(sortedLessons.length / CHART_PAGE))
  const safeChartPage   = Math.min(chartPage, chartTotalPages)

  const chartData = useMemo(() =>
    sortedLessons
      .slice((safeChartPage - 1) * CHART_PAGE, safeChartPage * CHART_PAGE)
      .map(l => ({
        id:       l.id,
        name:     l.title.length > 28 ? l.title.slice(0, 28) + '…' : l.title,
        fullName: l.title,
        avg:      l.avg_percent,
        viewers:  l.viewers_count,
        completed: l.completed_count,
        type:     l.lesson_type,
      })),
    [sortedLessons, safeChartPage],
  )

  const totalPages  = Math.max(1, Math.ceil(inactive.length / PAGE))
  const safePage    = Math.min(inactivePage, totalPages)
  const pagedInactive = inactive.slice((safePage - 1) * PAGE, safePage * PAGE)

  const barColor = v => v >= 75 ? '#10b981' : v >= 40 ? '#f59e0b' : '#f43f5e'

  const exportCsv = () => {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = []

    rows.push(['НЕАКТИВНЫЕ СТУДЕНТЫ (7+ дней без просмотра)'])
    rows.push(['Фамилия', 'Имя', 'Телефон', 'Группа', 'Последний просмотр'])
    inactive.forEach(c => rows.push([
      esc(c.last_name), esc(c.first_name), esc(c.phone), esc(c.group_name || ''),
      c.last_watched_at
        ? new Date(c.last_watched_at).toLocaleDateString('ru')
        : 'никогда',
    ]))

    rows.push([])
    rows.push(['СТАТИСТИКА УРОКОВ'])
    rows.push(['Название', 'Тип', 'Зрителей', 'Среднее %', 'Завершили'])
    sortedLessons.forEach(l => rows.push([
      esc(l.title), esc(l.lesson_type), l.viewers_count, l.avg_percent, l.completed_count,
    ]))

    const csv = '﻿' + rows.map(r => r.join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `analytics_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AdminLayout user={user}>

      {/* ── TOP BAR ── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900 flex-1">Аналитика</h1>

        <AppSelect
          value={filterGroup}
          onChange={e => setFilterGroup(e.target.value)}
        >
          <option value="">Все группы</option>
          {groups.map(g => <option key={g.id} value={g.id}>Группа {g.number}</option>)}
        </AppSelect>

        {data && (
          <button
            onClick={exportCsv}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition"
          >
            <Download size={14} />
            CSV
          </button>
        )}

        <button
          onClick={() => reload()}
          disabled={loading}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500 text-white text-sm font-medium hover:bg-rose-600 transition disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Обновить
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm">{error}</div>
      )}

      {/* ── METRICS HERO ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-200 rounded-2xl overflow-hidden mb-5 shadow-sm">
        <Metric
          label="Уроков"
          value={loading ? null : (summary?.total_lessons ?? 0)}
          color="rose"
        />
        <Metric
          label="Студентов"
          value={loading ? null : (summary?.total_clients_eligible ?? 0)}
          color="violet"
        />
        <Metric
          label="Среднее"
          value={loading ? null : (summary ? `${summary.avg_completion_percent}%` : '—')}
          color="emerald"
          big
        />
        <Metric
          label="Неактивны"
          value={loading ? null : (summary?.inactive ?? 0)}
          color="amber"
        />
      </div>

      {/* ── MAIN CONTENT: chart left | students right ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* CHART — 3/5 */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">Уроки</p>
              <p className="text-xs text-gray-400 mt-0.5">Кликни на урок — увидишь кто смотрел</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"/>≥75%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block"/>40–74%</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block"/>&lt;40%</span>
            </div>
          </div>

          {loading && (
            <div className="h-64 flex items-center justify-center text-gray-300 text-sm">Загрузка…</div>
          )}

          {!loading && chartData.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center text-gray-300">
              <Play size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Нет опубликованных уроков</p>
            </div>
          )}

          {!loading && chartData.length > 0 && (
            <>
              <div className="px-2 pb-2">
                <ResponsiveContainer width="100%" height={chartData.length * 46 + 24}>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 4, right: 48, left: 4, bottom: 0 }}
                    barCategoryGap="32%"
                  >
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tickCount={6}
                      tickFormatter={v => `${v}%`}
                      tick={{ fontSize: 11, fill: '#d1d5db' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={148}
                      tick={{ fontSize: 12, fill: '#6b7280' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: '#fdf2f8', rx: 8 }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div className="bg-white border border-gray-100 shadow-xl rounded-2xl px-4 py-3 text-xs min-w-[180px]">
                            <p className="font-semibold text-gray-800 mb-2 leading-snug text-[13px]">{d.fullName}</p>
                            <div className="space-y-1">
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-400">Среднее</span>
                                <span className="font-bold" style={{ color: barColor(d.avg) }}>{d.avg}%</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-400">Зрителей</span>
                                <span className="font-semibold text-gray-700">{d.viewers}</span>
                              </div>
                              <div className="flex justify-between gap-4">
                                <span className="text-gray-400">Завершили</span>
                                <span className="font-semibold text-gray-700">{d.completed}</span>
                              </div>
                            </div>
                            <p className="text-gray-300 mt-2 text-[11px]">← клик чтобы открыть</p>
                          </div>
                        )
                      }}
                    />
                    <Bar
                      dataKey="avg"
                      radius={[0, 8, 8, 0]}
                      maxBarSize={22}
                      style={{ cursor: 'pointer' }}
                      onClick={(data) => { if (data?.id) reload(data.id) }}
                    >
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={barColor(d.avg)} fillOpacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Chart pagination */}
              {chartTotalPages > 1 && (
                <div className="border-t border-gray-50 px-5 py-2.5 flex items-center justify-between">
                  <button
                    onClick={() => setChartPage(p => Math.max(1, p - 1))}
                    disabled={safeChartPage === 1}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition"
                  >
                    <ChevronLeft size={16} className="text-gray-500" />
                  </button>
                  <span className="text-xs text-gray-400 flex items-center gap-1.5">
                    <BarChart2 size={12} className="text-gray-300" />
                    {(safeChartPage - 1) * CHART_PAGE + 1}–{Math.min(safeChartPage * CHART_PAGE, sortedLessons.length)} из {sortedLessons.length} уроков
                  </span>
                  <button
                    onClick={() => setChartPage(p => Math.min(chartTotalPages, p + 1))}
                    disabled={safeChartPage === chartTotalPages}
                    className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition"
                  >
                    <ChevronRight size={16} className="text-gray-500" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* INACTIVE STUDENTS — 2/5 */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-gray-50 flex items-center justify-between shrink-0">
            <div>
              <p className="font-semibold text-gray-900 text-sm">Неактивные</p>
              <p className="text-xs text-gray-400">Не смотрели уроки 7+ дней</p>
            </div>
            <span className="text-2xl font-bold text-amber-500">
              {loading ? '—' : inactive.length}
            </span>
          </div>

          {!loading && inactive.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-gray-300">
              <CheckCircle2 size={36} className="mb-2 text-emerald-300" />
              <p className="text-sm text-gray-400">Все онлайн‑студенты активны</p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto divide-y divide-gray-50 min-h-0">
            {pagedInactive.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-bold text-xs shrink-0">
                  {(c.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {c.last_name} {c.first_name}
                  </p>
                  <p className="text-xs text-gray-400 truncate flex items-center gap-1">
                    <Phone size={9} />
                    {c.phone}
                    {c.group_name && <span>· {c.group_name}</span>}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {c.last_watched_at ? (
                    <span className="text-xs text-gray-400">
                      {new Date(c.last_watched_at).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-rose-400">никогда</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="border-t border-gray-50 px-4 py-2.5 flex items-center justify-between shrink-0">
              <button
                onClick={() => setInactivePage(p => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition"
              >
                <ChevronLeft size={16} className="text-gray-500" />
              </button>
              <span className="text-xs text-gray-400">
                {(safePage - 1) * PAGE + 1}–{Math.min(safePage * PAGE, inactive.length)} из {inactive.length}
              </span>
              <button
                onClick={() => setInactivePage(p => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition"
              >
                <ChevronRight size={16} className="text-gray-500" />
              </button>
            </div>
          )}
        </div>
      </div>

      {openLesson && (
        <LessonDetailModal lesson={openLesson} onClose={() => setOpenLesson(null)} />
      )}
    </AdminLayout>
  )
}

/* ── METRIC CARD ── */
function Metric({ label, value, color, big }) {
  const colors = {
    rose:    'bg-rose-50   text-rose-600',
    violet:  'bg-violet-50 text-violet-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber:   'bg-amber-50  text-amber-600',
  }
  return (
    <div className={`${colors[color]} px-5 py-5 flex flex-col gap-1`}>
      <span className="text-xs font-medium opacity-70 uppercase tracking-wide">{label}</span>
      {value === null ? (
        <div className="h-9 w-16 rounded-lg bg-current opacity-10 animate-pulse" />
      ) : (
        <span className={`font-black leading-none ${big ? 'text-4xl' : 'text-3xl'}`}>
          {value}
        </span>
      )}
    </div>
  )
}

/* ── LESSON DRILL-DOWN MODAL ── */
function LessonDetailModal({ lesson, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs text-gray-400">Урок</p>
            <h3 className="font-bold text-gray-900 leading-snug">{lesson.title}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {(lesson.viewers || []).length === 0 && (
            <div className="p-10 text-center text-gray-400">Этот урок ещё никто не открывал.</div>
          )}
          <div className="divide-y divide-gray-50">
            {(lesson.viewers || []).map(v => (
              <div key={v.client_id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-sm shrink-0">
                  {(v.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-800 truncate">{v.last_name} {v.first_name}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {v.phone}
                    {v.last_watched_at && ` · ${new Date(v.last_watched_at).toLocaleDateString('ru')}`}
                  </p>
                </div>
                <div className="shrink-0 w-24 text-right">
                  <div className="flex items-center justify-end gap-1 text-xs mb-1">
                    {v.is_completed && <CheckCircle2 size={11} className="text-emerald-500" />}
                    <span className="font-bold text-gray-700">{v.percent_watched}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${v.percent_watched}%`,
                        background: v.percent_watched >= 75 ? '#10b981' : v.percent_watched >= 40 ? '#f59e0b' : '#f43f5e',
                      }}
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
