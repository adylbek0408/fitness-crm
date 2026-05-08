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

    const onCanPlay = () => { if (!cleanedUp) setLoading(false) }

    v.addEventListener('canplay',    onCanPlay)
    v.addEventListener('loadeddata', onCanPlay)

    if (canNative) {
      // iOS / Safari — native HLS.
      // Retry on error: manifest often isn't ready the instant the stream
      // status flips to 'live', and LL-HLS parsing can hiccup on some
      // WebKit versions. hls.js handles this automatically; here we add
      // the same resilience for the native path.
      let retries     = 0
      let ignoreError = false   // suppress error during retry reset
      const MAX_RETRIES = 10

      const handleError = () => {
        if (cleanedUp || ignoreError) return
        if (retries < MAX_RETRIES) {
          retries++
          ignoreError = true
          retryTimer  = setTimeout(() => {
            if (cleanedUp) return
            ignoreError = false
            v.load()   // re-fetch manifest with same src
          }, 2500)
        } else {
          setHardError(true)
          onError?.(new Error('stream unavailable'))
        }
      }

      v.addEventListener('error', handleError)
      v.src = src

      // Explicit play() so we can detect autoplay-blocked policy separately
      // from genuine media errors — and show a friendlier "tap to start" UI
      // instead of the error screen.
      const p = v.play()
      if (p instanceof Promise) {
        p.catch(err => {
          if (cleanedUp) return
          if (err?.name === 'NotAllowedError') {
            setNeedsTap(true)
            setLoading(false)
          }
        })
      }

      return () => {
        cleanedUp = true
        clearTimeout(retryTimer)
        v.removeEventListener('canplay',    onCanPlay)
        v.removeEventListener('loadeddata', onCanPlay)
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
        controls
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
        <div className="absolute inset-0 flex items-center justify-center text-center px-6 bg-black/80">
          <div className="max-w-xs">
            <p className="text-white text-sm font-semibold mb-1">Не удалось подключиться к эфиру</p>
            <p className="text-white/50 text-xs">Проверьте интернет и обновите страницу.</p>
          </div>
        </div>
      )}
    </div>
  )
})

export default CloudflareStreamPlayer
