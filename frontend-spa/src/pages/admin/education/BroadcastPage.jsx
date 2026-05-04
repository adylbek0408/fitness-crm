import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Radio, Mic, Video, MicOff, VideoOff, Square, Users, Settings, CheckCircle2,
  Upload, AlertCircle,
} from 'lucide-react'
import api from '../../../api/axios'

/**
 * Browser-based live streaming via WebRTC (WHIP protocol → Cloudflare Stream).
 * Route: /admin/education/broadcast/:id
 *
 * Records the local MediaStream during broadcast with MediaRecorder, then uploads
 * the recording directly to Cloudflare Stream via a direct-upload URL after the
 * broadcast ends. This bypasses Cloudflare's broken automatic WHIP recording.
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
  const [redirectIn, setRedirectIn] = useState(null)
  const [connState, setConnState] = useState('')
  const [cfStatus, setCfStatus] = useState(null)
  // Recording upload state: null | 'uploading' | 'done' | 'error'
  const [uploadState, setUploadState] = useState(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const insecure = typeof window !== 'undefined' && !window.isSecureContext

  const localVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const elapsedTimerRef = useRef(null)
  const statusRef = useRef(status)
  const whipResourceRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const recordedChunksRef = useRef([])

  const QUALITIES = {
    '480p':  { width: 854,  height: 480,  frameRate: 30, videoKbps: 1200, label: 'SD 480p' },
    '720p':  { width: 1280, height: 720,  frameRate: 30, videoKbps: 2500, label: 'HD 720p' },
    '1080p': { width: 1920, height: 1080, frameRate: 30, videoKbps: 4500, label: 'Full HD 1080p' },
  }
  const AUDIO_KBPS = 128

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

  useEffect(() => {
    if (status !== 'live') {
      clearInterval(elapsedTimerRef.current)
      return
    }
    setElapsed(0)
    elapsedTimerRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(elapsedTimerRef.current)
  }, [status])

  useEffect(() => { statusRef.current = status }, [status])

  // Auto-redirect after broadcast ends — pause while upload is in progress
  useEffect(() => {
    if (status !== 'ended' || uploadState === 'uploading') return
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
  }, [status, uploadState, nav])

  useEffect(() => {
    return () => {
      if (statusRef.current === 'live') {
        api.post(`/education/streams/${id}/end/`).catch(() => {})
      }
      const whipUrl = whipResourceRef.current
      if (whipUrl) { try { fetch(whipUrl, { method: 'DELETE' }).catch(() => {}) } catch {} }
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      pcRef.current?.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status !== 'live' || !id) return
    let stopped = false
    const t = setInterval(() => {
      api.get('/education/streams/').then(r => {
        if (stopped) return
        const list = r.data?.results || r.data || []
        const fresh = list.find(s => s.id === id)
        if (fresh && fresh.status !== 'live') {
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

  // Warn user not to close tab while recording is uploading
  useEffect(() => {
    if (uploadState !== 'uploading') return
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = 'Запись ещё загружается. Не закрывайте вкладку!'
      return e.returnValue
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [uploadState])

  const fmtElapsed = sec => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  // --- Local recording helpers (MediaRecorder) ---

  const startLocalRecording = (localStream, q) => {
    try {
      const mimeType = [
        'video/webm;codecs=h264,opus',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ].find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm'
      recordedChunksRef.current = []
      const mr = new MediaRecorder(localStream, {
        mimeType,
        videoBitsPerSecond: q.videoKbps * 1000,
      })
      mr.ondataavailable = e => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data) }
      mediaRecorderRef.current = mr
      mr.start(10000) // collect a chunk every 10 s
      // eslint-disable-next-line no-console
      console.log('[MediaRecorder] started, mimeType:', mimeType)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[MediaRecorder] failed to start:', e)
    }
  }

  const stopLocalRecording = () => new Promise(resolve => {
    const mr = mediaRecorderRef.current
    if (!mr || mr.state === 'inactive') { resolve(); return }
    mr.addEventListener('stop', resolve, { once: true })
    mr.stop()
  })

  const uploadLocalRecording = async () => {
    const chunks = recordedChunksRef.current
    if (!chunks?.length) return
    setUploadState('uploading')
    setUploadProgress(0)
    try {
      const { data } = await api.get(`/education/streams/${id}/recording-upload-url/`)
      const blob = new Blob(chunks, { type: 'video/webm' })
      // eslint-disable-next-line no-console
      console.log('[Recording] uploading', (blob.size / 1024 / 1024).toFixed(1), 'MB to CF Stream')
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadProgress(Math.round(e.loaded / e.total * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve()
          else reject(new Error(`CF upload HTTP ${xhr.status}: ${xhr.responseText?.slice(0, 200)}`))
        }
        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.open('PUT', data.upload_url)
        xhr.setRequestHeader('Content-Type', 'video/webm')
        xhr.send(blob)
      })
      await api.post(`/education/streams/${id}/save-recording/`, { video_uid: data.video_uid })
      setUploadState('done')
      // eslint-disable-next-line no-console
      console.log('[Recording] upload complete, video_uid:', data.video_uid)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Recording] upload failed:', e)
      setUploadState('error')
    }
  }

  const retryUpload = () => {
    setUploadState(null)
    uploadLocalRecording()
  }

  // --- Broadcast controls ---

  const startBroadcast = async () => {
    if (!stream?.cf_webrtc_url) {
      setError('WebRTC URL не найден. Пересоздайте эфир.'); return
    }
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
      const q = QUALITIES[quality]
      const local = await navigator.mediaDevices.getUserMedia({
        video: { width: q.width, height: q.height, frameRate: q.frameRate },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      localStreamRef.current = local
      if (localVideoRef.current) localVideoRef.current.srcObject = local

      // Start local recording immediately so nothing is missed
      startLocalRecording(local, q)

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
      })
      pcRef.current = pc

      pc.addEventListener('iceconnectionstatechange', () => {
        setConnState(pc.iceConnectionState)
        // eslint-disable-next-line no-console
        console.log('[WHIP] iceConnectionState:', pc.iceConnectionState)
      })
      pc.addEventListener('connectionstatechange', () => {
        // eslint-disable-next-line no-console
        console.log('[WHIP] connectionState:', pc.connectionState)
      })

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

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      await new Promise(resolve => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const check = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', check)
            resolve()
          }
        }
        pc.addEventListener('icegatheringstatechange', check)
        setTimeout(resolve, 3000)
      })

      const resp = await fetch(stream.cf_webrtc_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp,
      })
      if (!resp.ok) throw new Error(`WHIP error: ${resp.status} ${await resp.text()}`)
      const answer = await resp.text()
      const location = resp.headers.get('Location') || ''
      // eslint-disable-next-line no-console
      console.log('[WHIP] Location header:', location)
      // eslint-disable-next-line no-console
      console.log('[WHIP] Response headers:', Object.fromEntries([...resp.headers.entries()]))
      if (location) {
        try {
          const resolved = new URL(location, stream.cf_webrtc_url).href
          whipResourceRef.current = resolved
          // eslint-disable-next-line no-console
          console.log('[WHIP] DELETE resource URL:', resolved)
        } catch {
          const sessionId = location.split('/').pop()
          if (sessionId && sessionId.length > 4) {
            whipResourceRef.current = stream.cf_webrtc_url.replace(/\/$/, '') + '/' + sessionId
          }
        }
      } else {
        // eslint-disable-next-line no-console
        console.warn('[WHIP] Location header missing — DELETE will not be sent.')
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })

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

  const closeWhipSession = () => {
    const url = whipResourceRef.current
    if (!url) return
    whipResourceRef.current = null
    try { fetch(url, { method: 'DELETE' }).catch(() => {}) } catch {}
  }

  const stopBroadcast = async () => {
    const whipUrl = whipResourceRef.current
    // Stop MediaRecorder first to collect the final chunk before tracks are killed
    await stopLocalRecording()
    closeWhipSession()
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    setBroadcasting(false)
    setStatus('ended')
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    try {
      await api.post(`/education/streams/${id}/end/`, whipUrl ? { whip_resource_url: whipUrl } : {})
    } catch {}
    // Upload recording to CF Stream in the background (non-blocking UI)
    uploadLocalRecording()
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
            <div className="flex flex-col items-center gap-4 text-center w-full max-w-md">
              {/* Upload progress */}
              {uploadState === 'uploading' && (
                <div className="w-full bg-gray-900 rounded-2xl border border-gray-700 p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <Upload size={20} className="text-blue-400 animate-bounce shrink-0" />
                    <div className="text-sm font-medium">Загружаем запись эфира…</div>
                    <span className="ml-auto text-xs text-gray-400 font-mono">{uploadProgress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Не закрывайте вкладку до завершения загрузки</p>
                </div>
              )}

              {uploadState === 'done' && (
                <div className="w-full flex items-center gap-3 bg-emerald-900/40 border border-emerald-700/40 rounded-xl px-4 py-3 text-sm text-emerald-200">
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                  Запись сохранена — она появится в разделе «Уроки»
                </div>
              )}

              {uploadState === 'error' && (
                <div className="w-full bg-rose-900/50 border border-rose-700/40 rounded-xl px-4 py-3 text-sm text-rose-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={16} className="shrink-0" />
                    Ошибка загрузки записи
                  </div>
                  <button
                    onClick={retryUpload}
                    className="text-xs underline text-rose-300 hover:text-rose-100"
                  >
                    Повторить попытку
                  </button>
                </div>
              )}

              {/* Success block + redirect countdown (shown when upload is done or there was no recording) */}
              {uploadState !== 'uploading' && (
                <>
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
                </>
              )}
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
