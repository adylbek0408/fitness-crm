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
  const [loading, setLoading] = useState(true)
  const [hardError, setHardError] = useState(false)

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

    const onCanPlay = () => setLoading(false)
    const onErr = e => {
      setHardError(true)
      onError?.(e)
    }

    v.addEventListener('canplay',     onCanPlay)
    v.addEventListener('loadeddata',  onCanPlay)
    v.addEventListener('error',       onErr)

    if (canNative) {
      // iOS Safari — native HLS, fullscreen через webkitEnterFullscreen работает
      v.src = src
    } else if (Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode:        live,
        backBufferLength:      live ? 30 : 90,
        maxBufferLength:       live ? 6  : 30,
        liveSyncDurationCount: 3,
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
            try { hls.recoverMediaError() } catch { setHardError(true) }
          } else {
            setHardError(true)
            onError?.(data)
          }
        }
      })
      hlsRef.current = hls
    } else {
      // Last-resort fallback
      v.src = src
    }

    return () => {
      v.removeEventListener('canplay',    onCanPlay)
      v.removeEventListener('loadeddata', onCanPlay)
      v.removeEventListener('error',      onErr)
      try { hlsRef.current?.destroy() } catch {}
      hlsRef.current = null
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

      {loading && !hardError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="w-10 h-10 border-2 border-white/20 border-t-rose-400 rounded-full animate-spin" />
        </div>
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
