import { useEffect, useRef, useState } from 'react'
import Hls from 'hls.js'

/**
 * Video player wrapper — supports HLS streams and plain MP4 from R2.
 *
 * Features:
 *   - Auto-retry for HLS manifest (CF Stream live takes 10-30s to start).
 *   - Adaptive bitrate by default; manual quality selector via the gear icon.
 *   - Diagnostic state ('loading' | 'ready' | 'waiting' | 'error') exposed
 *     via onStateChange so the parent can show a meaningful overlay.
 *
 * Props:
 *   src               — HLS manifest URL or R2 presigned MP4 URL
 *   kind              — 'hls' (default) | 'r2' (plain MP4, no hls.js)
 *   onTimeUpdate({position, duration, percent}) — fired ~every 1s
 *   onReady(video)    — gives the parent the video element (for pause-on-suspect)
 *   onStateChange(s)  — diagnostic: 'loading'|'ready'|'waiting'|'error'
 *   startAt           — optional resume position in seconds
 *   autoPlay          — bool
 *   poster            — optional poster URL
 */
export default function HlsPlayer({
  src,
  kind = 'hls',
  onTimeUpdate,
  onReady,
  onStateChange,
  startAt = 0,
  autoPlay = false,
  poster = '',
}) {
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const [levels, setLevels] = useState([]) // available HLS quality levels
  const [currentLevel, setCurrentLevel] = useState(-1) // -1 = auto
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const [diag, setDiag] = useState('loading')

  // helper to set diag and notify parent
  const updateDiag = s => {
    setDiag(s)
    onStateChange?.(s)
  }

  useEffect(() => {
    if (!src) return
    const video = videoRef.current
    if (!video) return

    let hls
    let manifestRetryTimer = null
    updateDiag('loading')

    if (kind === 'r2') {
      // Plain MP4 stored in R2 — native browser video, no hls.js needed
      video.src = src
      setLevels([])
    } else if (Hls.isSupported()) {
      // Live HLS via CF Stream sometimes returns 404/empty for the first
      // 10–30 sec after the broadcaster starts. Auto-retry instead of
      // showing "infinite loading".
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        // capLevelToPlayerSize lets ABR pick a level that matches the actual
        // <video> element size — saves bandwidth on small windows.
        capLevelToPlayerSize: true,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 2000,
        manifestLoadingMaxRetryTimeout: 64000,
        levelLoadingMaxRetry: 6,
        // Larger buffer = smoother playback on weak networks
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      })
      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, (_evt, data) => {
        setLevels(data.levels || [])
        updateDiag('ready')
      })
      hls.on(Hls.Events.LEVEL_SWITCHED, (_evt, data) => {
        setCurrentLevel(data.level)
      })
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        // eslint-disable-next-line no-console
        console.warn('[HLS]', data.type, data.details, data.fatal ? 'FATAL' : '')
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Manifest not ready yet — wait and reload (CF Stream live delay)
            updateDiag('waiting')
            try { hls.startLoad() } catch {}
            manifestRetryTimer = setTimeout(() => {
              try { hls.loadSource(src); hls.startLoad() } catch {}
            }, 3000)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError() } catch {}
          } else {
            updateDiag('error')
          }
        }
      })
      hls.loadSource(src)
      hls.attachMedia(video)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS — no manual quality control, but ABR is built-in
      video.src = src
      setLevels([])
    }

    const onLoaded = () => {
      if (startAt > 0 && Number.isFinite(startAt)) {
        try { video.currentTime = startAt } catch {}
      }
      if (autoPlay) video.play().catch(() => {})
      onReady?.(video)
      updateDiag('ready')
    }
    video.addEventListener('loadedmetadata', onLoaded)

    const onWaiting = () => updateDiag('waiting')
    const onPlaying = () => updateDiag('ready')
    video.addEventListener('waiting', onWaiting)
    video.addEventListener('playing', onPlaying)

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
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('playing', onPlaying)
      if (manifestRetryTimer) clearTimeout(manifestRetryTimer)
      if (hls) {
        try { hls.destroy() } catch {}
      }
      hlsRef.current = null
      setLevels([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, kind, autoPlay, startAt])

  // Manual quality switch
  const selectLevel = (idx) => {
    const hls = hlsRef.current
    if (!hls) return
    hls.currentLevel = idx // -1 = auto
    setCurrentLevel(idx)
    setShowQualityMenu(false)
  }

  const fmtLevel = (lvl) => {
    if (!lvl) return ''
    const h = lvl.height
    if (h >= 1080) return '1080p'
    if (h >= 720) return '720p'
    if (h >= 480) return '480p'
    if (h >= 360) return '360p'
    return `${h}p`
  }

  return (
    <div className="w-full h-full relative bg-black">
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

      {/* Diagnostic overlay — only shown when waiting */}
      {(diag === 'loading' || diag === 'waiting') && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-white/80 text-xs">
            <div className="w-7 h-7 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <div className="px-2 py-0.5 rounded bg-black/40">
              {diag === 'loading' ? 'Загружаем поток…' : 'Ждём сигнал от тренера…'}
            </div>
          </div>
        </div>
      )}

      {diag === 'error' && (
        <div className="absolute inset-x-0 top-2 flex justify-center pointer-events-none">
          <div className="px-3 py-1 rounded bg-rose-600/90 text-white text-xs">
            Ошибка воспроизведения. Попробуйте обновить страницу.
          </div>
        </div>
      )}

      {/* Quality selector — only when HLS has multiple levels */}
      {levels.length > 1 && (
        <div className="absolute top-2 right-2 z-10">
          <button
            type="button"
            onClick={() => setShowQualityMenu(s => !s)}
            className="px-2.5 py-1 rounded-md bg-black/60 hover:bg-black/80 text-white text-xs font-medium border border-white/15 backdrop-blur"
            title="Качество видео"
          >
            {currentLevel === -1
              ? 'Авто'
              : fmtLevel(levels[currentLevel])}
          </button>
          {showQualityMenu && (
            <div className="absolute right-0 mt-1 w-32 rounded-lg bg-gray-900/95 border border-white/10 shadow-lg overflow-hidden">
              <button
                type="button"
                onClick={() => selectLevel(-1)}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-white/10 ${
                  currentLevel === -1 ? 'text-rose-300' : 'text-white'
                }`}
              >
                Авто {currentLevel === -1 && '✓'}
              </button>
              {[...levels]
                .map((lvl, idx) => ({ lvl, idx }))
                .sort((a, b) => (b.lvl.height || 0) - (a.lvl.height || 0))
                .map(({ lvl, idx }) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => selectLevel(idx)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-white/10 ${
                      currentLevel === idx ? 'text-rose-300' : 'text-white'
                    }`}
                  >
                    {fmtLevel(lvl)} {currentLevel === idx && '✓'}
                  </button>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
