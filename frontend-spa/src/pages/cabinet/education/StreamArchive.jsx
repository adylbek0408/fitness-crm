import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Radio, Clock, CheckCircle2, Play } from 'lucide-react'
import api from '../../../api/axios'
import LessonThumb from '../../../components/education/LessonThumb'

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

  const completed = lessons.filter(l => l.progress?.is_completed).length
  const totalMins = Math.round(lessons.reduce((s, l) => s + (l.duration_sec || 0), 0) / 60)

  return (
    <div className="min-h-screen" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-md sm:max-w-3xl mx-auto px-3 sm:px-4 py-3 flex items-center gap-2">
          <Link to="/cabinet/profile" className="p-2 rounded-xl hover:bg-rose-50 active:bg-rose-100" aria-label="Назад">
            <ChevronLeft size={20} />
          </Link>
          <Radio size={18} className="text-rose-500" aria-hidden />
          <div className="flex-1 min-w-0">
            <h1 className="text-[17px] font-semibold leading-tight">Записи эфиров</h1>
            {!loading && lessons.length > 0 && (
              <p className="text-[11px] text-gray-400 leading-tight">
                {completed > 0 ? `${completed} из ${lessons.length} просмотрено` : `${lessons.length} записей`}
                {totalMins > 0 && ` · ${totalMins} мин`}
              </p>
            )}
          </div>
          {!loading && lessons.length > 0 && (
            <span className="text-[11px] text-gray-400 px-1.5 py-0.5 rounded bg-rose-50 shrink-0">{lessons.length}</span>
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
              <div key={i} className="rounded-2xl bg-white border border-rose-100 h-52 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && lessons.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center mx-auto mb-4">
              <Radio size={28} className="text-rose-300" />
            </div>
            <p className="font-semibold text-gray-700 text-[15px]">Записей пока нет</p>
            <p className="text-[13px] text-gray-400 mt-1">
              Они появятся после завершения эфира.
            </p>
          </div>
        )}

        {!loading && lessons.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {lessons.map(l => {
              const pct = l.progress?.percent || 0
              const done = l.progress?.is_completed

              return (
                <Link
                  key={l.id}
                  to={`/cabinet/lessons/${l.id}`}
                  className={`group rounded-2xl bg-white overflow-hidden shadow-sm hover:shadow-lg active:scale-[0.99] transition border ${done ? 'border-emerald-200' : 'border-rose-100'}`}
                >
                  {/* Thumbnail with progress bar overlay */}
                  <div className="aspect-video relative">
                    <LessonThumb
                      src={l.thumbnail_url || ''}
                      title={l.title}
                      lessonType="video"
                    />

                    {/* Dim overlay for completed */}
                    {done && (
                      <div className="absolute inset-0 bg-black/20" />
                    )}

                    {/* Top-left badge */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-rose-500 text-white shadow flex items-center gap-1">
                      <Radio size={9} /> Эфир
                    </div>

                    {/* Duration — top-right */}
                    {!!l.duration_sec && (
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md text-[10.5px] bg-black/60 text-white font-medium">
                        {formatDuration(l.duration_sec)}
                      </div>
                    )}

                    {/* Completed checkmark */}
                    {done && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center">
                          <CheckCircle2 size={22} className="text-emerald-400" fill="rgba(52,211,153,0.25)" />
                        </div>
                      </div>
                    )}

                    {/* YouTube-style progress bar on thumbnail */}
                    {pct > 0 && !done && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                        <div
                          className="h-full bg-rose-500 rounded-r-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    {done && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-emerald-400" />
                    )}
                  </div>

                  {/* Card body */}
                  <div className="p-3 sm:p-3.5">
                    <h3 className="font-semibold text-[14px] text-gray-900 line-clamp-2 leading-snug mb-2">
                      {l.title}
                    </h3>

                    {/* CTA pill */}
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                        done
                          ? 'bg-emerald-50 text-emerald-600'
                          : pct > 0
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-gray-50 text-gray-500'
                      }`}>
                        {done
                          ? <><CheckCircle2 size={11} /> Просмотрено</>
                          : pct > 0
                            ? <><Play size={10} fill="currentColor" /> Продолжить · {pct}%</>
                            : <><Play size={10} fill="currentColor" /> Смотреть</>
                        }
                      </span>
                      {!!l.duration_sec && (
                        <span className="text-[11px] text-gray-400 flex items-center gap-1">
                          <Clock size={10} />
                          {formatDuration(l.duration_sec)}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
