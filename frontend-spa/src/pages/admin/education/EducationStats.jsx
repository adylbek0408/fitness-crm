import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  BarChart3, Users, Activity, AlertCircle,
  CheckCircle2, Eye, X, Headphones, Play, Phone,
} from 'lucide-react'
import api from '../../../api/axios'
import AdminLayout from '../../../components/AdminLayout'

/**
 * Sprint 5.1 — Education analytics.
 *
 * Three views:
 *  - Summary cards (total lessons, eligible students, avg completion, inactive)
 *  - Lessons table (per-lesson viewers / avg % / completed)
 *  - Inactive students list (configurable threshold)
 *
 * Drill-down: click a lesson row → modal with viewer-by-viewer progress.
 */
export default function EducationStats() {
  const { user } = useOutletContext()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [groups, setGroups] = useState([])
  const [filterGroup, setFilterGroup] = useState('')
  const [inactiveDays, setInactiveDays] = useState(7)
  const [openLesson, setOpenLesson] = useState(null) // lesson detail modal

  const reload = (lessonId = null) => {
    setLoading(true); setError('')
    const p = new URLSearchParams()
    if (filterGroup) p.set('group', filterGroup)
    if (inactiveDays) p.set('inactive_days', inactiveDays)
    if (lessonId) p.set('lesson', lessonId)
    api.get(`/education/stats/?${p.toString()}`)
      .then(r => {
        setData(r.data)
        if (lessonId && r.data.lesson_detail) setOpenLesson(r.data.lesson_detail)
      })
      .catch(e => setError(e.response?.data?.detail || 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    api.get('/groups/').then(r => setGroups(r.data?.results || r.data || [])).catch(() => {})
  }, [])

  useEffect(() => { reload() }, [filterGroup, inactiveDays])

  const summary = data?.summary
  const lessons = data?.lessons || []
  const inactive = data?.inactive_clients || []

  const sortedLessons = useMemo(
    () => [...lessons].sort((a, b) => b.viewers_count - a.viewers_count),
    [lessons],
  )

  return (
    <AdminLayout user={user}>
      <div className="p-6 max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <BarChart3 /> Аналитика обучения
        </h1>

        {/* Filters */}
        <div className="bg-white rounded-2xl border p-4 mb-6 shadow-sm flex flex-wrap items-end gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Группа</label>
            <select
              value={filterGroup}
              onChange={e => setFilterGroup(e.target.value)}
              className="px-3 py-2 border rounded-lg min-w-[200px]"
            >
              <option value="">Все группы</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">
              Неактивны с (дней)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={inactiveDays}
              onChange={e => setInactiveDays(Number(e.target.value) || 7)}
              className="px-3 py-2 border rounded-lg w-32"
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 text-rose-700 text-sm mb-4">
            {error}
          </div>
        )}

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SummaryCard
              label="Всего уроков"
              value={summary.total_lessons}
              icon={Play}
              gradient="from-rose-100 to-pink-200"
              iconColor="text-rose-500"
            />
            <SummaryCard
              label="Студентов с доступом"
              value={summary.total_clients_eligible}
              icon={Users}
              gradient="from-pink-100 to-purple-100"
              iconColor="text-pink-500"
            />
            <SummaryCard
              label="Среднее % просмотра"
              value={`${summary.avg_completion_percent}%`}
              icon={Activity}
              gradient="from-emerald-100 to-teal-100"
              iconColor="text-emerald-600"
            />
            <SummaryCard
              label={`Неактивны ${summary.inactive_days}+ дн.`}
              value={summary.inactive}
              icon={AlertCircle}
              gradient="from-amber-100 to-orange-100"
              iconColor="text-amber-600"
            />
          </div>
        )}

        {/* Lessons table */}
        <div className="bg-white rounded-2xl border shadow-sm mb-6">
          <div className="p-4 border-b font-semibold flex items-center gap-2">
            <Eye size={18} /> Уроки и просмотры
          </div>
          {loading && !data && (
            <div className="p-6 text-center text-gray-400">Загрузка…</div>
          )}
          {!loading && sortedLessons.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              Нет опубликованных уроков по выбранным фильтрам.
            </div>
          )}
          <div className="divide-y">
            {sortedLessons.map(l => (
              <button
                key={l.id}
                onClick={() => reload(l.id)}
                className="w-full text-left flex items-center gap-4 p-4 hover:bg-rose-50/50 transition"
              >
                <div className="w-10 h-10 rounded-lg bg-rose-100 flex items-center justify-center text-rose-500 shrink-0">
                  {l.lesson_type === 'audio' ? <Headphones size={18} /> : <Play size={18} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.title}</div>
                  <div className="text-xs text-gray-500 truncate">
                    {l.lesson_type === 'audio' ? 'Аудио' : 'Видео'}
                    {l.groups.length > 0 && ` · ${l.groups.join(', ')}`}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-6 shrink-0">
                  <Stat label="Зрителей" value={l.viewers_count} />
                  <Stat label="Среднее %" value={`${l.avg_percent}%`} accent />
                  <Stat
                    label="Завершили"
                    value={l.completed_count}
                    icon={l.completed_count > 0 ? CheckCircle2 : null}
                  />
                </div>
                <div className="flex sm:hidden text-xs gap-3 text-gray-500">
                  <span>{l.viewers_count} зрит.</span>
                  <span>{l.avg_percent}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Inactive students */}
        <div className="bg-white rounded-2xl border shadow-sm">
          <div className="p-4 border-b font-semibold flex items-center gap-2">
            <AlertCircle size={18} className="text-amber-500" />
            Неактивные студенты ({inactive.length})
          </div>
          {!loading && inactive.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              Все студенты активны.
            </div>
          )}
          <div className="divide-y">
            {inactive.slice(0, 200).map(c => (
              <div key={c.id} className="flex items-center gap-3 p-3 hover:bg-gray-50">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 font-semibold text-sm shrink-0">
                  {(c.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {c.last_name} {c.first_name}
                  </div>
                  <div className="text-xs text-gray-500 truncate flex items-center gap-2">
                    <Phone size={11} /> {c.phone}
                    {c.group_name && ` · ${c.group_name}`}
                  </div>
                </div>
                <div className="text-xs text-right shrink-0">
                  {c.last_watched_at
                    ? <span className="text-gray-500">
                        {new Date(c.last_watched_at).toLocaleDateString('ru')}
                      </span>
                    : <span className="text-rose-500 font-medium">не смотрел</span>
                  }
                </div>
              </div>
            ))}
            {inactive.length > 200 && (
              <div className="p-3 text-center text-xs text-gray-500">
                Показаны первые 200 из {inactive.length}.
              </div>
            )}
          </div>
        </div>

        {openLesson && (
          <LessonDetailModal lesson={openLesson} onClose={() => setOpenLesson(null)} />
        )}
      </div>
    </AdminLayout>
  )
}

function SummaryCard({ label, value, icon: Icon, gradient, iconColor }) {
  return (
    <div className={`rounded-2xl p-4 border bg-gradient-to-br ${gradient} shadow-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-gray-600">{label}</div>
          <div className="text-2xl font-bold mt-1">{value}</div>
        </div>
        <Icon size={28} className={iconColor} />
      </div>
    </div>
  )
}

function Stat({ label, value, accent, icon: Icon }) {
  return (
    <div className="text-right">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-sm font-semibold flex items-center gap-1 justify-end ${
        accent ? 'text-rose-600' : 'text-gray-800'
      }`}>
        {Icon && <Icon size={14} className="text-emerald-500" />}
        {value}
      </div>
    </div>
  )
}

function LessonDetailModal({ lesson, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
      >
        <div className="p-4 border-b flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-gray-500">Урок</div>
            <h3 className="font-semibold truncate">{lesson.title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {lesson.viewers.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              Этот урок ещё никто не открывал.
            </div>
          )}
          <div className="divide-y">
            {lesson.viewers.map(v => (
              <div key={v.client_id} className="p-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-semibold text-sm shrink-0">
                  {(v.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">
                    {v.last_name} {v.first_name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {v.phone} ·{' '}
                    {new Date(v.last_watched_at).toLocaleDateString('ru')}
                  </div>
                </div>
                <div className="shrink-0 w-32">
                  <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
                    {v.is_completed && (
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    )}
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
