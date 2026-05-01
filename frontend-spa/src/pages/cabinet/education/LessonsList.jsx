import { useEffect, useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  Play, Headphones, Clock, ChevronLeft, ChevronRight, CheckCircle2, Search,
} from 'lucide-react'
import api from '../../../api/axios'

const PAGE_SIZE = 12

function formatDuration(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function LessonsList() {
  const [lessons, setLessons] = useState([])
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) {
      nav('/cabinet'); return
    }
    setLoading(true); setError('')
    const params = tab === 'all' ? '' : `?type=${tab}`
    api.get(`/cabinet/education/lessons/${params}`)
      .then(r => setLessons(r.data?.results || r.data || []))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [tab, nav])

  const filtered = useMemo(() => {
    if (!search.trim()) return lessons
    const q = search.toLowerCase()
    return lessons.filter(l => (l.title || '').toLowerCase().includes(q))
  }, [lessons, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [tab, search])

  return (
    <div className="min-h-screen" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/cabinet/profile" className="p-2 rounded-lg hover:bg-rose-50">
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-xl font-semibold flex-1" style={{ color: '#1f1f1f' }}>
            Мои уроки
          </h1>
          <span className="text-xs text-gray-400">{filtered.length}</span>
        </div>
        <div className="max-w-5xl mx-auto px-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-2">
            {[
              { key: 'all', label: 'Все' },
              { key: 'video', label: 'Видео' },
              { key: 'audio', label: 'Аудио' },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                  tab === t.key
                    ? 'bg-rose-500 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Найти урок…"
              className="pl-8 pr-3 py-1.5 border border-rose-100 rounded-full text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-200 w-44 sm:w-56"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-rose-100 h-56 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <Play size={48} className="mx-auto mb-3 opacity-40" />
            <p>{lessons.length === 0 ? 'Уроков пока нет.' : 'Ничего не найдено.'}</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pageItems.map(l => (
                <Link
                  key={l.id}
                  to={`/cabinet/lessons/${l.id}`}
                  className="group rounded-2xl bg-white border border-rose-100 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
                >
                  <div className={`aspect-video relative flex items-center justify-center ${
                    l.lesson_type === 'audio'
                      ? 'bg-gradient-to-br from-purple-100 to-pink-200'
                      : 'bg-gradient-to-br from-rose-100 to-pink-200'
                  }`}>
                    {/* Fallback icon always rendered */}
                    {l.lesson_type === 'audio'
                      ? <Headphones size={48} className="text-purple-400 opacity-70" />
                      : <Play size={48} className="text-rose-400 opacity-70" />
                    }
                    {/* Thumbnail overlay */}
                    {l.thumbnail_url && l.lesson_type !== 'audio' && (
                      <img
                        src={l.thumbnail_url}
                        alt={l.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                    )}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs bg-black/60 text-white backdrop-blur">
                      {l.lesson_type === 'audio' ? 'Аудио' : 'Видео'}
                    </div>
                    {!!l.duration_sec && (
                      <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-xs bg-black/60 text-white">
                        <Clock size={12} className="inline mr-1" />
                        {formatDuration(l.duration_sec)}
                      </div>
                    )}
                    {l.progress?.is_completed && (
                      <div className="absolute top-2 right-2 text-emerald-400">
                        <CheckCircle2 size={22} fill="white" />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
                      {l.title}
                    </h3>
                    {l.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 mb-3">
                        {l.description}
                      </p>
                    )}
                    {(l.progress?.percent || 0) > 0 && (
                      <div className="h-1.5 bg-rose-50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-rose-400 to-pink-500"
                          style={{ width: `${l.progress.percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="p-2 rounded-lg bg-white border border-rose-100 text-gray-500 hover:bg-rose-50 disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm text-gray-600 px-3">
                  Страница <strong className="text-rose-600">{safePage}</strong> из {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="p-2 rounded-lg bg-white border border-rose-100 text-gray-500 hover:bg-rose-50 disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
