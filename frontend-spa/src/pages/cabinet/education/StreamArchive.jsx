import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Radio, Play, Clock, CheckCircle2 } from 'lucide-react'
import api from '../../../api/axios'

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
        <div className="max-w-md sm:max-w-3xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2">
          <Link to="/cabinet/profile" className="p-2 rounded-xl hover:bg-rose-50 active:bg-rose-100" aria-label="Назад">
            <ChevronLeft size={20} />
          </Link>
          <Radio size={18} className="text-rose-500" aria-hidden />
          <h1 className="text-[17px] font-semibold flex-1">Записи эфиров</h1>
          {!loading && (
            <span className="text-[11px] text-gray-400 px-1.5 py-0.5 rounded bg-rose-50">{lessons.length}</span>
          )}
        </div>
      </header>

      <main className="max-w-md sm:max-w-3xl mx-auto px-3 sm:px-4 py-4">
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 text-rose-700 text-[13px]">
            {error}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-white border border-rose-100 h-40 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && lessons.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <Radio size={42} className="mx-auto mb-3 opacity-40" />
            <p className="font-medium text-[14px]">Записей пока нет.</p>
            <p className="text-[12px] mt-1 opacity-70">
              Они появятся после завершения эфира.
            </p>
          </div>
        )}

        {!loading && lessons.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {lessons.map(l => (
              <Link
                key={l.id}
                to={`/cabinet/lessons/${l.id}`}
                className="group rounded-2xl bg-white border border-rose-100 overflow-hidden shadow-sm active:scale-[0.99] hover:shadow-md transition"
              >
                <div className="aspect-video bg-gradient-to-br from-rose-100 to-pink-200 relative flex items-center justify-center">
                  <Play size={42} className="text-rose-400 opacity-70" aria-hidden />
                  {l.thumbnail_url && (
                    <img
                      src={l.thumbnail_url}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                      onError={e => { e.currentTarget.style.display = 'none' }}
                    />
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-medium bg-rose-500 text-white shadow flex items-center gap-1">
                    <Radio size={10} /> Запись эфира
                  </div>
                  {!!l.duration_sec && (
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md text-[10.5px] bg-black/60 text-white">
                      <Clock size={11} className="inline mr-1" />
                      {formatDuration(l.duration_sec)}
                    </div>
                  )}
                  {l.progress?.is_completed && (
                    <div className="absolute top-2 right-2 text-emerald-400">
                      <CheckCircle2 size={20} fill="white" />
                    </div>
                  )}
                </div>
                <div className="p-3.5">
                  <h3 className="font-semibold text-[14px] text-gray-900 line-clamp-2 leading-snug">
                    {l.title}
                  </h3>
                  {l.description && (
                    <p className="text-[12px] text-gray-500 line-clamp-2 mt-1">
                      {l.description}
                    </p>
                  )}
                  {(l.progress?.percent || 0) > 0 && (
                    <div className="mt-2.5 h-1 bg-rose-50 rounded-full overflow-hidden">
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
        )}
      </main>
    </div>
  )
}
