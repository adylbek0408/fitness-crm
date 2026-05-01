import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Radio, Play, Clock, CheckCircle2 } from 'lucide-react'
import api from '../../../api/axios'

/**
 * Sprint 3.6 — Записи прошедших эфиров.
 *
 * Cloudflare Stream автоматически записывает каждый эфир,
 * webhook `live_input.recording.ready` создаёт архивный Lesson.
 * Здесь они отдельной лентой, чтобы студент быстро находил их.
 */
function formatDuration(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function StreamArchive() {
  const [lessons, setLessons] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) {
      nav('/cabinet'); return
    }
    setLoading(true); setError('')
    api.get('/cabinet/education/lessons/?source=stream')
      .then(r => setLessons(r.data?.results || r.data || []))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка загрузки'))
      .finally(() => setLoading(false))
  }, [nav])

  return (
    <div className="min-h-screen" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/cabinet/profile" className="p-2 rounded-lg hover:bg-rose-50">
            <ChevronLeft size={22} />
          </Link>
          <Radio size={22} className="text-rose-500" />
          <h1 className="text-xl font-semibold" style={{ color: '#1f1f1f' }}>
            Записи эфиров
          </h1>
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

        {!loading && lessons.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <Radio size={48} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium">Записей пока нет.</p>
            <p className="text-xs mt-1 opacity-70">
              Записи появятся здесь после завершения эфира.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lessons.map(l => (
            <Link
              key={l.id}
              to={`/cabinet/lessons/${l.id}`}
              className="group rounded-2xl bg-white border border-rose-100 overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-0.5 transition"
            >
              <div className="aspect-video bg-gradient-to-br from-rose-100 to-pink-200 relative flex items-center justify-center">
                {/* Fallback icon */}
                <Play size={48} className="text-rose-400 opacity-70" />
                {/* Thumbnail overlay */}
                {l.thumbnail_url && (
                  <img
                    src={l.thumbnail_url}
                    alt={l.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={e => { e.currentTarget.style.display = 'none' }}
                  />
                )}
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs bg-rose-500 text-white shadow flex items-center gap-1">
                  <Radio size={11} /> Запись эфира
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
      </main>
    </div>
  )
}
