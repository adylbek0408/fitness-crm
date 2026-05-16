import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Search, X, BookOpen } from 'lucide-react'
import api from '../../../api/axios'
import ChatBubble from '../../../components/education/feed/FeedPost'
import CabinetNav from '../../../components/CabinetNav'
import { pickList } from '../../../utils/format'

const BATCH = 20

const TABS = [
  { key: 'all',   label: 'Все'   },
  { key: 'video', label: 'Видео' },
  { key: 'audio', label: 'Аудио' },
  { key: 'text',  label: 'Текст' },
]

// ── Date helpers ──────────────────────────────────────────────────────────────
const RU_MONTHS = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек']

function dateLabel(dateStr) {
  if (!dateStr) return ''
  const d    = new Date(dateStr)
  const now  = new Date()
  const yest = new Date(now); yest.setDate(yest.getDate() - 1)
  if (d.toDateString() === now.toDateString())  return 'Сегодня'
  if (d.toDateString() === yest.toDateString()) return 'Вчера'
  const base = `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`
  return d.getFullYear() !== now.getFullYear() ? `${base} ${d.getFullYear()}` : base
}

function dateKey(dateStr) {
  return dateStr ? new Date(dateStr).toDateString() : 'unknown'
}

// ── Sub-components ────────────────────────────────────────────────────────────
function DateSeparator({ label }) {
  return (
    <div className="flex items-center justify-center my-3 select-none">
      <span
        className="px-3 py-1 rounded-full text-[11px] text-white font-medium"
        style={{ background: 'rgba(100,72,100,0.42)', backdropFilter: 'blur(6px)' }}
      >
        {label}
      </span>
    </div>
  )
}

