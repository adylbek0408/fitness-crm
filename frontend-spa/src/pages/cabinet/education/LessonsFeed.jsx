import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { BookOpen, ChevronLeft, Search, X } from 'lucide-react'
import api from '../../../api/axios'
import FeedPost from '../../../components/education/feed/FeedPost'
import CabinetNav from '../../../components/CabinetNav'
import { pickList } from '../../../utils/format'

const BATCH = 10

const TABS = [
  { key: 'all',   label: 'Все' },
  { key: 'video', label: 'Видео' },
  { key: 'audio', label: 'Аудио' },
  { key: 'text',  label: 'Текст' },
]

export default function LessonsFeed() {
  const [lessons, setLessons] = useState([])
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [visibleCount, setVisibleCount] = useState(BATCH)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const sentinelRef = useRef(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) {
      nav('/cabinet'); return
    }
    setLoading(true); setError('')
    const ctrl = new AbortController()
    const params = tab === 'all' ? '' : `?type=${tab}`
    api.get(`/cabinet/education/lessons/${params}`, { signal: ctrl.signal })
      .then(r => { setLessons(pickList(r.data)); setVisibleCount(BATCH) })
      .catch(e => {
        if (e.name === 'AbortError' || e.name === 'CanceledError') return
        setError(e.response?.data?.detail || 'Ошибка загрузки')
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [tab, nav])

  useEffect(() => { setVisibleCount(BATCH) }, [search, tab])

  const filtered = useMemo(() => {
    if (!search.trim()) return lessons
    const q = search.toLowerCase()
    return lessons.filter(l =>
      (l.title || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q) ||
      (l.content || '').toLowerCase().includes(q)
    )
  }, [lessons, search])

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length

  // Sentinel for loading more items
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisibleCount(c => c + BATCH) },
      { rootMargin: '200px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, visible.length])

  return (
    <div className="min-h-screen pb-20" style={{ background: '#fdf8fa' }}>
      {/* Header */}
      <header className="bg-white border-b border-rose-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 pt-3 pb-2 flex items-center gap-2">
          <Link to="/cabinet/profile" className="p-2 rounded-xl hover:bg-rose-50 text-gray-500" aria-label="Назад">
            <ChevronLeft size={20} />
          </Link>
          <h1 className="text-[17px] font-semibold flex-1">Мои уроки</h1>
          <span className="text-[11px] text-gray-400 px-1.5 py-0.5 rounded bg-rose-50">{filtered.length}</span>
        </div>

        <div className="max-w-lg mx-auto px-4 pb-3 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Найти урок…"
              className="w-full pl-9 pr-8 py-2 border border-rose-100 rounded-xl text-[13px] bg-rose-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 placeholder-gray-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600"
                aria-label="Очистить поиск"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex gap-1.5">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-1.5 rounded-full text-[12.5px] font-medium transition ${
                  tab === t.key
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-600 active:bg-rose-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto">
        {error && (
          <div className="m-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-[13px]">{error}</div>
        )}

        {loading && (
          <div className="space-y-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white border-b border-gray-100 p-4 space-y-3 animate-pulse">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-rose-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 bg-rose-100 rounded w-3/4" />
                    <div className="h-3 bg-rose-50 rounded w-1/3" />
                  </div>
                </div>
                <div className="h-32 bg-rose-50 rounded-xl" />
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <BookOpen size={44} className="mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">{lessons.length === 0 ? 'Уроков пока нет.' : 'Ничего не найдено.'}</p>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="bg-white shadow-sm rounded-none sm:rounded-2xl sm:my-4 sm:mx-4 overflow-hidden border border-gray-100">
            {visible.map(lesson => (
              <FeedPost key={lesson.id} lesson={lesson} />
            ))}
          </div>
        )}

        {hasMore && (
          <div ref={sentinelRef} className="h-12 flex items-center justify-center">
            <span className="w-5 h-5 border-2 border-rose-200 border-t-rose-500 rounded-full animate-spin" />
          </div>
        )}
      </main>

      <CabinetNav />
    </div>
  )
}
