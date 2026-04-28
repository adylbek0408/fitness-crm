import { useEffect, useRef } from 'react'
import Hls from 'hls.js'

/**
 * Video player wrapper — supports HLS streams and plain MP4 from R2.
 *
 * Props:
 *   src               — HLS manifest URL or R2 presigned MP4 URL
 *   kind              — 'hls' (default) | 'r2' (plain MP4, no hls.js)
 *   onTimeUpdate({position, duration, percent}) — fired ~every 1s
 *   onReady(video)    — gives the parent the video element (for pause-on-suspect)
 *   startAt           — optional resume position in seconds
 *   autoPlay          — bool
 */
export default function HlsPlayer({
  src,
  kind = 'hls',
  onTimeUpdate,
  onReady,
  startAt = 0,
  autoPlay = false,
  poster = '',
}) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  useEffect(() => {
    if (!src) return
    const video = videoRef.current
    if (!video) return

    let hls
    if (kind === 'r2') {
      // Plain MP4 stored in R2 — native browser video, no hls.js needed
      video.src = src
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS
      video.src = src
    }

    const onLoaded = () => {
      if (startAt > 0 && Number.isFinite(startAt)) {
        try { video.currentTime = startAt } catch {}
      }
      if (autoPlay) video.play().catch(() => {})
      onReady?.(video)
    }
    video.addEventListener('loadedmetadata', onLoaded)

    let lastSent = 0
    const onTime = () => {
      const now = Date.now()
      if (now - lastSent < 1000) return
      lastSent = now
      const duration = video.duration || 0
      const position = video.currentTime || 0
      const percent = duration > 0
        ? Math.min(100, Math.round((position / duration) * 100))
        : 0
      onTimeUpdate?.({ position, duration, percent })
    }
    video.addEventListener('timeupdate', onTime)

    return () => {
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('loadedmetadata', onLoaded)
      if (hls) {
        try { hls.destroy() } catch {}
      }
      hlsRef.current = null
    }
  }, [src, autoPlay, onReady, onTimeUpdate, startAt])

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      poster={poster}
      controlsList="nodownload noplaybackrate"
      disablePictureInPicture
      onContextMenu={e => e.preventDefault()}
      className="w-full h-full object-contain bg-black"
    />
  )
}
