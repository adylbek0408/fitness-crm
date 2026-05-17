import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Loader2 } from 'lucide-react'
import api from '../../../api/axios'
import AudioPlayer from '../AudioPlayer'

// Decorative waveform bar heights (static — purely cosmetic, like TG voice messages)
const WAVE = [3, 6, 10, 14, 18, 12, 16, 8, 14, 18, 16, 10, 14, 18, 12, 8, 14, 10, 6, 4]

export default function FeedPostAudio({ lesson }) {
  const [phase, setPhase]         = useState('idle') // idle | loading | ready | error
  const [playbackUrl, setUrl]     = useState('')
  const [startAt, setStartAt]     = useState(0)
  const loadingRef = useRef(false)
  const abortRef   = useRef(null)
  const lastSaved  = useRef(0)

  useEffect(() => () => { abortRef.current?.abort() }, [])

  const handleProgress = ({ position, percent }) => {
    if (Math.abs(percent - lastSaved.current) < 1) return
    lastSaved.current = percent
    api.post(`/cabinet/education/lessons/${lesson.id}/progress/`, {
      position: Math.floor(position), percent,
    }).catch(() => {})
  }

  const handlePlay = async () => {
    if (loadingRef.current || phase !== 'idle') return
    loadingRef.current = true
    setPhase('loading')
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const r = await api.get(`/cabinet/education/lessons/${lesson.id}/`, { signal: ctrl.signal })
      if (!r.data.playback_url) { setPhase('error'); return }
      setUrl(r.data.playback_url)
      setStartAt(r.data.progress?.last_position_sec || 0)
      setPhase('ready')
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'CanceledError') return
      setPhase('error')
    } finally { loadingRef.current = false }
  }

  // ── Ready: AudioPlayer ────────────────────────────────────────────────────
  if (phase === 'ready') {
    return (
      <div className="mx-3.5 mb-2 rounded-xl overflow-hidden">
        <AudioPlayer
          src={playbackUrl}
          startAt={startAt}
          onTimeUpdate={handleProgress}
          onError={() => setPhase('idle')}
        />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="mx-3.5 mb-2 p-3 rounded-xl bg-amber-50 text-amber-700 text-[13px] text-center">
        Не удалось загрузить аудио.{' '}
        <button className="underline font-medium" onClick={() => setPhase('idle')}>Повторить</button>
      </div>
    )
  }

  // ── Idle / Loading: TG voice-message style ────────────────────────────────
  return (
    <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-2">
      {/* Play / Spinner button */}
      <button
        onClick={handlePlay}
        disabled={phase === 'loading'}
        className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white shadow transition active:scale-95 disabled:opacity-70"
        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}
        aria-label="Слушать аудиоурок"
      >
        {phase === 'loading'
          ? <Loader2 size={20} className="animate-spin" />
          : <Play size={20} className="ml-0.5" />}
      </button>

      {/* Waveform bars */}
      <div className="flex items-center gap-px flex-1 h-9">
        {WAVE.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${h}px`,
              background: phase === 'loading'
                ? 'rgba(217,119,6,0.35)'
                : 'rgba(161,117,26,0.25)',
              transition: 'background 0.3s',
            }}
          />
        ))}
      </div>

      {/* Duration */}
      {lesson.duration_sec > 0 && (
        <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">
          {Math.floor(lesson.duration_sec / 60)}:{String(Math.floor(lesson.duration_sec % 60)).padStart(2, '0')}
        </span>
      )}
    </div>
  )
}
