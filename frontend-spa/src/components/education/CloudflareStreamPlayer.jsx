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
    const canNative = v.canPlayType('application/vnd.apple.mpegurl')

    setLoading(true)
    setHardError(false)
    setNeedsTap(false)

    let cleanedUp  = false
    let retryTimer = null
    let hasPlayed  = false   // flips true on first 'playing' event

    const onCanPlay = () => { if (!cleanedUp) setLoading(false) }
    const onPlaying = () => {
      if (cleanedUp) return
      hasPlayed = true
      setLoading(false)
      setNeedsTap(false)
    }
    // If the video lands in a paused state BEFORE it ever actually played
    // (typical iOS Safari autoplay-blocked path — the play() promise may
    // resolve normally and the video just sits there showing the native
    // play icon), surface our "tap to start" overlay so the user knows
    // what to do.
    const onPause = () => {
      if (cleanedUp || hasPlayed) return
      if (v.readyState >= 2) {
        setNeedsTap(true)
        setLoading(false)
      }
    }

    v.addEventListener('canplay',    onCanPlay)
    v.addEventListener('loadeddata', onCanPlay)
    v.addEventListener('playing',    onPlaying)
    v.addEventListener('pause',      onPause)

    if (canNative) {
      // iOS / Safari — native HLS.
      // For live streams the manifest may not be ready when the user joins,
      // and the trainer may briefly drop & reconnect. Keep retrying for a
      // long time (effectively forever for a live session) instead of giving
      // up after 25 s — the watcher hates a "dead" black box.
      let retries     = 0
      let ignoreError = false   // suppress error during retry reset
      // ~50 minutes for live (covers full session); 25 s for VOD (real "missing")
      const MAX_RETRIES = live ? 1200 : 10

      const handleError = () => {
        if (cleanedUp || ignoreError) return
        if (retries < MAX_RETRIES) {
          retries++
          ignoreError = true
          // Backoff: 1.5 s for first 5 tries, then 3 s steady state
          const delay = retries < 5 ? 1500 : 3000
          retryTimer  = setTimeout(() => {
            if (cleanedUp) return
            ignoreError = false
            v.load()   // re-fetch manifest with same src
          }, delay)
        } else {
          setHardError(true)
          onError?.(new Error('stream unavailable'))
        }
      }

      v.addEventListener('error', handleError)
      v.src = src

      // Explicit play() so we can detect autoplay-blocked policy separately
      // from genuine media errors — and show a friendlier "tap to start" UI
      // instead of the error screen. On iOS any rejection here means the
      // user must tap — NotAllowedError is the spec name but Safari has
      // historically used AbortError, "interrupted by load request" etc.
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

      // Safety net: if 4 s in we still haven't actually started playing,
      // assume autoplay was silently denied (older iOS, Low-Power Mode, etc.)
      // and prompt the user instead of leaving them on a black screen.
      const tapPrompt = setTimeout(() => {
        if (!cleanedUp && !hasPlayed && v.paused) {
          setNeedsTap(true)
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
      const onErr = e => {
        if (!cleanedUp) { setHardError(true); onError?.(e) }
      }
      v.addEventListener('error', onErr)

      const hls = new Hls({
        lowLatencyMode:          live,
        backBufferLength:        live ? 30 : 90,
        maxBufferLength:         live ? 6  : 30,
        liveSyncDurationCount:   3,
        manifestLoadingMaxRetry: 6,
        levelLoadingMaxRetry:    6,
        fragLoadingMaxRetry:     6,
      })
      hls.loadSource(src)
      hls.attachMedia(v)
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setTimeout(() => { try { hls.startLoad() } catch {} }, 1500)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError() } catch { if (!cleanedUp) setHardError(true) }
          } else {
            if (!cleanedUp) setHardError(true)
            onError?.(data)
          }
        }
      })
      hlsRef.current = hls

      return () => {
        cleanedUp = true
        v.removeEventListener('canplay',    onCanPlay)
        v.removeEventListener('loadeddata', onCanPlay)
        v.removeEventListener('playing',    onPlaying)
        v.removeEventListener('pause',      onPause)
        v.removeEventListener('error',      onErr)
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
        // Hide native controls until OUR overlay has been resolved:
        // iOS draws its own grey play button when paused, which competes
        // visually with the "tap to start" overlay.
        controls={!needsTap}
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture={false}
      />

      {loading && !hardError && !needsTap && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-10 h-10 border-2 border-white/20 border-t-rose-400 rounded-full animate-spin" />
        </div>
      )}

      {/* Autoplay blocked (iOS policy) — tap anywhere to start */}
      {needsTap && !hardError && (
        <button
          type="button"
          className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 cursor-pointer"
          onClick={() => {
            const v = videoRef.current
            if (!v) return
            v.play().then(() => setNeedsTap(false)).catch(() => {})
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
        <div className="absolute inset-0 flex items-center justify-center text-center px-6 bg-black/85 z-20">
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
