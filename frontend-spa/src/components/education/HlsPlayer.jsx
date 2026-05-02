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
    let manifestRetryTimer = null

    if (kind === 'r2') {
      // Plain MP4 stored in R2 — native browser video, no hls.js needed
      video.src = src
    } else if (Hls.isSupported()) {
      // Live HLS via CF Stream sometimes returns 404/empty for the first
      // 10–30 sec after the broadcaster starts. Auto-retry instead of
      // showing "infinite loading".
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 2000,
        manifestLoadingMaxRetryTimeout: 64000,
        levelLoadingMaxRetry: 6,
      })
      hlsRef.current = hls
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Manifest not ready yet — wait and reload (CF Stream live delay)
            try { hls.startLoad() } catch {}
            manifestRetryTimer = setTimeout(() => {
              try { hls.loadSource(src); hls.startLoad() } catch {}
            }, 3000)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError() } catch {}
          }
        }
      })
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
      if (manifestRetryTimer) clearTimeout(manifestRetryTimer)
      if (hls) {
        try { hls.destroy() } catch {}
      }
      hlsRef.current = null
    }
  }, [src, kind, autoPlay, onReady, onTimeUpdate, startAt])

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      poster={poster}
      controlsList="nodownload noplaybackrate noremoteplayback"
      disablePictureInPicture
      disableRemotePlayback
      onContextMenu={e => e.preventDefault()}
      className="w-full h-full object-contain bg-black"
    />
  )
}
