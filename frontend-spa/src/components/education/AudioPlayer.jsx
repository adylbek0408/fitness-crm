import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

/**
 * Audio player that downloads the file via fetch → Blob URL so the source
 * URL is hidden from DevTools network panel beyond the initial fetch.
 */
export default function AudioPlayer({ src, onTimeUpdate, startAt = 0 }) {
  const audioRef = useRef(null)
  const [blobUrl, setBlobUrl] = useState('')
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let revoked = ''
    let aborted = false
    if (!src) return
    setError('')
    fetch(src)
      .then(r => {
        if (!r.ok) throw new Error('audio_fetch_failed')
        return r.blob()
      })
      .then(blob => {
        if (aborted) return
        const url = URL.createObjectURL(blob)
        revoked = url
        setBlobUrl(url)
      })
      .catch(e => setError(String(e.message || e)))
    return () => {
      aborted = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [src])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    return () => {
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
    }
  }, [blobUrl])

  useEffect(() => {
    const a = audioRef.current
    if (!a || !blobUrl) return
    const onLoaded = () => {
      if (startAt > 0) try { a.currentTime = startAt } catch {}
    }
    a.addEventListener('loadedmetadata', onLoaded)
    return () => a.removeEventListener('loadedmetadata', onLoaded)
  }, [blobUrl, startAt])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    let last = 0
    const onTime = () => {
      const now = Date.now()
      if (now - last < 1000) return
      last = now
      const duration = a.duration || 0
      const position = a.currentTime || 0
      const percent = duration > 0
        ? Math.min(100, Math.round((position / duration) * 100))
        : 0
      onTimeUpdate?.({ position, duration, percent })
    }
    a.addEventListener('timeupdate', onTime)
    return () => a.removeEventListener('timeupdate', onTime)
  }, [onTimeUpdate])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) a.play().catch(() => {})
    else a.pause()
  }

  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-5 shadow-sm">
      {error && (
        <div className="text-sm text-rose-600 mb-3">Не удалось загрузить аудио: {error}</div>
      )}
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="w-14 h-14 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition"
          disabled={!blobUrl}
        >
          {playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
        </button>
        <div className="flex-1">
          <audio
            ref={audioRef}
            src={blobUrl}
            controls
            controlsList="nodownload"
            onContextMenu={e => e.preventDefault()}
            className="w-full"
          />
        </div>
      </div>
    </div>
  )
}
