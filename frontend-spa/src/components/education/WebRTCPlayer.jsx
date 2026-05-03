import { useEffect, useRef, useState, useCallback } from 'react'

const RETRY_DELAY_MS = 4000
const MAX_RETRIES = 5

export default function WebRTCPlayer({ src, onStateChange, onFallback }) {
  const videoRef = useRef(null)
  const pcRef = useRef(null)
  const retryRef = useRef(0)
  const retryTimerRef = useRef(null)
  const gaveUpRef = useRef(false)
  // Freeze src after first successful mount so polling doesn't restart the player
  const frozenSrc = useRef(src)
  const [status, setStatus] = useState('connecting')
  const [retryCount, setRetryCount] = useState(0)

  const updateStatus = useCallback(s => {
    setStatus(s)
    onStateChange?.(s)
  }, [onStateChange])

  useEffect(() => {
    // Don't restart if src changes to same effective URL
    if (src && src !== frozenSrc.current && retryRef.current === 0) {
      frozenSrc.current = src
    }
    const url = frozenSrc.current
    if (!url) return
    if (gaveUpRef.current) return

    let stopped = false

    const connect = async () => {
      try {
        updateStatus('connecting')

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
          bundlePolicy: 'max-bundle',
        })
        pcRef.current = pc

        pc.addTransceiver('video', { direction: 'recvonly' })
        pc.addTransceiver('audio', { direction: 'recvonly' })

        pc.addEventListener('track', (e) => {
          if (stopped) return
          if (videoRef.current && e.streams[0]) {
            videoRef.current.srcObject = e.streams[0]
            updateStatus('playing')
            retryRef.current = 0
            setRetryCount(0)
          }
        })

        pc.addEventListener('iceconnectionstatechange', () => {
          if (stopped) return
          const state = pc.iceConnectionState
          if (state === 'failed' || state === 'closed') {
            pc.close()
            scheduleRetry()
          }
        })

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/sdp' },
          body: offer.sdp,
        })

        // 405 = wrong URL type (HLS instead of WHEP) — fall back immediately
        if (resp.status === 405) {
          pc.close()
          gaveUpRef.current = true
          onFallback?.()
          return
        }

        if (resp.status === 404 || resp.status === 204) {
          pc.close()
          scheduleRetry()
          return
        }

        if (!resp.ok) {
          throw new Error(`WHEP ${resp.status}`)
        }

        const answerSdp = await resp.text()
        await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

        const location = resp.headers.get('Location')
        if (location) {
          pc.addEventListener('icecandidate', ({ candidate }) => {
            if (!candidate || stopped) return
            fetch(location, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/trickle-ice-sdpfrag' },
              body: `a=ice-ufrag:${candidate.usernameFragment}\r\na=candidate:${candidate.candidate}`,
            }).catch(() => {})
          })
        }

      } catch (e) {
        if (!stopped) scheduleRetry()
      }
    }

    const scheduleRetry = () => {
      if (stopped || gaveUpRef.current) return
      retryRef.current += 1
      setRetryCount(retryRef.current)
      if (retryRef.current >= MAX_RETRIES) {
        gaveUpRef.current = true
        onFallback?.()
        return
      }
      retryTimerRef.current = setTimeout(connect, RETRY_DELAY_MS)
    }

    connect()

    return () => {
      stopped = true
      clearTimeout(retryTimerRef.current)
      pcRef.current?.close()
      if (videoRef.current) videoRef.current.srcObject = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // only mount once — src is frozen in ref

  return (
    <div className="w-full h-full relative bg-black">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
      />
      {status !== 'playing' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-white/80 text-xs">
            <div className="w-9 h-9 border-2 border-white/20 border-t-white/80 rounded-full animate-spin" />
            <div className="px-2.5 py-1 rounded-md bg-black/50">
              {retryCount > 0
                ? `Переподключение ${retryCount}/${MAX_RETRIES}…`
                : 'Подключение к эфиру…'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
