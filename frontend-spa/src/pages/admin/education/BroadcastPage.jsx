import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Radio, Mic, MicOff, Video, VideoOff, Square,
  Users, ChevronLeft, CheckCircle2, Upload, AlertCircle,
  FlipHorizontal2, CameraIcon,
} from 'lucide-react'
import api from '../../../api/axios'

/**
 * Full-screen broadcast studio — Instagram/Telegram Live style.
 *
 * Mobile-first: fills the screen, portrait or landscape.
 * iOS-safe: detects mp4 support so MediaRecorder works on Safari.
 * Camera flip: switches front/back camera without restarting the stream.
 */
export default function BroadcastPage() {
  const { id } = useParams()
  const nav = useNavigate()

  const [stream, setStream]           = useState(null)
  const [error, setError]             = useState('')
  const [status, setStatus]           = useState('idle') // idle | connecting | live | ended
  const [broadcasting, setBroadcasting] = useState(false)
  const [micOn, setMicOn]             = useState(true)
  const [camOn, setCamOn]             = useState(true)
  const [facingMode, setFacingMode]   = useState('user') // 'user' | 'environment'
  const [mirrored, setMirrored]       = useState(false)  // manual mirror toggle
  const [quality, setQuality]         = useState('720p')
  const [showSettings, setShowSettings] = useState(false)
  const [elapsed, setElapsed]         = useState(0)
  const [viewers, setViewers]         = useState([])
  const [connState, setConnState]     = useState('')
  const [cfStatus, setCfStatus]       = useState(null)
  const [redirectIn, setRedirectIn]   = useState(null)
  const [uploadState, setUploadState] = useState(null)   // null | 'uploading' | 'done' | 'error'
  const [uploadProgress, setUploadProgress] = useState(0)
  const [flipping, setFlipping]       = useState(false)

  const localVideoRef   = useRef(null)
  const pcRef           = useRef(null)
  const localStreamRef  = useRef(null)
  const elapsedRef      = useRef(null)
  const statusRef       = useRef(status)
  const whipResourceRef = useRef(null)
  const mediaRecorderRef  = useRef(null)
  const recordedChunksRef = useRef([])
  const mimeTypeRef       = useRef('')

  const insecure = typeof window !== 'undefined' && !window.isSecureContext

  const QUALITIES = {
    '480p':  { width: 854,  height: 480,  frameRate: 30, videoKbps: 1200 },
    '720p':  { width: 1280, height: 720,  frameRate: 30, videoKbps: 2500 },
    '1080p': { width: 1920, height: 1080, frameRate: 30, videoKbps: 4500 },
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const fmtElapsed = sec => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const getSupportedMimeType = () => {
    const types = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', // iOS Safari
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ]
    return types.find(t => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } }) || ''
  }

  const buildConstraints = (q, facing) => ({
    video: {
      facingMode: { ideal: facing },
      width:     { ideal: q.width },
      height:    { ideal: q.height },
      frameRate: { ideal: q.frameRate },
    },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

  // ─── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    api.get('/education/streams/')
      .then(r => {
        const all = r.data?.results || r.data || []
        const found = all.find(s => s.id === id)
        if (found) setStream(found); else setError('Эфир не найден')
      })
      .catch(() => setError('Ошибка загрузки'))
  }, [id])

  useEffect(() => { statusRef.current = status }, [status])

  // ─── Timers / polling ─────────────────────────────────────────────────────

  useEffect(() => {
    if (status !== 'live') { clearInterval(elapsedRef.current); return }
    setElapsed(0)
    elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000)
    return () => clearInterval(elapsedRef.current)
  }, [status])

  useEffect(() => {
    if (status !== 'live' || !id) return
    let ok = true
    const pull = () => api.get(`/education/streams/${id}/viewers/`).then(r => { if (ok) setViewers(r.data || []) }).catch(() => {})
    pull(); const t = setInterval(pull, 5000)
    return () => { ok = false; clearInterval(t) }
  }, [status, id])

  useEffect(() => {
    if (status !== 'live' || !id) return
    let ok = true
    const pull = () => api.get(`/education/streams/${id}/cf-status/`).then(r => { if (ok) setCfStatus(r.data) }).catch(() => {})
    pull(); const t = setInterval(pull, 8000)
    return () => { ok = false; clearInterval(t) }
  }, [status, id])

  // Remote end detection
  useEffect(() => {
    if (status !== 'live' || !id) return
    let ok = true
    const t = setInterval(() => {
      api.get('/education/streams/').then(r => {
        if (!ok) return
        const fresh = (r.data?.results || r.data || []).find(s => s.id === id)
        if (fresh && fresh.status !== 'live') {
          whipResourceRef.current = null
          localStreamRef.current?.getTracks().forEach(t => t.stop())
          pcRef.current?.close()
          if (localVideoRef.current) localVideoRef.current.srcObject = null
          setBroadcasting(false); setStatus('ended')
        }
      }).catch(() => {})
    }, 5000)
    return () => { ok = false; clearInterval(t) }
  }, [status, id])

  // Auto-redirect after broadcast ends
  useEffect(() => {
    if (status !== 'ended' || uploadState === 'uploading') return
    setRedirectIn(4)
    const interval = setInterval(() => {
      setRedirectIn(prev => {
        if (prev <= 1) { clearInterval(interval); nav('/admin/education/streams'); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [status, uploadState, nav])

  // Cleanup on unmount
  useEffect(() => () => {
    if (statusRef.current === 'live') api.post(`/education/streams/${id}/end/`).catch(() => {})
    const whipUrl = whipResourceRef.current
    if (whipUrl) { try { fetch(whipUrl, { method: 'DELETE' }).catch(() => {}) } catch {} }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // beforeunload guards
  useEffect(() => {
    if (status !== 'live') return
    const h = e => { e.preventDefault(); e.returnValue = 'Эфир ещё идёт. Если уйдёте — он завершится.'; return e.returnValue }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [status])

  useEffect(() => {
    if (uploadState !== 'uploading') return
    const h = e => { e.preventDefault(); e.returnValue = 'Запись ещё загружается. Не закрывайте вкладку!'; return e.returnValue }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [uploadState])

  // ─── Recording helpers ────────────────────────────────────────────────────

  const startLocalRecording = localStream => {
    try {
      const mimeType = getSupportedMimeType()
      mimeTypeRef.current = mimeType
      recordedChunksRef.current = []
      const mr = new MediaRecorder(localStream, mimeType ? { mimeType, videoBitsPerSecond: QUALITIES[quality].videoKbps * 1000 } : {})
      mr.ondataavailable = e => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data) }
      mediaRecorderRef.current = mr
      mr.start(10000)
    } catch (e) {
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
    setUploadState('uploading'); setUploadProgress(0)
    try {
      const mimeType = mimeTypeRef.current || 'video/webm'
      const isMP4 = mimeType.includes('mp4')
      const blob = new Blob(chunks, { type: mimeType })
      const filename = isMP4 ? 'recording.mp4' : 'recording.webm'
      const formData = new FormData()
      formData.append('file', new File([blob], filename, { type: mimeType }))
      await api.post(`/education/streams/${id}/upload-recording/`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => { if (e.total) setUploadProgress(Math.min(90, Math.round(e.loaded / e.total * 90))) },
        timeout: 0,
      })
      setUploadProgress(100); setUploadState('done')
    } catch (e) {
      console.error('[Recording] upload failed:', e)
      setUploadState('error')
    }
  }

  // ─── Broadcast controls ───────────────────────────────────────────────────

  const startBroadcast = async () => {
    if (!stream?.cf_webrtc_url) { setError('WebRTC URL не найден. Пересоздайте эфир.'); return }
    if (insecure) { setError('Эфир требует HTTPS. Откройте сайт по HTTPS.'); return }
    setError(''); setStatus('connecting')
    try {
      const q = QUALITIES[quality]
      const local = await navigator.mediaDevices.getUserMedia(buildConstraints(q, facingMode))
      localStreamRef.current = local
      if (localVideoRef.current) localVideoRef.current.srcObject = local

      startLocalRecording(local)

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })
      pcRef.current = pc
      pc.addEventListener('iceconnectionstatechange', () => setConnState(pc.iceConnectionState))

      local.getTracks().forEach(t => {
        const sender = pc.addTrack(t, local)
        try {
          const params = sender.getParameters()
          if (!params.encodings) params.encodings = [{}]
          if (t.kind === 'video') {
            params.encodings[0].maxBitrate = q.videoKbps * 1000
            params.encodings[0].maxFramerate = q.frameRate
          } else {
            params.encodings[0].maxBitrate = 128000
          }
          sender.setParameters(params).catch(() => {})
        } catch {}
      })

      try {
        const transceivers = pc.getTransceivers()
        const vt = transceivers.find(t => t.sender?.track?.kind === 'video')
        if (vt && RTCRtpSender.getCapabilities) {
          const caps = RTCRtpSender.getCapabilities('video')
          if (caps?.codecs) {
            const ordered = [
              ...caps.codecs.filter(c => /h264/i.test(c.mimeType)),
              ...caps.codecs.filter(c => /vp9/i.test(c.mimeType)),
              ...caps.codecs.filter(c => /vp8/i.test(c.mimeType)),
              ...caps.codecs.filter(c => !/h264|vp8|vp9/i.test(c.mimeType)),
            ]
            vt.setCodecPreferences?.(ordered)
          }
        }
      } catch {}

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await new Promise(resolve => {
        if (pc.iceGatheringState === 'complete') { resolve(); return }
        const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); resolve() } }
        pc.addEventListener('icegatheringstatechange', check)
        setTimeout(resolve, 3000)
      })

      const resp = await fetch(stream.cf_webrtc_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: pc.localDescription.sdp,
      })
      if (!resp.ok) throw new Error(`WHIP error: ${resp.status}`)
      const answer = await resp.text()
      const location = resp.headers.get('Location') || ''
      if (location) {
        try {
          whipResourceRef.current = new URL(location, stream.cf_webrtc_url).href
        } catch {
          const seg = location.split('/').pop()
          if (seg && seg.length > 4) whipResourceRef.current = stream.cf_webrtc_url.replace(/\/$/, '') + '/' + seg
        }
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })

      try { await api.post(`/education/streams/${id}/start/`) } catch {}

      setBroadcasting(true); setStatus('live')
    } catch (e) {
      setError('Ошибка: ' + (e.message || e))
      setStatus('idle')
      localStreamRef.current?.getTracks().forEach(t => t.stop())
    }
  }

  const stopBroadcast = async () => {
    const whipUrl = whipResourceRef.current
    await stopLocalRecording()
    if (whipUrl) { whipResourceRef.current = null; try { fetch(whipUrl, { method: 'DELETE' }).catch(() => {}) } catch {} }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    setBroadcasting(false); setStatus('ended')
    try { await api.post(`/education/streams/${id}/end/`, whipUrl ? { whip_resource_url: whipUrl } : {}) } catch {}
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

  const flipCamera = async () => {
    if (!broadcasting || flipping) return
    setFlipping(true)
    const newFacing = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newFacing)
    try {
      const q = QUALITIES[quality]
      const newStream = await navigator.mediaDevices.getUserMedia(buildConstraints(q, newFacing))
      const newVideoTrack = newStream.getVideoTracks()[0]
      // Replace track in RTCPeerConnection
      if (pcRef.current) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
        if (sender) await sender.replaceTrack(newVideoTrack)
      }
      // Stop old video tracks
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop())
      // Rebuild combined stream
      const audioTracks = localStreamRef.current?.getAudioTracks() || []
      const combined = new MediaStream([...audioTracks, newVideoTrack])
      localStreamRef.current = combined
      if (localVideoRef.current) localVideoRef.current.srcObject = combined
    } catch (e) {
      console.warn('flipCamera failed:', e)
    } finally {
      setFlipping(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const isLive = status === 'live'
  const isEnded = status === 'ended'

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none"
      style={{ WebkitUserSelect: 'none', touchAction: 'manipulation' }}>

      {/* HTTPS warning banner */}
      {insecure && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-amber-700/95 text-white px-4 py-2 text-xs flex items-center gap-2">
          <span>⚠</span>
          <span>Сайт работает по HTTP. Эфир не передаст видео — нужен HTTPS.</span>
        </div>
      )}

      {/* ── Camera preview ── */}
      <video
        ref={localVideoRef}
        autoPlay muted playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: mirrored ? 'scaleX(-1)' : 'none', transition: 'transform 0.2s' }}
      />

      {/* Idle placeholder */}
      {!broadcasting && !isEnded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur flex items-center justify-center mx-auto mb-4">
              <Radio size={36} className="text-rose-400" />
            </div>
            <p className="text-white/70 text-sm">Нажмите кнопку ниже, чтобы начать</p>
          </div>
        </div>
      )}

      {/* Cam-off overlay */}
      {!camOn && broadcasting && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
          <VideoOff size={64} className="text-gray-600" />
        </div>
      )}

      {/* ── Top gradient ── */}
      <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-black/70 via-black/30 to-transparent pointer-events-none" />

      {/* ── Top bar ── */}
      <div className={`absolute top-0 left-0 right-0 flex items-center gap-3 px-4 ${insecure ? 'pt-10' : 'pt-3'} pb-2`}>
        <button
          onClick={() => nav('/admin/education/streams')}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center hover:bg-black/60 active:scale-95 transition shrink-0"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate leading-tight">{stream?.title || 'Эфир'}</p>
          {isLive && connState && connState !== 'connected' && connState !== 'completed' && (
            <p className="text-[10px] text-amber-400 leading-tight">⚠ {connState === 'failed' ? 'Нет связи с CF' : connState === 'disconnected' ? 'Связь потеряна' : connState}</p>
          )}
        </div>

        {isLive && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600 text-xs font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="font-mono text-sm tabular-nums text-white/90">{fmtElapsed(elapsed)}</span>
          </div>
        )}

        {/* Settings gear (idle only) */}
        {!isLive && !isEnded && (
          <button
            onClick={() => setShowSettings(s => !s)}
            className="w-9 h-9 rounded-full bg-black/40 backdrop-blur flex items-center justify-center hover:bg-black/60 active:scale-95 transition text-sm font-medium shrink-0"
          >
            HD
          </button>
        )}
      </div>

      {/* ── Settings panel ── */}
      {showSettings && !isLive && (
        <div className="absolute top-16 left-4 right-4 z-30 bg-black/80 backdrop-blur rounded-2xl p-4 border border-white/10">
          <p className="text-xs text-white/50 mb-3 font-medium">Качество видео</p>
          <div className="flex gap-2">
            {Object.entries({ '480p': 'SD 480p', '720p': 'HD 720p', '1080p': 'FHD 1080p' }).map(([k, label]) => (
              <button key={k} onClick={() => { setQuality(k); setShowSettings(false) }}
                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition ${quality === k ? 'bg-rose-500 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── CF status indicator ── */}
      {isLive && cfStatus && (
        <div className={`absolute top-16 left-4 right-4 z-20 flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur text-xs ${cfStatus.live_input_state === 'connected' ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/40' : 'bg-amber-900/60 text-amber-100 border border-amber-700/40'}`}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${cfStatus.live_input_state === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
          {cfStatus.live_input_state === 'connected'
            ? 'Cloudflare получает видео ✓ — ученики видят вас'
            : `CF не получает видео (${cfStatus.live_input_state || '—'})`}
          {cfStatus.recordings_count > 0 && <span className="ml-auto opacity-70">●rec</span>}
        </div>
      )}

      {/* ── Viewers bubble ── */}
      {isLive && (
        <div className="absolute top-1/2 right-4 -translate-y-1/2 z-20 flex flex-col gap-2 items-center">
          <div className="bg-black/50 backdrop-blur rounded-full px-3 py-1.5 flex items-center gap-1.5">
            <Users size={14} className="text-rose-300" />
            <span className="text-sm font-bold">{viewers.length}</span>
          </div>
          {viewers.slice(0, 5).map(v => (
            <div key={v.id} className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-black/30">
              {(v.client_name || '?').charAt(0).toUpperCase()}
            </div>
          ))}
          {viewers.length > 5 && (
            <div className="text-[10px] text-white/60 text-center">+{viewers.length - 5}</div>
          )}
        </div>
      )}

      {/* ── Error ── */}
      {error && (
        <div className="absolute top-1/3 left-4 right-4 z-30 bg-rose-900/90 backdrop-blur rounded-2xl p-4 text-sm text-rose-100 border border-rose-700/50">
          <AlertCircle size={16} className="inline mr-2 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Bottom gradient ── */}
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />

      {/* ── Bottom controls ── */}
      {!isEnded && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center gap-4 pb-10 pt-4 px-8">
          {/* Mirror toggle hint (small, above controls) */}
          {broadcasting && (
            <button
              onClick={() => setMirrored(m => !m)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] transition ${mirrored ? 'bg-white/20 text-white' : 'bg-black/30 text-white/50'} backdrop-blur`}
            >
              <FlipHorizontal2 size={12} /> {mirrored ? 'Зеркало вкл.' : 'Зеркало выкл.'}
            </button>
          )}

          <div className="flex items-center justify-center gap-6">
            {/* Mic */}
            {broadcasting && (
              <button onClick={toggleMic}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition backdrop-blur ${micOn ? 'bg-white/20 border border-white/30' : 'bg-rose-600'}`}>
                {micOn ? <Mic size={22} /> : <MicOff size={22} />}
              </button>
            )}

            {/* Start / Stop — center hero button */}
            {!broadcasting && (
              <button onClick={startBroadcast} disabled={status === 'connecting' || !stream?.cf_webrtc_url}
                className="w-20 h-20 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-95 disabled:opacity-50 flex flex-col items-center justify-center shadow-2xl shadow-rose-900/60 transition border-4 border-rose-400/50">
                {status === 'connecting'
                  ? <span className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  : <><Radio size={28} /><span className="text-[10px] font-bold mt-0.5 tracking-wide">ЭФИР</span></>
                }
              </button>
            )}
            {broadcasting && (
              <button onClick={stopBroadcast}
                className="w-20 h-20 rounded-full bg-rose-700 hover:bg-rose-800 active:scale-95 flex flex-col items-center justify-center shadow-2xl shadow-rose-900/60 transition border-4 border-rose-600/50">
                <Square size={26} />
                <span className="text-[10px] font-bold mt-0.5 tracking-wide">СТОП</span>
              </button>
            )}

            {/* Camera (flip / toggle) */}
            {broadcasting && (
              <>
                <button onClick={flipCamera} disabled={flipping}
                  className="w-14 h-14 rounded-full bg-white/20 border border-white/30 flex items-center justify-center shadow-lg active:scale-95 disabled:opacity-50 transition backdrop-blur">
                  <CameraIcon size={22} className={flipping ? 'animate-pulse' : ''} />
                </button>
              </>
            )}
            {!broadcasting && (
              <button onClick={toggleCam}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition backdrop-blur ${camOn ? 'bg-white/20 border border-white/30' : 'bg-rose-600'}`}>
                {camOn ? <Video size={22} /> : <VideoOff size={22} />}
              </button>
            )}
          </div>

          {/* Cam toggle when live */}
          {broadcasting && (
            <button onClick={toggleCam}
              className={`px-4 py-2 rounded-full text-xs flex items-center gap-2 backdrop-blur transition active:scale-95 ${camOn ? 'bg-white/15 border border-white/20' : 'bg-rose-600'}`}>
              {camOn ? <Video size={14} /> : <VideoOff size={14} />}
              {camOn ? 'Камера вкл.' : 'Камера выкл.'}
            </button>
          )}
        </div>
      )}

      {/* ── Ended overlay ── */}
      {isEnded && (
        <div className="absolute inset-0 z-40 bg-black/85 backdrop-blur flex flex-col items-center justify-center gap-5 px-6">

          {uploadState === 'uploading' && (
            <div className="w-full max-w-sm bg-white/10 rounded-3xl border border-white/20 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Upload size={22} className="text-blue-400 animate-bounce shrink-0" />
                <div>
                  <p className="font-semibold text-sm">
                    {uploadProgress < 90 ? 'Загружаем запись…' : 'Отправляем в Cloudflare…'}
                  </p>
                  <p className="text-xs text-white/50 mt-0.5">Не закрывайте страницу</p>
                </div>
                <span className="ml-auto font-mono text-sm text-blue-300">{uploadProgress}%</span>
              </div>
              <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {uploadState === 'done' && (
            <div className="flex items-center gap-3 bg-emerald-900/60 border border-emerald-600/40 rounded-2xl px-5 py-3 text-sm text-emerald-200">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              Запись сохранена — появится в разделе «Эфиры»
            </div>
          )}

          {uploadState === 'error' && (
            <div className="w-full max-w-sm bg-rose-900/60 border border-rose-700/40 rounded-2xl px-5 py-4 text-sm text-rose-200">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle size={16} className="shrink-0" /> Ошибка загрузки записи
              </div>
              <button onClick={() => { setUploadState(null); uploadLocalRecording() }}
                className="text-xs underline text-rose-300 hover:text-rose-100">
                Повторить попытку
              </button>
            </div>
          )}

          {uploadState !== 'uploading' && (
            <>
              <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-xl font-bold">Эфир завершён</p>
                {redirectIn && (
                  <p className="text-white/60 text-sm mt-1">
                    Переход через <span className="text-rose-400 font-bold">{redirectIn}</span> сек…
                  </p>
                )}
              </div>
              <button onClick={() => nav('/admin/education/streams')}
                className="px-8 py-3 rounded-2xl bg-rose-500 hover:bg-rose-600 active:scale-95 text-white font-semibold text-sm transition shadow-lg">
                К списку эфиров
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
