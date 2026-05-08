import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react'
import Hls from 'hls.js'

const CloudflareStreamPlayer = forwardRef(function CloudflareStreamPlayer({
  uid,
  subdomain,
  live = true,
  className = 'w-full h-full bg-black',
  onError,
}, externalRef) {
  const videoRef = useRef(null)
  const hlsRef   = useRef(null)
  const [loading,   setLoading]   = useState(true)
  const [hardError, setHardError] = useState(false)
  const [needsTap,  setNeedsTap]  = useState(false)

  useImperativeHandle(externalRef, () => ({
    el: videoRef.current,
    requestFullscreen: async () => {
      const v = videoRef.current
      if (!v) return
      if (v.webkitEnterFullscreen) { v.webkitEnterFullscreen(); return }
      if (v.requestFullscreen)     { await v.requestFullscreen(); return }
    },
    play:  () => videoRef.current?.play(),
    pause: () => videoRef.current?.pause(),
  }), [])

  useEffect(() => {
    if (!uid || !subdomain) return
    const v = videoRef.current
    if (!v) return

    const src = `https://${subdomain}/${uid}/manifest/video.m3u8`
    // Prefer hls.js whenever MSE is available (Chrome, Firefox, Edge).
    // IMPORTANT: Chrome on macOS returns 'maybe' for canPlayType('application/vnd.apple.mpegurl')
    // but cannot actually play HLS natively — it has MSE/hls.js support instead.
    // Only fall back to native HLS when hls.js is NOT supported (Safari, iOS).
    const canNative = !Hls.isSupported() && !!v.canPlayType('application/vnd.apple.mpegurl')

    console.log('[player] init src:', src, 'canNative:', canNative, 'hlsSupported:', Hls.isSupported())

    setLoading(true)
    setHardError(false)
    setNeedsTap(false)

    let cleanedUp  = false
    let retryTimer = null
    let hasPlayed  = false   // flips true on first 'playing' event

    const onCanPlay = () => {
      if (cleanedUp) return
      console.log('[player] canplay — readyState:', v.readyState)
      setLoading(false)
      // If data arrived but we've never played (stream came online while
      // spinner was showing), nudge the browser to autoplay.
      if (!hasPlayed) {
        v.play().catch(err => {
          if (!cleanedUp) {
            console.warn('[player] canplay-play blocked:', err?.name)
            setNeedsTap(true)
            setLoading(false)
          }
        })
      }
    }
    const onPlaying = () => {
      if (cleanedUp) return
      console.log('[player] playing ✓')
      hasPlayed = true
      // CRITICAL: cancel any pending retry timer.
      // Without this the timer fires v.load() mid-playback and kills the stream.
      clearTimeout(retryTimer)
      retryTimer = null
      setLoading(false)
      setNeedsTap(false)
    }
    // Autoplay-blocked: video has data but is paused before any playing event.
    const onPause = () => {
      if (cleanedUp || hasPlayed) return
      if (v.readyState >= 2) {
        console.log('[player] paused before first play — showing tap overlay')
        setNeedsTap(true)
        setLoading(false)
      }
    }

    v.addEventListener('canplay',    onCanPlay)
    v.addEventListener('loadeddata', onCanPlay)
    v.addEventListener('playing',    onPlaying)
    v.addEventListener('pause',      onPause)

    if (canNative) {
      // ── iOS / Safari / Chrome-Mac — native HLS ─────────────────────────
      // For live streams the manifest may not be ready when the user joins
      // (trainer still connecting). Retry aggressively instead of giving up.
      let retries     = 0
      let ignoreError = false
      const MAX_RETRIES = live ? 1200 : 10   // ~50 min live vs 25 s VOD

      const handleError = () => {
        // Never interrupt once the user has successfully started playback.
        if (cleanedUp || ignoreError || hasPlayed) return
        const errCode = v.error?.code ?? '?'
        console.warn('[player] native HLS error code:', errCode, 'retry:', retries + 1)
        if (retries < MAX_RETRIES) {
          retries++
          ignoreError = true
          const delay = retries < 5 ? 1500 : 3000
          retryTimer  = setTimeout(() => {
            if (cleanedUp || hasPlayed) return   // don't interrupt active playback
            ignoreError = false
            v.load()
          }, delay)
        } else {
          setHardError(true)
          onError?.(new Error('stream unavailable'))
        }
      }

      v.addEventListener('error', handleError)
      v.src = src

      // Attempt autoplay — any rejection means browser policy requires a tap.
      try {
        const p = v.play()
        if (p && typeof p.then === 'function') {
          p.catch(err => {
            if (cleanedUp) return
            console.warn('[player] autoplay rejected:', err?.name || err)
            setNeedsTap(true)
            setLoading(false)
          })
        }
      } catch (e) {
        if (!cleanedUp) { setNeedsTap(true); setLoading(false) }
      }

      // Safety net: 4 s after init, if video has data but is still paused
      // → silently-blocked autoplay (Low-Power Mode, older iOS, etc.)
      // Only show tap overlay when there is actual video data (readyState ≥ 2).
      // If readyState is 0 (stream not started yet) we just clear the spinner.
      const tapPrompt = setTimeout(() => {
        if (!cleanedUp && !hasPlayed && v.paused) {
          if (v.readyState >= 2) {
            console.warn('[player] 4 s passed, data ready, still paused — showing tap overlay')
            setNeedsTap(true)
          }
          setLoading(false)
        }
      }, 4000)

      return () => {
        cleanedUp = true
        clearTimeout(retryTimer)
        clearTimeout(tapPrompt)
        v.removeEventListener('canplay',    onCanPlay)
        v.removeEventListener('loadeddata', onCanPlay)
        v.removeEventListener('playing',    onPlaying)
        v.removeEventListener('pause',      onPause)
        v.removeEventListener('error',      handleError)
        try { v.src = '' } catch {}
      }

    } else if (Hls.isSupported()) {
      // ── hls.js (Chrome, Firefox, etc.) ────────────────────────────────
      // After a FATAL error hls.startLoad() does nothing — the instance is
      // dead. The only way to retry is to destroy it and create a fresh one.
      let netFatalCount = 0
      const HLS_CFG = {
        lowLatencyMode:          live,
        backBufferLength:        live ? 30 : 90,
        maxBufferLength:         live ? 6  : 30,
        liveSyncDurationCount:   3,
        // Per-request retries before escalating to FATAL:
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 1500,
        levelLoadingMaxRetry:    4,
        fragLoadingMaxRetry:     4,
      }

      const createHlsInstance = () => {
        if (cleanedUp) return
        const h = new Hls(HLS_CFG)
        hlsRef.current = h
        h.loadSource(src)
        h.attachMedia(v)

        h.on(Hls.Events.MANIFEST_PARSED, () => {
          netFatalCount = 0   // reset on success
          console.log('[player] hls.js manifest parsed — readyState:', v.readyState)
        })

        h.on(Hls.Events.ERROR, (_evt, data) => {
          if (!data.fatal) return
          console.warn('[player] hls.js fatal:', data.type, data.details, '— attempt', netFatalCount + 1)

          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            netFatalCount++
            // For live: never give up — manifest may appear once trainer starts.
            // For VOD: give up after 3 consecutive fatal network errors.
            if (live || netFatalCount <= 3) {
              const delay = Math.min(3000 * netFatalCount, 15000)
              console.log(`[player] hls.js destroying + recreating in ${delay}ms`)
              retryTimer = setTimeout(() => {
                if (cleanedUp || hasPlayed) return
                try { h.destroy() } catch {}
                createHlsInstance()
              }, delay)
            } else {
              if (!cleanedUp) setHardError(true)
              onError?.(data)
            }
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try {
              h.recoverMediaError()
            } catch {
              if (!cleanedUp) setHardError(true)
            }
          } else {
            if (!cleanedUp) setHardError(true)
            onError?.(data)
          }
        })
      }

      createHlsInstance()

      return () => {
        cleanedUp = true
        clearTimeout(retryTimer)
        v.removeEventListener('canplay',    onCanPlay)
        v.removeEventListener('loadeddata', onCanPlay)
        v.removeEventListener('playing',    onPlaying)
        v.removeEventListener('pause',      onPause)
        try { hlsRef.current?.destroy() } catch {}
        hlsRef.current = null
      }

    } else {
      // Last-resort fallback
      const onErr = e => {
        if (!cleanedUp) { setHardError(true); onError?.(e) }
      }
      v.addEventListener('error', onErr)
      v.src = src
      return () => {
        cleanedUp = true
        v.removeEventListener('canplay',    onCanPlay)
        v.removeEventListener('loadeddata', onCanPlay)
        v.removeEventListener('playing',    onPlaying)
        v.removeEventListener('pause',      onPause)
        v.removeEventListener('error',      onErr)
      }
    }
  }, [uid, subdomain, live, onError])

  if (!uid || !subdomain) return null

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        className={className}
        autoPlay
        playsInline
        // Hide native controls while our "tap to start" overlay is active —
        // otherwise iOS shows a grey play button that visually competes.
        controls={!needsTap}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture={false}
      />

      {loading && !hardError && !needsTap && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-10 h-10 border-2 border-white/20 border-t-rose-400 rounded-full animate-spin" />
        </div>
      )}

      {/* ── Tap-to-start overlay ─────────────────────────────────────── */}
      {needsTap && !hardError && (
        <button
          type="button"
          // z-40 — above watermark (z-30) so click always reaches this button
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 cursor-pointer z-40"
          onClick={() => {
            const v = videoRef.current
            if (!v) return
            console.log('[player] tap — readyState:', v.readyState,
              'error:', v.error?.code ?? null, 'src:', v.currentSrc?.slice(-40))

            // CRITICAL iOS rule: call v.play() FIRST (synchronously, in the gesture
            // handler) — this unlocks the media element even if it fails.
            // Only call v.load() AFTER play() finishes (in .catch), never before.
            // Calling v.load() before v.play() causes AbortError on Safari/iOS.
            setNeedsTap(false)
            setLoading(true)
            v.play()
              .then(() => {
                console.log('[player] tap-play succeeded')
                setNeedsTap(false)
                setLoading(false)
              })
              .catch(err => {
                console.warn('[player] tap-play failed:', err?.name, err?.message)
                if (err?.name === 'NotAllowedError') {
                  // Browser still requires a gesture — show overlay again.
                  setNeedsTap(true)
                  setLoading(false)
                } else {
                  // NotSupportedError / AbortError — stream not loaded yet.
                  // Reset the video so the periodic retry can reload the source.
                  // Element is now "gesture-unlocked" for future auto-play attempts.
                  if (!cleanedUp) {
                    try { v.load() } catch {}   // re-trigger manifest load
                    setNeedsTap(false)
                    setLoading(true)            // keep spinner while we wait for stream
                  }
                }
              })
          }}
        >
          <div className="w-16 h-16 rounded-full bg-white/20 border-2 border-white/60 flex items-center justify-center mb-3">
            <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white" style={{ marginLeft: 3 }}>
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>
          <span className="text-white text-sm font-semibold">Нажмите для просмотра</span>
        </button>
      )}

      {hardError && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6 bg-black/85 z-40">
          <div className="max-w-xs flex flex-col items-center gap-3">
            <p className="text-white text-sm font-semibold">Эфир временно недоступен</p>
            <p className="text-white/60 text-xs">Возможно тренер ещё подключается. Попробуйте ещё раз.</p>
            <button
              type="button"
              onClick={() => {
                const v = videoRef.current
                if (!v) return
                setHardError(false)
                setLoading(true)
                try { v.load() } catch {}
                v.play().catch(() => {})
              }}
              className="mt-1 px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-sm font-semibold transition"
            >
              Повторить попытку
            </button>
          </div>
        </div>
      )}
    </div>
  )
})

export default CloudflareStreamPlayer
