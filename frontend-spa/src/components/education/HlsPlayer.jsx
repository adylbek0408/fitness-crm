import { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'

/**
 * GetCourse-style HLS / MP4 video player.
 *
 * Custom controls (no native browser UI):
 *   - Big-play overlay
 *   - Play / Pause
 *   - Time scrubber with hover preview
 *   - Volume slider
 *   - Quality selector (Авто + manual HLS levels)
 *   - Fullscreen
 *   - Auto-hide controls after 2.5s of inactivity (only when playing)
 *
 * Anti-piracy:
 *   - controlsList=nodownload, no PiP, no remote playback
 *   - context-menu disabled
 *   - native controls hidden (controls={false}) so user can't right-click → Save
 *   - drag start blocked
 *   - text selection disabled
 *
 * Props:
 *   src               — HLS manifest URL or R2 presigned MP4 URL
 *   kind              — 'hls' (default) | 'r2' (plain MP4)
 *   onTimeUpdate({position, duration, percent}) — fired ~every 1s
 *   onReady(video)    — gives the parent the video element
 *   onStateChange(s)  — diagnostic: 'loading'|'ready'|'waiting'|'error'
 *   startAt           — optional resume position in seconds
 *   autoPlay          — bool
 *   poster            — optional poster URL
 *   live              — bool, true for live HLS streams (hides time bar)
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
  live = false,
}) {
  const containerRef = useRef(null)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const hideTimerRef = useRef(null)

  const [levels, setLevels] = useState([])
  const [currentLevel, setCurrentLevel] = useState(-1) // -1 = auto
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const [diag, setDiag] = useState('loading')
  // After ~20s of waiting on a live stream, probe the manifest URL directly
  // to surface CF Stream's actual response. "Waiting forever" usually means
  // the live input on CF isn't actually receiving video — show that to the user.
  const [waitProbe, setWaitProbe] = useState('') // '' | '404' | '5xx' | 'cors' | 'ok'

  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [hovering, setHovering] = useState(false)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)

  const updateDiag = useCallback(s => {
    setDiag(s)
    onStateChange?.(s)
  }, [onStateChange])

  // ── HLS / MP4 setup ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!src) return
    const video = videoRef.current
    if (!video) return

    let hls
    let manifestRetryTimer = null
    updateDiag('loading')

    if (kind === 'r2') {
      video.src = src
      setLevels([])
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        manifestLoadingMaxRetry: 10,
        manifestLoadingRetryDelay: 2000,
        manifestLoadingMaxRetryTimeout: 64000,
        levelLoadingMaxRetry: 6,
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
      video.src = src
      setLevels([])
    }

    return () => {
      if (manifestRetryTimer) clearTimeout(manifestRetryTimer)
      if (hls) {
        try { hls.destroy() } catch {}
      }
      hlsRef.current = null
      setLevels([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, kind])

  // ── Video event listeners ────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onLoadedMeta = () => {
      setDuration(v.duration || 0)
      if (startAt > 0 && Number.isFinite(startAt)) {
        try { v.currentTime = startAt } catch {}
      }
      if (autoPlay) v.play().catch(() => {})
      onReady?.(v)
      updateDiag('ready')
    }
    const onTime = () => {
      setPosition(v.currentTime || 0)
      const dur = v.duration || 0
      if (v.buffered && v.buffered.length > 0) {
        setBuffered(v.buffered.end(v.buffered.length - 1))
      }
      const percent = dur > 0
        ? Math.min(100, Math.round((v.currentTime / dur) * 100))
        : 0
      onTimeUpdate?.({ position: v.currentTime || 0, duration: dur, percent })
    }
    const onWaiting = () => updateDiag('waiting')
    const onPlaying = () => updateDiag('ready')
    const onVolume = () => {
      setVolume(v.volume)
      setMuted(v.muted)
    }

    v.addEventListener('play', onPlay)
    v.addEventListener('pause', onPause)
    v.addEventListener('loadedmetadata', onLoadedMeta)
    v.addEventListener('timeupdate', onTime)
    v.addEventListener('waiting', onWaiting)
    v.addEventListener('playing', onPlaying)
    v.addEventListener('volumechange', onVolume)
    return () => {
      v.removeEventListener('play', onPlay)
      v.removeEventListener('pause', onPause)
      v.removeEventListener('loadedmetadata', onLoadedMeta)
      v.removeEventListener('timeupdate', onTime)
      v.removeEventListener('waiting', onWaiting)
      v.removeEventListener('playing', onPlaying)
      v.removeEventListener('volumechange', onVolume)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, kind])

  // ── Fullscreen state ─────────────────────────────────────────────────────
  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  // ── Diagnostic probe for live streams stuck in 'waiting' ─────────────────
  // After 18s with no playback, hit the manifest URL directly so we can tell
  // the user WHY: 404 (CF input idle), 5xx (CF outage), CORS, or it's actually OK
  // (in which case the issue is HLS.js / browser).
  useEffect(() => {
    if (!live || !src || kind !== 'hls') return
    if (diag !== 'loading' && diag !== 'waiting') {
      setWaitProbe('')
      return
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch(src, { method: 'GET', cache: 'no-store' })
        if (r.status === 404) setWaitProbe('404')
        else if (r.status >= 500) setWaitProbe('5xx')
        else if (r.ok) setWaitProbe('ok')
        else setWaitProbe(String(r.status))
      } catch (e) {
        setWaitProbe('cors')
      }
    }, 18000)
    return () => clearTimeout(timer)
  }, [src, kind, live, diag])

  // ── Auto-hide controls when playing ──────────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    if (playing) {
      hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2500)
    }
  }, [playing])

  useEffect(() => {
    if (!playing) {
      setControlsVisible(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    } else {
      showControls()
    }
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [playing, showControls])

  // ── Actions ──────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
  }

  const toggleMute = () => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
  }

  const setVol = (val) => {
    const v = videoRef.current
    if (!v) return
    v.volume = val
    v.muted = val === 0
  }

  const seek = (sec) => {
    const v = videoRef.current
    if (!v || !Number.isFinite(sec)) return
    try { v.currentTime = Math.max(0, Math.min(sec, v.duration || sec)) } catch {}
  }

  const onScrubberClick = (e) => {
    if (live) return // can't seek a live stream
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = (e.clientX - rect.left) / rect.width
    seek(pct * (videoRef.current?.duration || 0))
  }

  const toggleFullscreen = async () => {
    const el = containerRef.current
    if (!el) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await el.requestFullscreen()
    } catch {}
  }

  const selectLevel = (idx) => {
    const hls = hlsRef.current
    if (!hls) return
    hls.currentLevel = idx
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

  const fmtTime = (s) => {
    if (!Number.isFinite(s) || s < 0) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  const progressPct = duration > 0 ? (position / duration) * 100 : 0
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="w-full h-full relative bg-black select-none"
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
      onMouseEnter={() => { setHovering(true); showControls() }}
      onMouseLeave={() => setHovering(false)}
      onMouseMove={showControls}
      onContextMenu={e => e.preventDefault()}
      onDragStart={e => e.preventDefault()}
    >
      <video
        ref={videoRef}
        playsInline
        poster={poster}
        controls={false}
        controlsList="nodownload noplaybackrate noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onClick={togglePlay}
        onContextMenu={e => e.preventDefault()}
        className="w-full h-full object-contain bg-black cursor-pointer"
        style={{ pointerEvents: 'auto' }}
      />

      {/* Big-play overlay (paused state, before first play) */}
      {!playing && diag !== 'loading' && diag !== 'waiting' && (
        <button
          type="button"
          onClick={togglePlay}
          aria-label="Воспроизвести"
          className="absolute inset-0 flex items-center justify-center group"
        >
          <span className="w-20 h-20 rounded-full bg-rose-500/90 hover:bg-rose-500 group-hover:scale-110 transition flex items-center justify-center shadow-2xl backdrop-blur">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="white" className="ml-1">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}

      {/* Loading spinner */}
      {(diag === 'loading' || diag === 'waiting') && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-white/80 text-xs max-w-[80%] text-center">
            <div className="w-9 h-9 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <div className="px-2.5 py-1 rounded-md bg-black/50">
              {diag === 'loading' ? 'Загружаем поток…' : 'Ждём сигнал от тренера…'}
            </div>
            {/* Diagnostic message after 18s — tells the user what's actually wrong */}
            {waitProbe === '404' && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-rose-900/80 text-rose-100 text-[11px] leading-snug">
                Cloudflare пока не получает видео от тренера.<br/>
                Возможно эфир запустился, но WebRTC не подключился (HTTP вместо HTTPS).
              </div>
            )}
            {waitProbe === '5xx' && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-rose-900/80 text-rose-100 text-[11px] leading-snug">
                Сервис Cloudflare сейчас недоступен. Подождите минуту.
              </div>
            )}
            {waitProbe === 'cors' && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-amber-900/80 text-amber-100 text-[11px] leading-snug">
                Не удаётся достучаться до Cloudflare. Проверьте интернет.
              </div>
            )}
            {waitProbe === 'ok' && diag === 'waiting' && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-amber-900/70 text-amber-100 text-[11px] leading-snug">
                Поток есть, но видеоданных мало. Подождите 10-20 секунд.
              </div>
            )}
          </div>
        </div>
      )}

      {diag === 'error' && (
        <div className="absolute inset-x-0 top-2 flex justify-center pointer-events-none">
          <div className="px-3 py-1 rounded bg-rose-600/90 text-white text-xs">
            Ошибка воспроизведения. Обновите страницу.
          </div>
        </div>
      )}

      {/* Custom controls bar */}
      <div
        className={`absolute inset-x-0 bottom-0 px-3 sm:px-4 pb-2 pt-12 bg-gradient-to-t from-black/85 via-black/40 to-transparent transition-opacity duration-200 ${
          controlsVisible || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Scrubber */}
        {!live && duration > 0 && (
          <div
            className="relative h-1.5 sm:h-1 hover:h-2 transition-all bg-white/20 rounded-full mb-2.5 cursor-pointer group"
            onClick={onScrubberClick}
            role="slider"
            aria-label="Перемотка"
            aria-valuemin={0}
            aria-valuemax={Math.floor(duration)}
            aria-valuenow={Math.floor(position)}
          >
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
              style={{ width: `${bufferedPct}%` }}
            />
            {/* Progress */}
            <div
              className="absolute inset-y-0 left-0 bg-rose-500 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
            {/* Thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-rose-500 rounded-full shadow opacity-0 group-hover:opacity-100 transition"
              style={{ left: `calc(${progressPct}% - 6px)` }}
            />
          </div>
        )}

        {/* Buttons row */}
        <div className="flex items-center gap-3 sm:gap-4 text-white">
          {/* Play / Pause */}
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? 'Пауза' : 'Воспроизвести'}
            className="hover:text-rose-300 transition focus:outline-none"
          >
            {playing ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1.5 group">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted || volume === 0 ? 'Включить звук' : 'Выключить звук'}
              className="hover:text-rose-300 transition focus:outline-none"
            >
              {muted || volume === 0 ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={e => setVol(parseFloat(e.target.value))}
              aria-label="Громкость"
              className="w-0 group-hover:w-20 transition-all duration-200 accent-rose-500 cursor-pointer"
            />
          </div>

          {/* Time */}
          {live ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" />
              <span className="text-xs font-medium uppercase tracking-wider">Live</span>
            </div>
          ) : (
            <div className="text-xs font-mono tabular-nums text-white/85">
              {fmtTime(position)} / {fmtTime(duration)}
            </div>
          )}

          <div className="flex-1" />

          {/* Quality */}
          {levels.length > 1 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowQualityMenu(s => !s)}
                aria-label="Качество видео"
                className="px-2 py-1 rounded text-xs font-medium hover:bg-white/15 focus:outline-none"
              >
                {currentLevel === -1 ? 'Авто' : fmtLevel(levels[currentLevel])}
              </button>
              {showQualityMenu && (
                <div className="absolute right-0 bottom-full mb-2 w-32 rounded-lg bg-gray-900/95 border border-white/10 shadow-xl overflow-hidden">
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

          {/* Fullscreen */}
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? 'Выйти из полноэкранного' : 'Полноэкранный'}
            className="hover:text-rose-300 transition focus:outline-none"
          >
            {fullscreen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5 16h3v3h2v-5H5zM8 8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 14H5v5h5v-2H7zM5 10h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
