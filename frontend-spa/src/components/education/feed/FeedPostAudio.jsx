import { useEffect, useRef, useState } from 'react'
import { Play, Loader2 } from 'lucide-react'
import api from '../../../api/axios'
import AudioPlayer from '../AudioPlayer'

export default function FeedPostAudio({ lesson }) {
  const [phase, setPhase] = useState('idle') // idle | loading | ready | error
  const [playbackUrl, setPlaybackUrl] = useState('')
  const [startAt, setStartAt] = useState(0)
  // Prevents double-tap from firing two concurrent API calls
  const loadingRef = useRef(false)
  const abortRef = useRef(null)
  const lastSavedPercent = useRef(0)

  const handleProgress = ({ position, percent }) => {
    if (Math.abs(percent - lastSavedPercent.current) < 1) return
    lastSavedPercent.current = percent
    api.post(`/cabinet/education/lessons/${lesson.id}/progress/`, {
      position: Math.floor(position),
      percent,
    }).catch(() => {})
  }

  // Clean up in-flight request on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  const handlePlay = async () => {
    if (loadingRef.current || phase !== 'idle') return
    loadingRef.current = true
    setPhase('loading')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const r = await api.get(`/cabinet/education/lessons/${lesson.id}/`, { signal: ctrl.signal })
      if (!r.data.playback_url) { setPhase('error'); return }
      setPlaybackUrl(r.data.playback_url)
      setStartAt(r.data.progress?.last_position_sec || 0)
      setPhase('ready')
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'CanceledError') return
      setPhase('error')
    } finally {
      loadingRef.current = false
    }
  }

  if (phase === 'ready') {
    return (
      <div className="px-4 pb-4">
        <AudioPlayer src={playbackUrl} startAt={startAt} onTimeUpdate={handleProgress} />
      </div>
    )
  }

  return (
    <div className="px-4 pb-4">
      <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-100 p-6 flex flex-col items-center gap-3">
        {phase === 'error' ? (
          <>
            <p className="text-[13px] text-red-500">Не удалось загрузить аудио.</p>
            <button
              onClick={() => setPhase('idle')}
              className="text-[12px] text-amber-600 underline"
            >
              Попробовать снова
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handlePlay}
              disabled={phase === 'loading'}
              className="w-16 h-16 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-lg hover:bg-amber-600 active:scale-95 transition disabled:opacity-60"
            >
              {phase === 'loading'
                ? <Loader2 size={26} className="animate-spin" />
                : <Play size={28} className="ml-1" />}
            </button>
            <p className="text-[12px] text-gray-400">
              {phase === 'loading' ? 'Загрузка…' : 'Нажмите для воспроизведения'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
