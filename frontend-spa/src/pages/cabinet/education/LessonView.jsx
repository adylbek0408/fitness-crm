import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import {
  ChevronLeft, ChevronRight, AlertTriangle, Shield, Play, Headphones, Maximize2, Minimize2,
} from 'lucide-react'
import api from '../../../api/axios'
import VodPlayer from '../../../components/education/VodPlayer'
import AudioPlayer from '../../../components/education/AudioPlayer'
import useContentProtection from '../../../components/education/useContentProtection'

export default function LessonView() {
  const { id } = useParams()
  const nav = useNavigate()
  const location = useLocation()
  const [lesson, setLesson] = useState(null)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(true)
  const videoRef = useRef(null)
  const playerShellRef = useRef(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isCssFull,    setIsCssFull]    = useState(false)
  const lastSavedPercent = useRef(0)
  const warningTimerRef  = useRef(null)

  const showWarning = (msg, ms = 4000) => {
    clearTimeout(warningTimerRef.current)
    setWarning(msg)
    warningTimerRef.current = setTimeout(() => setWarning(''), ms)
  }

  useContentProtection({
    videoRef,
    rootRef: playerShellRef,
    onSuspect: kind => {
      const map = {
        shortcut: 'Запись/печать заблокирована.',
        devtools: 'Закройте инструменты разработчика для продолжения.',
      }
      showWarning(map[kind] || 'Подозрительная активность.')
    },
  })

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) {
      nav('/cabinet'); return
    }
    lastSavedPercent.current = 0
    setLoading(true)
    const ctrl = new AbortController()
    api.get(`/cabinet/education/lessons/${id}/`, { signal: ctrl.signal })
    .then(lr => {
      setLesson(lr.data)
      // Text lessons: opening the lesson = reading it → mark complete immediately
      if (lr.data.lesson_type === 'text') {
        api.post(`/cabinet/education/lessons/${id}/progress/`, { position: 0, percent: 100 }).catch(() => {})
      }
    }).catch(e => {
      if (e.name === 'CanceledError' || e.name === 'AbortError') return
      if (e.response?.status === 403) setError('Этот урок недоступен для вашей группы.')
      else setError(e.response?.data?.detail || 'Ошибка загрузки')
    }).finally(() => setLoading(false))
    return () => { ctrl.abort(); clearTimeout(warningTimerRef.current) }
  }, [id, nav])

  useEffect(() => {
    const onFullscreenChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement
      setIsFullscreen(fsEl === playerShellRef.current)
    }
    document.addEventListener('fullscreenchange',       onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    return () => {
      document.removeEventListener('fullscreenchange',       onFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isCssFull) setIsCssFull(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isCssFull])

  const toggleFullscreen = async () => {
    const node = playerShellRef.current
    if (!node) return
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen()
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
        return
      }
      if (isCssFull) { setIsCssFull(false); return }
      if (node.requestFullscreen) { try { await node.requestFullscreen(); return } catch {} }
      if (node.webkitRequestFullscreen) { try { node.webkitRequestFullscreen(); return } catch {} }
      // iOS Safari: CSS fake fullscreen keeps watermark visible
      setIsCssFull(true)
    } catch {}
  }

  const handleProgress = ({ position, percent }) => {
    if (Math.abs(percent - lastSavedPercent.current) < 1) return
    lastSavedPercent.current = percent
    api.post(`/cabinet/education/lessons/${id}/progress/`, {
      position: Math.floor(position),
      percent,
    }).catch(() => {})
  }

  const prevId = lesson?.prev_id || null
  const nextId = lesson?.next_id || null

  const watermarkText = lesson?.watermark?.text || ''
  const startAt = lesson?.progress?.last_position_sec || 0

  if (loading) return (
    <div className="min-h-screen" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => location.key !== 'default' ? nav(-1) : nav('/cabinet/lessons')} className="p-2 rounded-lg hover:bg-rose-50">
            <ChevronLeft size={22} />
          </button>
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
          <button onClick={() => location.key !== 'default' ? nav(-1) : nav('/cabinet/lessons')} className="p-2 rounded-lg hover:bg-rose-50">
            <ChevronLeft size={22} />
          </button>
          <h1 className="text-lg font-semibold flex-1 truncate" style={{ color: '#1f1f1f' }}>
            {lesson?.title || 'Загрузка…'}
          </h1>
          <div className="flex items-center gap-1 text-xs text-rose-500">
            <Shield size={14} /> Защищено
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
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
            {lesson.lesson_type === 'text' ? (
              <div className="bg-white rounded-2xl border border-rose-100 p-5 sm:p-8 shadow-sm">
                <div className="text-gray-800 whitespace-pre-wrap leading-relaxed text-[14px] sm:text-[15px]">
                  {lesson.content || <span className="text-gray-400 italic">Текст урока отсутствует.</span>}
                </div>
              </div>
            ) : lesson.lesson_type === 'video' ? (
              <div
                ref={playerShellRef}
                data-protected-root
                className="relative aspect-video rounded-2xl overflow-hidden bg-black shadow-lg border border-gray-900"
                style={{
                  ...(isCssFull ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', zIndex: 100, aspectRatio: 'auto', borderRadius: 0 } : {}),
                  userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
                }}
              >
                {lesson.playback_url ? (
                  <>
                    <VodPlayer
                      src={lesson.playback_url}
                      kind={lesson.video_kind || 'hls'}
                      onTimeUpdate={handleProgress}
                      onReady={v => { videoRef.current = v }}
                      startAt={startAt}
                      poster={lesson.thumbnail_url || ''}
                      watermarkText={watermarkText}
                    />
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                    Видео ещё обрабатывается. Попробуйте позже.
                  </div>
                )}
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className="absolute top-3 right-3 z-20 rounded-xl bg-black/50 border border-white/10 text-white p-2.5 hover:bg-black/75 transition"
                  aria-label={(isFullscreen || isCssFull) ? 'Выйти из полноэкранного режима' : 'Открыть на весь экран'}
                  title={(isFullscreen || isCssFull) ? 'Выйти из полноэкранного режима' : 'Открыть на весь экран'}
                >
                  {(isFullscreen || isCssFull) ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            ) : (
              <div
                ref={playerShellRef}
                data-protected-root
                className="relative"
              >
                {lesson.playback_url
                  ? <AudioPlayer src={lesson.playback_url} startAt={startAt} onTimeUpdate={handleProgress} />
                  : <div className="p-6 rounded-2xl bg-white border border-rose-100 text-gray-500">
                      {lesson.lesson_type === 'audio' ? 'Аудио недоступно.' : null}
                    </div>}
                {lesson.playback_url && (
                  <button
                    type="button"
                    onClick={toggleFullscreen}
                    className="absolute top-3 right-3 z-20 rounded-xl bg-black/50 border border-white/10 text-white p-2.5 hover:bg-black/75 transition"
                    aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть на весь экран'}
                    title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть на весь экран'}
                  >
                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                )}
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
            <div className="mt-4 bg-white rounded-2xl border border-rose-100 p-4 sm:p-6 shadow-sm">
              <h2 className="text-lg sm:text-xl font-bold mb-2" style={{ color: '#1f1f1f' }}>{lesson.title}</h2>
              {lesson.description && (
                <p className="text-gray-600 whitespace-pre-line text-sm leading-relaxed">{lesson.description}</p>
              )}
            </div>

            {/* Prev / Next navigation */}
            {(prevId || nextId) && (
              <div className="mt-4 grid grid-cols-2 gap-2 sm:gap-3">
                {prevId ? (
                  <Link
                    to={`/cabinet/lessons/${prevId}`}
                    className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl bg-white border border-rose-100 hover:border-rose-300 hover:shadow-sm transition min-w-0"
                  >
                    <ChevronLeft size={18} className="text-rose-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Предыдущий</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{lesson?.prev_title}</p>
                    </div>
                  </Link>
                ) : <div />}

                {nextId ? (
                  <Link
                    to={`/cabinet/lessons/${nextId}`}
                    className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl bg-white border border-rose-100 hover:border-rose-300 hover:shadow-sm transition min-w-0 text-right justify-end"
                  >
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider">Следующий</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{lesson?.next_title}</p>
                    </div>
                    <ChevronRight size={18} className="text-rose-400 shrink-0" />
                  </Link>
                ) : <div />}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
