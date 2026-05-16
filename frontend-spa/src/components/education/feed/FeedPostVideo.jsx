import { useEffect, useRef, useState } from 'react'
import { Play, Maximize2, Minimize2, Loader2 } from 'lucide-react'
import api from '../../../api/axios'
import VodPlayer from '../VodPlayer'
import LessonThumb from '../LessonThumb'

export default function FeedPostVideo({ lesson }) {
  const [phase, setPhase] = useState('idle') // idle | loading | ready | error
  const [playbackUrl, setPlaybackUrl] = useState('')
  const [videoKind, setVideoKind] = useState('hls')
  const [watermarkText, setWatermarkText] = useState('')
  const shellRef = useRef(null)
  const [isCssFull, setIsCssFull] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  // Prevents double-tap from firing two concurrent API calls
  const loadingRef = useRef(false)
  const abortRef = useRef(null)

  // Clean up in-flight request on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  useEffect(() => {
    const onFsChange = () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement
      setIsFullscreen(fsEl === shellRef.current)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && isCssFull) setIsCssFull(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isCssFull])

  const lastSavedPercent = useRef(0)

  const handleProgress = ({ position, percent }) => {
    if (Math.abs(percent - lastSavedPercent.current) < 1) return
    lastSavedPercent.current = percent
    api.post(`/cabinet/education/lessons/${lesson.id}/progress/`, {
      position: Math.floor(position),
      percent,
    }).catch(() => {})
  }

  const handlePlay = async () => {
    // useRef guard prevents double-tap from firing two concurrent fetches
    // (state check alone is unreliable before React commits the update)
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
      setWatermarkText(r.data.watermark?.text || '')
      setPhase('ready')
    } catch (e) {
      if (e.name === 'AbortError' || e.name === 'CanceledError') return
      setPhase('error')
    } finally {
      loadingRef.current = false
    }
  }

  const toggleFullscreen = async () => {
    const node = shellRef.current
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
      setIsCssFull(true)
    } catch {}
  }

  if (phase === 'idle' || phase === 'loading') {
    return (
      <div className="pb-4">
        <div
          className="relative aspect-video bg-gray-900 overflow-hidden cursor-pointer"
          onClick={handlePlay}
        >
          <LessonThumb src={lesson.thumbnail_url || ''} title={lesson.title} lessonType="video" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            {phase === 'loading' ? (
              <Loader2 size={44} className="text-white animate-spin drop-shadow" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-xl active:scale-95 transition">
                <Play size={28} className="text-rose-500 ml-1" />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="mx-4 mb-4 p-4 rounded-2xl bg-rose-50 text-rose-600 text-[13px] text-center">
        Не удалось загрузить видео.{' '}
        <button className="underline" onClick={() => { setPhase('idle') }}>
          Попробовать снова
        </button>
      </div>
    )
  }

  return (
    <div className="pb-4">
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
          className="absolute top-3 right-3 z-20 rounded-xl bg-black/50 border border-white/10 text-white p-2 hover:bg-black/75 transition"
          aria-label="Полный экран"
        >
          {(isFullscreen || isCssFull) ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>
    </div>
  )
}
