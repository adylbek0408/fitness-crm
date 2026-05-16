import { useEffect, useRef, useState } from 'react'
import { Play, Pause, Loader2 } from 'lucide-react'

/**
 * Custom audio player — no native <audio controls> visible.
 * Fetches audio as blob so the source URL is hidden from DevTools.
 */
export default function AudioPlayer({ src, onTimeUpdate, startAt = 0 }) {
  const audioRef   = useRef(null)
  const [blobUrl,     setBlobUrl]     = useState('')
  const [playing,     setPlaying]     = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [error,       setError]       = useState('')
  const [current,     setCurrent]     = useState(0)
  const [duration,    setDuration]    = useState(0)

  // Fetch audio as blob (hides R2 URL from network tab)
  useEffect(() => {
    if (!src) return
    setLoading(true); setError('')
    const ac = new AbortController()
    let created = ''
    fetch(src, { signal: ac.signal })
      .then(r => {
        if (!r.ok) throw new Error('audio_fetch_failed')
        return r.blob()
      })
      .then(blob => {
        if (ac.signal.aborted) return
        const url = URL.createObjectURL(blob)
        created = url
        setBlobUrl(url)
        setLoading(false)
      })
      .catch(e => {
        if (e.name === 'AbortError') return
        setError('Не удалось загрузить аудио.')
        setLoading(false)
      })
    return () => {
      ac.abort()
      if (created) URL.revokeObjectURL(created)
    }
  }, [src])

  // Sync playing state + buffering indicator
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onPlay     = () => { setPlaying(true);  setIsBuffering(false) }
    const onPlaying  = () => { setPlaying(true);  setIsBuffering(false) }
    const onPause    = () => { setPlaying(false); setIsBuffering(false) }
    const onEnded    = () => { setPlaying(false); setIsBuffering(false) }
    const onWaiting  = () => setIsBuffering(true)
    a.addEventListener('play',    onPlay)
    a.addEventListener('playing', onPlaying)
    a.addEventListener('pause',   onPause)
    a.addEventListener('ended',   onEnded)
    a.addEventListener('waiting', onWaiting)
    return () => {
      a.removeEventListener('play',    onPlay)
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('pause',   onPause)
      a.removeEventListener('ended',   onEnded)
      a.removeEventListener('waiting', onWaiting)
    }
  }, [blobUrl])

  // Track time
  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onMeta = () => {
      setDuration(a.duration || 0)
      if (startAt > 0) try { a.currentTime = startAt } catch {}
    }
    const onTime = () => {
      setCurrent(a.currentTime)
      const dur = a.duration || 0
      const pos = a.currentTime
      const pct = dur > 0 ? Math.min(100, Math.round((pos / dur) * 100)) : 0
      onTimeUpdate?.({ position: pos, duration: dur, percent: pct })
    }
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('timeupdate',     onTime)
    return () => {
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('timeupdate',     onTime)
    }
  }, [blobUrl, startAt, onTimeUpdate])

  const toggle = () => {
    const a = audioRef.current
    if (!a || !blobUrl) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }

  const seek = (e) => {
    const a = audioRef.current
    if (!a || !duration) return
    const rect  = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    a.currentTime = ratio * duration
  }

  const fmt = (s) => {
    const sec = Math.floor(s || 0)
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
  }

  const pct = duration > 0 ? (current / duration) * 100 : 0

  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
      {/* Hidden audio — no native controls */}
      <audio
        ref={audioRef}
        src={blobUrl}
        onContextMenu={e => e.preventDefault()}
      />

      {error && (
        <p className="text-[13px] text-rose-600 mb-3">{error}</p>
      )}

      {loading && (
        <p className="text-[12px] text-gray-400 text-center mb-3 animate-pulse">
          Загрузка аудио…
        </p>
      )}

      <div className="flex items-center gap-3">
        {/* Play / Pause button */}
        <button
          onClick={toggle}
          disabled={!blobUrl || isBuffering}
          className="w-12 h-12 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 active:scale-95 transition disabled:opacity-50 shrink-0"
        >
          {loading || isBuffering
            ? <Loader2 size={20} className="animate-spin" />
            : playing
              ? <Pause size={20} />
              : <Play  size={20} className="ml-0.5" />}
        </button>

        <div className="flex-1 min-w-0">
          {/* Progress bar — clickable/seekable */}
          <div
            className="h-2 bg-rose-100 rounded-full overflow-hidden cursor-pointer"
            onClick={seek}
          >
            <div
              className="h-full bg-rose-400 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          {/* Time */}
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-gray-400 tabular-nums">{fmt(current)}</span>
            <span className="text-[10px] text-gray-400 tabular-nums">{fmt(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
