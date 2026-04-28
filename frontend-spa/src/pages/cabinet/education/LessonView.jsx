import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ChevronLeft, AlertTriangle, Shield } from 'lucide-react'
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
    api.get(`/cabinet/education/lessons/${id}/`)
      .then(r => setLesson(r.data))
      .catch(e => {
        if (e.response?.status === 403) setError('Этот урок недоступен для вашей группы.')
        else setError(e.response?.data?.detail || 'Ошибка загрузки')
      })
  }, [id, nav])

  const handleProgress = ({ position, percent }) => {
    if (Math.abs(percent - lastSavedPercent.current) < 1) return
    lastSavedPercent.current = percent
    api.post(`/cabinet/education/lessons/${id}/progress/`, {
      position: Math.floor(position),
      percent,
    }).catch(() => {})
  }

  const watermarkText = lesson?.watermark?.text || ''
  const startAt = lesson?.progress?.last_position_sec || 0

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-rose-100 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/cabinet/lessons" className="p-2 rounded-lg hover:bg-rose-50">
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-lg font-semibold flex-1 truncate">
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
                  : <div className="p-6 rounded-2xl bg-white border text-gray-500">Аудио недоступно.</div>}
              </div>
            )}

            <div className="mt-6 bg-white rounded-2xl border border-rose-100 p-6 shadow-sm">
              <h2 className="text-xl font-bold mb-2">{lesson.title}</h2>
              {lesson.description && (
                <p className="text-gray-600 whitespace-pre-line">{lesson.description}</p>
              )}
              {(lesson.progress?.percent || 0) > 0 && (
                <div className="mt-4">
                  <div className="text-xs text-gray-500 mb-1">
                    Просмотрено: {lesson.progress.percent}%
                  </div>
                  <div className="h-2 rounded-full bg-rose-50 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-rose-400 to-pink-500 transition-all"
                      style={{ width: `${lesson.progress.percent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
