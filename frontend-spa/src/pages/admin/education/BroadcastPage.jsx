import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Radio, Mic, Video, MicOff, VideoOff, Square, Users, Settings, CheckCircle2,
} from 'lucide-react'
import api from '../../../api/axios'

/**
 * Browser-based live streaming via WebRTC (WHIP protocol → Cloudflare Stream).
 * Route: /admin/education/broadcast/:id
 *
 * Auto-flips backend stream status to 'live' when broadcasting starts,
 * and to 'ended' when it stops. No separate "Готов" button needed.
 */
export default function BroadcastPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const [stream, setStream] = useState(null)
  const [error, setError] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [status, setStatus] = useState('idle') // idle | connecting | live | ended
  const [viewers, setViewers] = useState([])
  const [quality, setQuality] = useState('720p')
  const [showSettings, setShowSettings] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [redirectIn, setRedirectIn] = useState(null) // countdown seconds
  // Real WebRTC peer-connection state — separate from `status`. Even if `status='live'`
  // the actual data may not flow if ICE failed. Surface this so admin sees the truth.
  const [connState, setConnState] = useState('') // '' | 'connecting' | 'connected' | 'failed' | 'disconnected'
  const [cfStatus, setCfStatus] = useState(null) // {live_input_state, recordings_count, ...}
  // Track whether the page is in a secure (HTTPS) context — surface a banner if not.
  const insecure = typeof window !== 'undefined' && !window.isSecureContext

  const localVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const elapsedTimerRef = useRef(null)
  const statusRef = useRef(status) // keep ref in sync so cleanup sees latest status
  const whipResourceRef = useRef(null) // WHIP resource URL for DELETE on session end

  // Quality presets — width × height × fps × max video bitrate (kbps).
  // Without setting maxBitrate explicitly, WebRTC defaults to ~300kbps which
  // is what causes the "blurry / laggy" complaint.
  const QUALITIES = {
    '480p':  { width: 854,  height: 480,  frameRate: 30, videoKbps: 1200, label: 'SD 480p' },
    '720p':  { width: 1280, height: 720,  frameRate: 30, videoKbps: 2500, label: 'HD 720p' },
    '1080p': { width: 1920, height: 1080, frameRate: 30, videoKbps: 4500, label: 'Full HD 1080p' },
  }
  const AUDIO_KBPS = 128 // Opus stereo

  // Load stream info
  useEffect(() => {
    api.get('/education/streams/')
      .then(r => {
        const all = r.data?.results || r.data || []
        const found = all.find(s => s.id === id)
        if (found) setStream(found)
        else setError('Эфир не найден')
      })
      .catch(() => setError('Ошибка загрузки'))
  }, [id])

  // Poll viewers when live
  useEffect(() => {
    if (status !== 'live' || !id) return
    let stopped = false
    const pull = () => {
      api.get(`/education/streams/${id}/viewers/`)
        .then(r => { if (!stopped) setViewers(r.data || []) })
        .catch(() => {})
    }
    pull()
    const t = setInterval(pull, 5000)
    return () => { stopped = true; clearInterval(t) }
  }, [status, id])

  // Poll CF Stream live input status — proves video is actually reaching CF,
  // distinct from "we set status=live in our DB". This is THE diagnostic
  // for "broadcasting locally but students see black screen".
  useEffect(() => {
    if (status !== 'live' || !id) return
    let stopped = false
    const pull = () => {
      api.get(`/education/streams/${id}/cf-status/`)
        .then(r => { if (!stopped) setCfStatus(r.data) })
        .catch(() => {})
    }
    pull()
    const t = setInterval(pull, 8000)
    return () => { stopped = true; clearInterval(t) }
  }, [status, id])

  // Elapsed counter
  useEffect(() => {
    if (status !== 'live') {
      clearInterval(elapsedTimerRef.current)
      return
    }
    setElapsed(0)
    elapsedTimerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(elapsedTimerRef.current)
  }, [status])

  // Keep statusRef in sync
  useEffect(() => { statusRef.current = status }, [status])

  // Auto-redirect to streams list after broadcast ends (3 second countdown)
  useEffect(() => {
    if (status !== 'ended') return
    setRedirectIn(3)
    const interval = setInterval(() => {
      setRedirectIn(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          nav('/admin/education/streams')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [status, nav])

  // Cleanup on unmount: end the stream if still live
  useEffect(() => {
    return () => {
      if (statusRef.current === 'live') {
        api.post(`/education/streams/${id}/end/`).catch(() => {})
      }
      // DELETE the WHIP resource so Cloudflare creates the recording immediately
      const whipUrl = whipResourceRef.current
      if (whipUrl) { try { fetch(whipUrl, { method: 'DELETE' }).catch(() => {}) } catch {} }
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      pcRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Poll backend status — if stream was ended elsewhere (admin list), stop
  // the local WebRTC sender so two pages don't fight each other.
  useEffect(() => {
    if (status !== 'live' || !id) return
    let stopped = false
    const t = setInterval(() => {
      api.get('/education/streams/').then(r => {
        if (stopped) return
        const list = r.data?.results || r.data || []
        const fresh = list.find(s => s.id === id)
        if (fresh && fresh.status !== 'live') {
          // Stream ended externally → stop local broadcast immediately
          const whipUrl = whipResourceRef.current
          if (whipUrl) { whipResourceRef.current = null; try { fetch(whipUrl, { method: 'DELETE' }).catch(() => {}) } catch {} }
          localStreamRef.current?.getTracks().forEach(t => t.stop())
          pcRef.current?.close()
          if (localVideoRef.current) localVideoRef.current.srcObject = null
          setBroadcasting(false)
          setStatus('ended')
        }
      }).catch(() => {})
    }, 5000)
    return () => { stopped = true; clearInterval(t) }
  }, [status, id])

  // beforeunload — warn user if leaving while live
  useEffect(() => {
    if (status !== 'live') return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = 'Эфир ещё идёт. Если уйдёте — он завершится.'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  const fmtElapsed = sec => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const startBroadcast = async () => {
    if (!stream?.cf_webrtc_url) {
      setError('WebRTC URL не найден. Пересоздайте эфир.'); return
    }
    // CRITICAL: WHIP requires a secure context. On HTTP, fetch() to HTTPS WHIP
    // endpoint may succeed but WebRTC ICE will fail silently — no video reaches
    // CF Stream, students see eternal "Ждём сигнал". Block early with a clear msg.
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setError(
        'Эфир требует HTTPS. Сейчас сайт открыт по HTTP — браузер заблокирует ' +
        'передачу видео в Cloudflare. Попросите администратора настроить SSL ' +
        'для домена (sudo certbot --nginx -d crm.aiym-syry.kg).',
      )
      return
    }
    setError(''); setStatus('connecting')
    try {
      // Get camera + mic with chosen quality
      const q = QUALITIES[quality]
      const local = await navigator.mediaDevices.getUserMedia({
        video: { width: q.width, height: q.height, frameRate: q.frameRate },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      localStreamRef.current = local
      if (localVideoRef.current) localVideoRef.current.srcObject = local

      // Create peer connection
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      })
      pcRef.current = pc

      // Surface ICE / connection state to UI so admin (and us) can see when
      // WHIP actually works vs camera-only-locally.
      pc.addEventListener('iceconnectionstatechange', () => {
        setConnState(pc.iceConnectionState)
        // eslint-disable-next-line no-console
        console.log('[WHIP] iceConnectionState:', pc.iceConnectionState)
      })
      pc.addEventListener('connectionstatechange', () => {
        // eslint-disable-next-line no-console
        console.log('[WHIP] connectionState:', pc.connectionState)
      })

      // Add tracks + force high bitrate (default WebRTC = ~300 kbps → blurry)
      local.getTracks().forEach(t => {
        const sender = pc.addTrack(t, local)
        try {
          const params = sender.getParameters()
          if (!params.encodings) params.encodings = [{}]
          if (t.kind === 'video') {
            params.encodings[0].maxBitrate = q.videoKbps * 1000
            params.encodings[0].maxFramerate = q.frameRate
            params.degradationPreference = 'maintain-framerate'
          } else if (t.kind === 'audio') {
            params.encodings[0].maxBitrate = AUDIO_KBPS * 1000
          }
          sender.setParameters(params).catch(() => {})
        } catch {}
      })

      // Prefer H.264 (better Safari/iOS compatibility) then VP9 then VP8
      try {
        const transceivers = pc.getTransceivers()
        const videoTransceiver = transceivers.find(t => t.sender?.track?.kind === 'video')
        if (videoTransceiver && RTCRtpSender.getCapabilities) {
          const caps = RTCRtpSender.getCapabilities('video')
          if (caps?.codecs) {
            const ordered = [
              ...caps.codecs.filter(c => /h264/i.test(c.mimeType)),
              ...caps.codecs.filter(c => /vp9/i.test(c.mimeType)),
              ...caps.codecs.filter(c => /vp8/i.test(c.mimeType)),
              ...caps.codecs.filter(c => !/h264|vp8|vp9/i.test(c.mimeType)),
            ]
            videoTransceiver.setCodecPreferences?.(ordered)
          }
        }
      } catch {}

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Wait for ICE gathering
      await new Promise(resolve => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const check = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', check)
            resolve()
          }
        }
        pc.addEventListener('icegatheringstatechange', check)
        setTimeout(resolve, 3000) // fallback
      })

      // Send offer to Cloudflare WHIP endpoint
      const resp = await fetch(stream.cf_webrtc_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp,
      })
      if (!resp.ok) throw new Error(`WHIP error: ${resp.status} ${await resp.text()}`)
      const answer = await resp.text()
      // Save WHIP resource URL for DELETE on session end.
      // CF returns Location as a relative path like /token/webRTC/publish/sessionId.
      // We extract just the sessionId and append to the known absolute CF WHIP URL
      // to avoid URL resolution issues (relative path would resolve to our nginx).
      const location = resp.headers.get('Location') || ''
      const sessionId = location.split('/').pop()
      if (sessionId && sessionId.length > 10) {
        whipResourceRef.current = stream.cf_webrtc_url.replace(/\/$/, '') + '/' + sessionId
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })

      // AUTO go-live in backend so students can see the stream
      try {
        await api.post(`/education/streams/${id}/start/`)
      } catch (e) {
        console.warn('Failed to flip status to live:', e)
      }

      setBroadcasting(true)
      setStatus('live')
    } catch (e) {
      setError('Ошибка: ' + (e.message || e))
      setStatus('idle')
      localStreamRef.current?.getTracks().forEach(t => t.stop())
    }
  }

  // Send WHIP DELETE so Cloudflare closes the live input session immediately
  // and starts creating the recording. Without this CF waits for ICE timeout
  // (~60s) before starting to process the recording.
  const closeWhipSession = () => {
    const url = whipResourceRef.current
    if (!url) return
    whipResourceRef.current = null
    try { fetch(url, { method: 'DELETE' }).catch(() => {}) } catch {}
  }

  const stopBroadcast = async () => {
    closeWhipSession()
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    setBroadcasting(false)
    setStatus('ended')
    if (localVideoRef.current) localVideoRef.current.srcObject = null

    // AUTO end backend stream
    try {
      await api.post(`/education/streams/${id}/end/`)
    } catch {}
  }

  const toggleMic = () => {
    const at = localStreamRef.current?.getAudioTracks()?.[0]
    if (at) { at.enabled = !at.enabled; setMicOn(at.enabled) }
  }
  const toggleCam = () => {
    const vt = localStreamRef.current?.getVideoTracks()?.[0]
    if (vt) { vt.enabled = !vt.enabled; setCamOn(vt.enabled) }
  }

  return (
    <div style={{ minHeight: '100dvh' }} className="bg-gray-950 text-white flex flex-col">
      {/* HTTPS warning — covers the #1 cause of "broadcast goes nowhere" */}
      {insecure && (
        <div className="bg-amber-700/95 text-white px-4 py-3 text-sm flex items-center gap-3 border-b border-amber-900">
          <span className="text-base">⚠</span>
          <div className="flex-1">
            <strong>Сайт работает по HTTP.</strong> Эфир не сможет передавать видео в Cloudflare —
            браузер блокирует WebRTC. Запустите на сервере:{' '}
            <code className="bg-black/30 px-1.5 py-0.5 rounded text-xs">sudo certbot --nginx -d crm.aiym-syry.kg</code>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-gray-800">
        <Radio size={20} className="text-rose-400 shrink-0" />
        <h1 className="font-semibold text-sm sm:text-base min-w-0 truncate flex-1">
          Студия эфира
          {stream && <span className="ml-2 text-gray-400 font-normal">· {stream.title}</span>}
        </h1>
        {status === 'live' && (
          <>
            <span className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-rose-600 text-[11px] sm:text-sm font-bold shrink-0">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="text-xs sm:text-sm font-mono text-gray-300 shrink-0">{fmtElapsed(elapsed)}</span>
            {/* Real WebRTC state — distinct from "LIVE" (which only flips backend status). */}
            {connState && connState !== 'connected' && connState !== 'completed' && (
              <span
                className={`text-[10px] sm:text-xs px-2 py-0.5 rounded-md shrink-0 ${
                  connState === 'failed' || connState === 'disconnected'
                    ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40'
                    : 'bg-gray-700 text-gray-300'
                }`}
                title="Состояние WebRTC-соединения с Cloudflare"
              >
                {connState === 'checking' && 'Подключение…'}
                {connState === 'failed' && '⚠ Нет связи с CF'}
                {connState === 'disconnected' && '⚠ Связь потеряна'}
                {connState === 'closed' && 'Закрыто'}
                {!['checking', 'failed', 'disconnected', 'closed'].includes(connState) && connState}
              </span>
            )}
          </>
        )}
        {status !== 'live' && (
          <button
            onClick={() => setShowSettings(s => !s)}
            aria-label="Настройки качества"
            aria-expanded={showSettings}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-rose-400/40 shrink-0"
            title="Настройки"
          >
            <Settings size={18} />
          </button>
        )}
      </div>

      {/* Settings dropdown (idle) */}
      {showSettings && status !== 'live' && (
        <div className="px-3 sm:px-5 py-3 bg-gray-900 border-b border-gray-800 flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-xs text-gray-400 shrink-0">Качество:</span>
          {Object.keys(QUALITIES).map(k => (
            <button
              key={k}
              onClick={() => setQuality(k)}
              disabled={status !== 'idle'}
              aria-pressed={quality === k}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition focus:outline-none focus:ring-2 focus:ring-rose-400/40 ${
                quality === k ? 'bg-rose-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {QUALITIES[k].label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row gap-3 sm:gap-4 p-3 sm:p-4 lg:p-6 min-h-0">
        {/* Left — preview + controls */}
        <div className="flex-1 flex flex-col items-center justify-center gap-3 sm:gap-4 min-h-0">
          {error && (
            <div className="w-full max-w-2xl p-4 bg-rose-900/60 rounded-xl text-rose-200 text-sm">{error}</div>
          )}

          {/* CF Stream live diagnostic — proves whether CF is actually receiving video */}
          {status === 'live' && cfStatus && (
            <div className={`w-full max-w-2xl px-4 py-2 rounded-xl text-xs flex items-center gap-3 ${
              cfStatus.live_input_state === 'connected'
                ? 'bg-emerald-900/40 text-emerald-200 border border-emerald-700/40'
                : 'bg-amber-900/50 text-amber-100 border border-amber-700/40'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                cfStatus.live_input_state === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`} />
              <div className="flex-1">
                {cfStatus.live_input_state === 'connected' ? (
                  <>Cloudflare получает видео ✓ — ученики видят эфир.</>
                ) : (
                  <>Cloudflare НЕ получает видео ({cfStatus.live_input_state || '—'}). Возможно WebRTC не подключился.</>
                )}
              </div>
              {cfStatus.recordings_count > 0 && (
                <span className="text-[10px] opacity-80">записей: {cfStatus.recordings_count}</span>
              )}
            </div>
          )}

          {/* Preview */}
          <div className="w-full max-w-2xl aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {!broadcasting && status !== 'live' && (
              <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                {status === 'ended' ? 'Трансляция завершена' : 'Нажмите «Начать», чтобы запустить камеру'}
              </div>
            )}
            {!camOn && broadcasting && (
              <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
                <VideoOff size={48} className="text-gray-600" />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-center">
            {broadcasting && (
              <>
                <button
                  onClick={toggleMic}
                  aria-label={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
                  aria-pressed={!micOn}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition focus:outline-none focus:ring-2 focus:ring-rose-400/40 ${
                    micOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                  title={micOn ? 'Выключить микрофон' : 'Включить микрофон'}
                >
                  {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button
                  onClick={toggleCam}
                  aria-label={camOn ? 'Выключить камеру' : 'Включить камеру'}
                  aria-pressed={!camOn}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition focus:outline-none focus:ring-2 focus:ring-rose-400/40 ${
                    camOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                  title={camOn ? 'Выключить камеру' : 'Включить камеру'}
                >
                  {camOn ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
              </>
            )}

            {!broadcasting && status !== 'ended' && (
              <button
                onClick={startBroadcast}
                disabled={status === 'connecting' || !stream?.cf_webrtc_url}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 disabled:opacity-50 font-semibold text-base sm:text-lg transition shadow-lg focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                <Radio size={20} />
                {status === 'connecting' ? 'Подключение…' : 'Начать эфир'}
              </button>
            )}

            {broadcasting && (
              <button
                onClick={stopBroadcast}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl bg-rose-700 hover:bg-rose-800 font-semibold text-base sm:text-lg transition shadow-lg focus:outline-none focus:ring-2 focus:ring-rose-300"
              >
                <Square size={20} /> Завершить эфир
              </button>
            )}
          </div>

          {status === 'idle' && (
            <p className="text-gray-500 text-xs text-center max-w-md">
              Разрешите доступ к камере и микрофону. Эфир пойдёт в Cloudflare Stream — ученики увидят вас в кабинете.
            </p>
          )}
          {status === 'ended' && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-semibold text-lg">Эфир завершён</p>
                <p className="text-gray-400 text-sm mt-1">
                  Переход к списку эфиров через{' '}
                  <span className="text-rose-400 font-bold">{redirectIn}</span> сек…
                </p>
              </div>
              <button
                onClick={() => nav('/admin/education/streams')}
                className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium transition"
              >
                Перейти сейчас
              </button>
            </div>
          )}
        </div>

        {/* Right — viewers panel (only visible when live) */}
        {status === 'live' && (
          <div className="w-full lg:w-72 shrink-0 bg-gray-900 rounded-2xl border border-gray-800 p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-800">
              <Users size={16} className="text-rose-400" />
              <h3 className="font-semibold text-sm">На эфире ({viewers.length})</h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {viewers.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-6">
                  Зрители ещё не подключились
                </p>
              )}
              {viewers.map(v => (
                <div key={v.id} className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(v.client_name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{v.client_name || 'Гость'}</p>
                    <p className="text-[10px] text-emerald-400">в эфире</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