function GroupAvatar({ group }) {
  const initials = group ? `Г${group.number}` : 'УК'
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-white text-[12px] font-bold"
      style={{ background: 'linear-gradient(135deg,#e11d48,#9f1239)' }}
    >
      {initials}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function LessonsFeed() {
  const [lessons, setLessons]   = useState([])
  const [group,   setGroup]     = useState(null)
  const [tab,     setTab]       = useState('all')
  const [search,  setSearch]    = useState('')
  const [visible, setVisible]   = useState(BATCH)
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState('')
  const sentinelRef = useRef(null)
  const nav = useNavigate()

  // Fetch student's group info for the header
  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) return
    api.get('/cabinet/me/').then(r => setGroup(r.data.current_group || null)).catch(() => {})
  }, [])

  // Fetch lessons — abort on tab change / unmount
  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) { nav('/cabinet'); return }
    setLoading(true); setError('')
    const ctrl   = new AbortController()
    const params = tab === 'all' ? '' : `?type=${tab}`
    api.get(`/cabinet/education/lessons/${params}`, { signal: ctrl.signal })
      .then(r => {
        // API returns newest-first; reverse so oldest is at top (course reading order)
        setLessons([...pickList(r.data)].reverse())
        setVisible(BATCH)
      })
      .catch(e => {
        if (e.name === 'AbortError' || e.name === 'CanceledError') return
        setError(e.response?.data?.detail || 'Ошибка загрузки')
      })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [tab, nav])

  // Reset pagination when filter/search changes
  useEffect(() => { setVisible(BATCH) }, [search, tab])

  // Client-side search
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return lessons
    return lessons.filter(l =>
      (l.title       || '').toLowerCase().includes(q) ||
      (l.description || '').toLowerCase().includes(q) ||
      (l.content     || '').toLowerCase().includes(q)
    )
  }, [lessons, search])

  // Build flat list with date separators inserted
  const feed = useMemo(() => {
    const slice  = filtered.slice(0, visible)
    const result = []
    let lastKey  = ''
    for (const lesson of slice) {
      const raw = lesson.published_at || lesson.created_at || ''
      const key = dateKey(raw)
      if (key !== lastKey) {
        result.push({ type: 'sep', id: `sep-${key}`, label: dateLabel(raw) })
        lastKey = key
      }
      result.push({ type: 'msg', lesson })
    }
    return result
  }, [filtered, visible])

  const hasMore = visible < filtered.length

  // Infinite scroll sentinel
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) setVisible(c => c + BATCH) },
      { rootMargin: '300px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, feed.length])

  // ── Header labels ─────────────────────────────────────────────────────────
  const groupTitle = group
    ? `Группа ${group.number}${group.group_type === 'online' ? ' · Онлайн' : group.group_type === 'offline' ? ' · Офлайн' : ''}`
    : 'Мои уроки'
  const trainerLine = group?.trainer || ''

  return (
    <div className="min-h-screen flex flex-col pb-16" style={{ background: '#e8dce8' }}>

      {/* ── TG-style sticky header ── */}
      <header className="bg-white sticky top-0 z-20" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.10)' }}>
        <div className="max-w-lg mx-auto px-2 pt-2 pb-1.5 flex items-center gap-2">
          <Link
            to="/cabinet/profile"
            className="p-2 rounded-full hover:bg-gray-100 text-gray-500 transition shrink-0"
            aria-label="Назад"
          >
            <ChevronLeft size={22} />
          </Link>

          <GroupAvatar group={group} />

          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-gray-900 truncate leading-tight">
              {groupTitle}
            </p>
            {trainerLine && (
              <p className="text-[11px] text-gray-400 truncate leading-tight">{trainerLine}</p>
            )}
          </div>

          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
            {filtered.length}
          </span>
        </div>

        {/* Search + type tabs */}
        <div className="max-w-lg mx-auto px-3 pb-2 space-y-1.5">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск по урокам…"
              className="w-full pl-8 pr-8 py-1.5 rounded-full border border-gray-200 bg-gray-50 text-[13px] focus:bg-white focus:outline-none focus:ring-1 focus:ring-rose-300 placeholder-gray-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                aria-label="Сбросить поиск"
              >
                <X size={13} />
              </button>
            )}
          </div>

          <div className="flex gap-1">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 py-1 rounded-full text-[11.5px] font-semibold transition ${
                  tab === t.key
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Chat feed area ── */}
      <main className="flex-1 w-full max-w-lg mx-auto px-2 py-3">

        {error && (
          <div className="mx-2 mb-3 p-3 rounded-2xl bg-white/80 text-rose-700 text-[13px] text-center shadow-sm">
            {error}
          </div>
        )}

        {/* Skeleton */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-end gap-1.5 pl-1">
                <div className="w-2 h-2 rounded-full bg-white/60 mb-1.5 shrink-0" />
                <div
                  className="bg-white animate-pulse p-4 space-y-2.5 shadow-sm"
                  style={{ maxWidth: '75%', minWidth: '160px', borderRadius: '4px 16px 16px 16px' }}
                >
                  <div className="h-2 bg-gray-100 rounded w-1/4" />
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                  <div className="h-2 bg-gray-100 rounded w-1/4 ml-auto" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-16 h-16 rounded-full bg-white/60 flex items-center justify-center mb-3 shadow-sm">
              <BookOpen size={28} className="text-rose-300" />
            </div>
            <p className="text-[14px] text-white/70 font-medium drop-shadow">
              {lessons.length === 0 ? 'Уроков пока нет.' : 'Ничего не найдено.'}
            </p>
          </div>
        )}

        {/* Messages */}
        {!loading && feed.length > 0 && (
          <div>
            {feed.map(item =>
              item.type === 'sep'
                ? <DateSeparator key={item.id} label={item.label} />
                : <ChatBubble key={item.lesson.id} lesson={item.lesson} />
            )}
          </div>
        )}

        {/* Sentinel for infinite scroll */}
        {hasMore && (
          <div ref={sentinelRef} className="h-10 flex items-center justify-center mt-2">
            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </main>

      <CabinetNav />
    </div>
  )
}
