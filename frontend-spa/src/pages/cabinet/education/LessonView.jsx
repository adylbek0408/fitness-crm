import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, AlertTriangle, Shield, Play, Headphones } from 'lucide-react'
import api from '../../../api/axios'
import HlsPlayer from '../../../components/education/HlsPlayer'
import AudioPlayer from '../../../components/education/AudioPlayer'
import Watermark from '../../../components/education/Watermark'
import useContentProtection from '../../../components/education/useContentProtection'

export default function LessonView() {
  const { id } = useParams()
  const nav = useNavigate()
  const [lesson, setLesson] = useState(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(true)
  const [lessons, setLessons] = useState([])
  const videoRef = useRef(null)
  const lastSavedPercent = useRef(0)

  useContentProtection({
    videoRef,
    onSuspect: kind => {
      const map = {
        shortcut: 'Запись/печать заблокирована.',
        devtools: 'Закройте инструменты разработчика для продолжения.',
      }
      setWarning(map[kind] || 'Подозрительная активность.')
      setTimeout(() => setWarning(''), 4000)
    },
  })

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) {
      nav('/cabinet'); return
    }
    setLoading(true)
    Promise.all([
      api.get(`/cabinet/education/lessons/${id}/`),
      api.get('/cabinet/education/lessons/').catch(() => null),
    ]).then(([lr, allR]) => {
      setLesson(lr.data)
      if (allR) setLessons(allR.data?.results || allR.data || [])
    }).catch(e => {
      if (e.response?.status === 403) setError('Этот урок недоступен для вашей группы.')
      else setError(e.response?.data?.detail || 'Ошибка загрузки')
    }).finally(() => setLoading(false))
  }, [id, nav])

  const handleProgress = ({ position, percent }) => {
    if (Math.abs(percent - lastSavedPercent.current) < 1) return
    lastSavedPercent.current = percent
    api.post(`/cabinet/education/lessons/${id}/progress/`, {
      position: Math.floor(position),
      percent,
    }).catch(() => {})
  }

  const currentIdx = lessons.findIndex(l => l.id === id)
  const prevLesson = currentIdx > 0 ? lessons[currentIdx - 1] : null
  const nextLesson = currentIdx !== -1 && currentIdx < lessons.length - 1 ? lessons[currentIdx + 1] : null

  const watermarkText = lesson?.watermark?.text || ''
  const startAt = lesson?.progress?.last_position_sec || 0

  if (loading) return (
    <div className="min-h-screen" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/cabinet/lessons" className="p-2 rounded-lg hover:bg-rose-50">
            <ChevronLeft size={22} />
          </Link>
          <div className="h-5 w-48 bg-rose-100 rounded animate-pulse" />
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <div className="aspect-video bg-rose-100 rounded-2xl animate-pulse" />
        <div className="bg-white rounded-2xl border border-rose-100 p-6 space-y-3">
          <div className="h-6 w-2/3 bg-rose-100 rounded animate-pulse" />
          <div className="h-4 w-full bg-rose-50 rounded animate-pulse" />
          <div className="h-4 w-4/5 bg-rose-50 rounded animate-pulse" />
        </div>
      </main>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/cabinet/lessons" className="p-2 rounded-lg hover:bg-rose-50">
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-lg font-semibold flex-1 truncate" style={{ color: '#1f1f1f' }}>
            {lesson?.title || 'Загрузка…'}
          </h1>
          <div className="flex items-center gap-1 text-xs text-rose-500">
            <Shield size={14} /> Защищено
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {error && (
          <div className="p-4 rounded-xl bg-rose-50 text-rose-700 mb-4">{error}</div>
        )}

        {warning && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-5 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm">
            <AlertTriangle size={16} /> {warning}
          </div>
        )}

        {lesson && (
          <>
            {lesson.lesson_type === 'video' ? (
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black shadow-lg">
                {lesson.playback_url ? (
                  <HlsPlayer
                    src={lesson.playback_url}
                    kind={lesson.video_kind || 'hls'}
                    onTimeUpdate={handleProgress}
                    onReady={v => { videoRef.current = v }}
                    startAt={startAt}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                    Видео ещё обрабатывается. Попробуйте позже.
                  </div>
                )}
                <Watermark text={watermarkText} />
              </div>
            ) : (
              <div className="relative">
                {lesson.playback_url
                  ? <AudioPlayer src={lesson.playback_url} startAt={startAt} onTimeUpdate={handleProgress} />
                  : <div className="p-6 rounded-2xl bg-white border border-rose-100 text-gray-500">Аудио недоступно.</div>}
              </div>
            )}

            {/* Progress bar */}
            {(lesson.progress?.percent || 0) > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Просмотрено</span>
                  <span className="font-medium text-rose-600">{lesson.progress.percent}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-rose-100 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-rose-400 to-pink-500 transition-all"
                    style={{ width: `${lesson.progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Lesson info */}
            <div className="mt-4 bg-white rounded-2xl border border-rose-100 p-6 shadow-sm">
              <h2 className="text-xl font-bold mb-2" style={{ color: '#1f1f1f' }}>{lesson.title}</h2>
              {lesson.description && (
                <p className="text-gray-600 whitespace-pre-line text-sm leading-relaxed">{lesson.description}</p>
              )}
            </div>

            {/* Prev / Next navigation */}
            {lessons.length > 1 && (
              <div className="mt-4 flex items-center gap-3">
                {prevLesson ? (
                  <Link
                    to={`/cabinet/lessons/${prevLesson.id}`}
                    className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white border border-rose-100 hover:border-rose-300 hover:shadow-sm transition flex-1 min-w-0"
                  >
                    <ChevronLeft size={18} className="text-rose-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Предыдущий</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{prevLesson.title}</p>
                    </div>
                  </Link>
                ) : <div className="flex-1" />}

                {nextLesson ? (
                  <Link
                    to={`/cabinet/lessons/${nextLesson.id}`}
                    className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-white border border-rose-100 hover:border-rose-300 hover:shadow-sm transition flex-1 min-w-0 text-right justify-end"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Следующий</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{nextLesson.title}</p>
                    </div>
                    <ChevronRight size={18} className="text-rose-400 shrink-0" />
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-rose-50 border border-rose-100 flex-1 min-w-0 text-right justify-end">
                    <div className="min-w-0">
                      <p className="text-[10px] text-rose-400 uppercase tracking-wider">Все уроки просмотрены</p>
                      <p className="text-sm font-medium text-rose-600">Так держать! 🎉</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
