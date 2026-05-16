import { useEffect, useRef, useState } from 'react'
import { Play, Maximize2, Minimize2, Loader2 } from 'lucide-react'
import api from '../../../api/axios'
import VodPlayer from '../VodPlayer'
import LessonThumb from '../LessonThumb'

export default function FeedPostVideo({ lesson }) {
  const [phase, setPhase]           = useState('idle') // idle | loading | ready | error
  const [playbackUrl, setPlaybackUrl] = useState('')
  const [videoKind, setVideoKind]   = useState('hls')
  const [watermarkText, setWatermark] = useState('')
  const shellRef    = useRef(null)
  const [isCssFull, setIsCssFull]   = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const loadingRef  = useRef(false)
  const abortRef    = useRef(null)
  const lastSaved   = useRef(0)

  useEffect(() => () => { abortRef.current?.abort() }, [])

  useEffect(() => {
    const onFs = () => setIsFullscreen(
      document.fullscreenElement === shellRef.current ||
      document.webkitFullscreenElement === shellRef.current
    )
    document.addEventListener('fullscreenchange', onFs)
    document.addEventListener('webkitfullscreenchange', onFs)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      document.removeEventListener('webkitfullscreenchange', onFs)
    }
  }, [])

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && isCssFull) setIsCssFull(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isCssFull])

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
      setVideoKind(r.data.video_kind || 'hls')
      setWatermark(r.data.watermark?.text || '')
      setPhase('ready')
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'CanceledError') return
      setPhase('error')
    } finally { loadingRef.current = false }
  }

  const handleProgress = ({ position, percent }) => {
    if (Math.abs(percent - lastSaved.current) < 1) return
    lastSaved.current = percent
    api.post(`/cabinet/education/lessons/${lesson.id}/progress/`, {
      position: Math.floor(position), percent,
    }).catch(() => {})
  }

  const toggleFullscreen = async () => {
    const node = shellRef.current
    if (!node) return
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.())
        return
      }
      if (isCssFull) { setIsCssFull(false); return }
      try { await (node.requestFullscreen?.() ?? node.webkitRequestFullscreen?.()); return } catch {}
      setIsCssFull(true)
    } catch {}
  }

  // ── Idle / Loading: full-width thumbnail ──────────────────────────────────
  if (phase === 'idle' || phase === 'loading') {
    return (
      <div
        className="relative aspect-video bg-gray-900 cursor-pointer overflow-hidden"
        onClick={handlePlay}
      >
        <LessonThumb src={lesson.thumbnail_url || ''} title={lesson.title} lessonType="video" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          {phase === 'loading'
            ? <Loader2 size={40} className="text-white animate-spin drop-shadow-lg" />
            : (
              <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-xl active:scale-95 transition-transform">
                <Play size={24} className="text-rose-500 ml-1" />
              </div>
            )}
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return (
      <div className="mx-3 mb-2 p-3 rounded-xl bg-rose-50 text-rose-600 text-[13px] text-center">
        Не удалось загрузить видео.{' '}
        <button className="underline font-medium" onClick={() => setPhase('idle')}>
          Повторить
        </button>
      </div>
    )
  }

  // ── Ready: player ─────────────────────────────────────────────────────────
  return (
    <div
      ref={shellRef}
      data-protected-root
      className="relative aspect-video bg-black overflow-hidden"
      style={isCssFull
        ? { position: 'fixed', inset: 0, width: '100vw', height: '100dvh', zIndex: 100, aspectRatio: 'auto' }
        : {}}
    >
      <VodPlayer
        src={playbackUrl}
        kind={videoKind}
        poster={lesson.thumbnail_url || ''}
        startAt={lesson.progress?.last_position_sec || 0}
        watermarkText={watermarkText}
        onTimeUpdate={handleProgress}
        load="play"
        autoPlay
      />
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute top-2 right-2 z-20 rounded-xl bg-black/50 border border-white/10 text-white p-2 hover:bg-black/75 transition"
        aria-label="Полный экран"
      >
        {(isFullscreen || isCssFull) ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
      </button>
    </div>
  )
}
