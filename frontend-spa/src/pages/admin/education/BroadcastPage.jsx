import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Radio, Mic, MicOff, Video, VideoOff, Square,
  Users, ChevronLeft, CheckCircle2, Upload, AlertCircle,
  RefreshCcw,
} from 'lucide-react'
import api from '../../../api/axios'

export default function BroadcastPage() {
  const { id } = useParams()
  const nav = useNavigate()

  const [stream,       setStream]       = useState(null)
  const [error,        setError]        = useState('')
  const [status,       setStatus]       = useState('idle')
  const [broadcasting, setBroadcasting] = useState(false)
  const [micOn,        setMicOn]        = useState(true)
  const [camOn,        setCamOn]        = useState(true)
  const [facingMode,   setFacingMode]   = useState('user')
  const [quality,      setQuality]      = useState('720p')
  const [elapsed,      setElapsed]      = useState(0)
  const [viewers,      setViewers]      = useState([])
  const [connState,    setConnState]    = useState('')
  const [cfStatus,     setCfStatus]     = useState(null)
  const [redirectIn,   setRedirectIn]   = useState(null)
  const [uploadState,  setUploadState]  = useState(null)
  const [uploadPct,    setUploadPct]    = useState(0)
  const [flipping,     setFlipping]     = useState(false)

  const videoRef          = useRef(null)
  const pcRef             = useRef(null)
  const localStreamRef    = useRef(null)
  const elapsedRef        = useRef(null)
  const statusRef         = useRef(status)
  const whipRef           = useRef(null)
  const recorderRef       = useRef(null)
  const chunksRef         = useRef([])
  const mimeRef           = useRef('')

  const insecure = typeof window !== 'undefined' && !window.isSecureContext
  const isLive   = status === 'live'
  const isEnded  = status === 'ended'
  const previewMirrored = facingMode === 'user'

  const QUALITIES = {
    '480p':  { width: 854,  height: 480,  frameRate: 30, videoKbps: 1200 },
    '720p':  { width: 1280, height: 720,  frameRate: 30, videoKbps: 2500 },
    '1080p': { width: 1920, height: 1080, frameRate: 30, videoKbps: 4500 },
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  const fmt = sec => {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`
  }

  const supportedMime = () => {
    const list = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4',
      'video/webm;codecs=h264,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm',
    ]
    return list.find(t => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } }) || ''
  }

  const constraints = (q, facing) => ({
    video: { facingMode: { ideal: facing }, width: { ideal: q.width }, height: { ideal: q.height }, frameRate: { ideal: q.frameRate } },
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

  // ── data & polling ────────────────────────────────────────────────────────

  useEffect(() => {
    api.get('/education/streams/')
      .then(r => { const s = (r.data?.results || r.data || []).find(s => s.id === id); if (s) setStream(s); else setError('Эфир не найден') })
      .catch(() => setError('Ошибка загрузки'))
  }, [id])

  useEffect(() => { statusRef.current = status }, [status])

  useEffect(() => {
    if (status !== 'live') { clearInterval(elapsedRef.current); return }
    setElapsed(0)
    elapsedRef.current = setInterval(() => setElapsed(v => v + 1), 1000)
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

  useEffect(() => {
    if (status !== 'live' || !id) return
    let ok = true
    const t = setInterval(() => {
      api.get('/education/streams/').then(r => {
        if (!ok) return
        const fresh = (r.data?.results || r.data || []).find(s => s.id === id)
        if (fresh && fresh.status !== 'live') {
          whipRef.current = null
          localStreamRef.current?.getTracks().forEach(t => t.stop())
          pcRef.current?.close()
          if (videoRef.current) videoRef.current.srcObject = null
          setBroadcasting(false); setStatus('ended')
        }
      }).catch(() => {})
    }, 5000)
    return () => { ok = false; clearInterval(t) }
  }, [status, id])

  useEffect(() => {
    if (status !== 'ended' || uploadState === 'uploading') return
    setRedirectIn(4)
    const t = setInterval(() => setRedirectIn(p => {
      if (p <= 1) { clearInterval(t); nav('/admin/education/streams'); return 0 }
      return p - 1
    }), 1000)
    return () => clearInterval(t)
  }, [status, uploadState, nav])

  useEffect(() => () => {
    if (statusRef.current === 'live') api.post(`/education/streams/${id}/end/`).catch(() => {})
    const w = whipRef.current
    if (w) { try { fetch(w, { method: 'DELETE' }).catch(() => {}) } catch {} }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status !== 'live') return
    const h = e => { e.preventDefault(); e.returnValue = 'Эфир идёт — если уйти, он завершится.'; return e.returnValue }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [status])

  useEffect(() => {
    if (uploadState !== 'uploading') return
    const h = e => { e.preventDefault(); e.returnValue = 'Запись загружается — не закрывайте вкладку!'; return e.returnValue }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [uploadState])

  // ── recording ─────────────────────────────────────────────────────────────

  const startRec = ls => {
    try {
      const mime = supportedMime(); mimeRef.current = mime; chunksRef.current = []
      const mr = new MediaRecorder(ls, mime ? { mimeType: mime, videoBitsPerSecond: QUALITIES[quality].videoKbps * 1000 } : {})
      mr.ondataavailable = e => { if (e.data?.size > 0) chunksRef.current.push(e.data) }
      recorderRef.current = mr; mr.start(10000)
    } catch(e) { console.warn('[Rec] start failed:', e) }
  }

  const stopRec = () => new Promise(res => {
    const mr = recorderRef.current
    if (!mr || mr.state === 'inactive') { res(); return }
    mr.addEventListener('stop', res, { once: true }); mr.stop()
  })

  const uploadRec = useCallback(async () => {
    const chunks = chunksRef.current
    if (!chunks?.length) return
    setUploadState('uploading'); setUploadPct(0)
    try {
      const mime = mimeRef.current || 'video/webm'
      const blob = new Blob(chunks, { type: mime })
      const ext  = mime.includes('mp4') ? 'mp4' : 'webm'
      const fd   = new FormData()
      fd.append('file', new File([blob], `recording.${ext}`, { type: mime }))
      await api.post(`/education/streams/${id}/upload-recording/`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: e => { if (e.total) setUploadPct(Math.min(90, Math.round(e.loaded / e.total * 90))) },
        timeout: 0,
      })
      setUploadPct(100); setUploadState('done')
    } catch(e) { console.error('[Rec] upload failed:', e); setUploadState('error') }
  }, [id])

  // ── broadcast ─────────────────────────────────────────────────────────────

  const startBroadcast = async () => {
    if (!stream?.cf_webrtc_url) { setError('WebRTC URL не найден.'); return }
    if (insecure) { setError('Нужен HTTPS для камеры и микрофона.'); return }
    setError(''); setStatus('connecting')
    try {
      const q  = QUALITIES[quality]
      const ls = await navigator.mediaDevices.getUserMedia(constraints(q, facingMode))
      localStreamRef.current = ls
      if (videoRef.current) videoRef.current.srcObject = ls
      startRec(ls)

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })
      pcRef.current = pc
      pc.addEventListener('iceconnectionstatechange', () => setConnState(pc.iceConnectionState))

      ls.getTracks().forEach(t => {
        const s = pc.addTrack(t, ls)
        try {
          const p = s.getParameters(); if (!p.encodings) p.encodings = [{}]
          if (t.kind === 'video') { p.encodings[0].maxBitrate = q.videoKbps * 1000; p.encodings[0].maxFramerate = q.frameRate }
          else p.encodings[0].maxBitrate = 128000
          s.setParameters(p).catch(() => {})
        } catch {}
      })

      try {
        const vt = pc.getTransceivers().find(t => t.sender?.track?.kind === 'video')
        if (vt && RTCRtpSender.getCapabilities) {
          const caps = RTCRtpSender.getCapabilities('video')
          if (caps?.codecs) {
            vt.setCodecPreferences?.([
              ...caps.codecs.filter(c => /h264/i.test(c.mimeType)),
              ...caps.codecs.filter(c => /vp9/i.test(c.mimeType)),
              ...caps.codecs.filter(c => /vp8/i.test(c.mimeType)),
              ...caps.codecs.filter(c => !/h264|vp8|vp9/i.test(c.mimeType)),
            ])
          }
        }
      } catch {}

      const offer = await pc.createOffer(); await pc.setLocalDescription(offer)
      await new Promise(res => {
        if (pc.iceGatheringState === 'complete') { res(); return }
        const chk = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', chk); res() } }
        pc.addEventListener('icegatheringstatechange', chk); setTimeout(res, 3000)
      })

      const resp = await fetch(stream.cf_webrtc_url, { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: pc.localDescription.sdp })
      if (!resp.ok) throw new Error(`WHIP ${resp.status}`)
      const answer = await resp.text()
      const loc    = resp.headers.get('Location') || ''
      if (loc) {
        try { whipRef.current = new URL(loc, stream.cf_webrtc_url).href }
        catch { const seg = loc.split('/').pop(); if (seg?.length > 4) whipRef.current = stream.cf_webrtc_url.replace(/\/$/, '') + '/' + seg }
      }
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })
      try { await api.post(`/education/streams/${id}/start/`) } catch {}
      setBroadcasting(true); setStatus('live')
    } catch(e) {
      setError('Ошибка: ' + (e.message || e)); setStatus('idle')
      localStreamRef.current?.getTracks().forEach(t => t.stop())
    }
  }

  const stopBroadcast = async () => {
    const w = whipRef.current
    await stopRec()
    if (w) { whipRef.current = null; try { fetch(w, { method: 'DELETE' }).catch(() => {}) } catch {} }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    if (videoRef.current) videoRef.current.srcObject = null
    setBroadcasting(false); setStatus('ended')
    try { await api.post(`/education/streams/${id}/end/`, w ? { whip_resource_url: w } : {}) } catch {}
    uploadRec()
  }

  const toggleMic = () => { const t = localStreamRef.current?.getAudioTracks()?.[0]; if (t) { t.enabled = !t.enabled; setMicOn(t.enabled) } }
  const toggleCam = () => { const t = localStreamRef.current?.getVideoTracks()?.[0]; if (t) { t.enabled = !t.enabled; setCamOn(t.enabled) } }

  const flipCamera = async () => {
    if (!broadcasting || flipping) return
    setFlipping(true)
    const next = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(next)
    try {
      const q   = QUALITIES[quality]
      const ns  = await navigator.mediaDevices.getUserMedia(constraints(q, next))
      const nvt = ns.getVideoTracks()[0]
      const snd = pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
      if (snd) await snd.replaceTrack(nvt)
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop())
      const combined = new MediaStream([...(localStreamRef.current?.getAudioTracks() || []), nvt])
      localStreamRef.current = combined
      if (videoRef.current) videoRef.current.srcObject = combined
    } catch(e) { console.warn('flipCamera:', e) }
    finally { setFlipping(false) }
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black overflow-hidden" style={{ WebkitUserSelect: 'none' }}>

      {/* ── Camera ── */}
      <video ref={videoRef} autoPlay muted playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: previewMirrored ? 'scaleX(-1)' : 'none', transition: 'transform .15s' }}
      />

      {/* ── IDLE / READY LOBBY ── */}
      {!broadcasting && !isEnded && (
        <div className="absolute inset-0 flex flex-col" style={{
          background: 'linear-gradient(160deg,#0f0715 0%,#1a0a1e 40%,#0d0d1a 100%)'
        }}>
          {/* back */}
          <button onClick={() => nav('/admin/education/streams')}
            className="absolute top-5 left-5 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition active:scale-90">
            <ChevronLeft size={22} />
          </button>

          {/* center content */}
          <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 text-center">
            {/* Icon ring */}
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-rose-500/20 scale-125 animate-pulse" />
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-rose-500/30 to-pink-600/20 border border-rose-500/30 flex items-center justify-center relative">
                <Radio size={40} className="text-rose-400" />
              </div>
            </div>

            <div>
              <p className="text-white/50 text-sm font-medium tracking-wide uppercase mb-1">Студия</p>
              <h1 className="text-2xl font-bold text-white leading-tight">{stream?.title || '…'}</h1>
            </div>

            {/* Quality selector */}
            <div className="flex gap-2">
              {Object.entries({ '480p': 'SD', '720p': 'HD', '1080p': 'FHD' }).map(([k, label]) => (
                <button key={k} onClick={() => setQuality(k)}
                  className={`px-5 py-2 rounded-full text-sm font-semibold transition active:scale-95 ${quality === k ? 'bg-rose-500 text-white shadow-lg shadow-rose-900/50' : 'bg-white/10 text-white/60 hover:bg-white/15 border border-white/10'}`}>
                  {label}
                </button>
              ))}
            </div>

            {error && (
              <div className="w-full max-w-xs bg-rose-900/60 border border-rose-700/50 rounded-2xl px-4 py-3 text-rose-200 text-sm">
                {error}
              </div>
            )}
            {insecure && (
              <div className="w-full max-w-xs bg-amber-900/60 border border-amber-700/50 rounded-2xl px-4 py-3 text-amber-200 text-sm">
                ⚠ Нужен HTTPS для эфира
              </div>
            )}
          </div>

          {/* Start button */}
          <div className="flex justify-center pb-16">
            <button onClick={startBroadcast} disabled={status === 'connecting' || !stream?.cf_webrtc_url}
              className="group relative disabled:opacity-50 active:scale-95 transition-transform">
              {/* outer glow ring */}
              <div className="absolute inset-0 rounded-full bg-rose-500/25 scale-125 group-hover:scale-150 transition-transform duration-300" />
              <div className="absolute inset-0 rounded-full bg-rose-500/10 scale-[1.6] group-hover:scale-[1.8] transition-transform duration-500" />
              {/* button */}
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 flex flex-col items-center justify-center shadow-[0_0_50px_rgba(244,63,94,0.5)] border-2 border-rose-400/40">
                {status === 'connecting'
                  ? <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <>
                      <Radio size={28} className="text-white" />
                      <span className="text-[10px] font-black tracking-widest text-white mt-0.5">LIVE</span>
                    </>
                }
              </div>
            </button>
          </div>
        </div>
      )}

      {/* ── LIVE overlays ── */}
      {isLive && (
        <>
          {/* gradients */}
          <div className="absolute top-0 left-0 right-0 h-44 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

          {/* cam-off overlay */}
          {!camOn && (
            <div className="absolute inset-0 z-10 bg-gray-950 flex items-center justify-center">
              <VideoOff size={72} className="text-gray-700" />
            </div>
          )}

          {/* ── Top bar ── */}
          <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-3 px-4 pt-5 pb-2">
            <button onClick={() => nav('/admin/education/streams')}
              className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 active:scale-90 transition shrink-0">
              <ChevronLeft size={20} />
            </button>
            <p className="font-semibold text-white text-sm truncate flex-1 drop-shadow">{stream?.title}</p>
            {/* CF dot */}
            {cfStatus && (
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfStatus.live_input_state === 'connected' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-amber-400 animate-pulse'}`}
                title={cfStatus.live_input_state === 'connected' ? 'CF получает видео' : 'CF не получает видео'} />
            )}
            <span className="flex items-center gap-1.5 bg-rose-600 px-3 py-1 rounded-full text-xs font-black tracking-wider shrink-0 shadow-lg shadow-rose-900/50">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
            </span>
            <span className="font-mono text-sm text-white/90 shrink-0 tabular-nums drop-shadow">{fmt(elapsed)}</span>
          </div>

          {/* connection warning */}
          {connState && !['connected', 'completed', ''].includes(connState) && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
              <span className="bg-amber-800/80 backdrop-blur text-amber-100 text-xs px-3 py-1.5 rounded-full shadow-lg">
                {connState === 'failed' ? '⚠ Нет связи с CF' : connState === 'disconnected' ? '⚠ Связь потеряна' : `⚠ ${connState}`}
              </span>
            </div>
          )}

          {/* ── Viewers (right edge) ── */}
          {viewers.length > 0 && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2">
              <div className="bg-black/50 backdrop-blur-sm rounded-full px-2.5 py-1.5 flex items-center gap-1 border border-white/10">
                <Users size={12} className="text-rose-300" />
                <span className="text-xs font-bold text-white">{viewers.length}</span>
              </div>
              {viewers.slice(0, 5).map(v => (
                <div key={v.id} className="group relative">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-white text-xs font-black shadow-lg border-2 border-black/30">
                    {(v.client_name || '?')[0].toUpperCase()}
                  </div>
                  <div className="absolute right-11 top-1/2 -translate-y-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none">
                    {v.client_name}
                  </div>
                </div>
              ))}
              {viewers.length > 5 && <span className="text-[10px] text-white/50">+{viewers.length - 5}</span>}
            </div>
          )}

          {/* ── Bottom control bar ── */}
          <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3 px-4 pb-10">
            <div className="px-3 py-1 rounded-full text-[11px] font-medium bg-black/30 text-white/75 border border-white/10">
              {previewMirrored ? 'Передняя камера: зеркальное превью' : 'Основная камера: обычное превью'}
            </div>

            {/* main pill */}
            <div className="bg-black/55 backdrop-blur-2xl border border-white/[0.12] rounded-[2rem] px-5 py-4 flex items-center gap-4 shadow-2xl">

              {/* Mic */}
              <CtrlBtn on={micOn} onClick={toggleMic} onIcon={<Mic size={20}/>} offIcon={<MicOff size={20}/>} label={micOn ? 'Микрофон вкл.' : 'Микрофон выкл.'} />

              {/* Cam */}
              <CtrlBtn on={camOn} onClick={toggleCam} onIcon={<Video size={20}/>} offIcon={<VideoOff size={20}/>} label={camOn ? 'Камера вкл.' : 'Камера выкл.'} />

              {/* STOP */}
              <button onClick={stopBroadcast} title="Завершить эфир"
                className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shadow-[0_0_30px_rgba(244,63,94,0.55)] border-[3px] border-rose-400/30 active:scale-90 hover:from-rose-400 hover:to-rose-600 transition">
                <Square size={22} fill="white" className="text-white" />
              </button>

              {/* Flip camera */}
              <button onClick={flipCamera} disabled={flipping} title="Сменить камеру"
                className="w-12 h-12 rounded-full bg-white/12 border border-white/20 flex items-center justify-center text-white active:scale-90 disabled:opacity-40 hover:bg-white/20 transition">
                <RefreshCcw size={19} className={flipping ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── ENDED overlay ── */}
      {isEnded && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 px-8"
          style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,.9),rgba(0,0,0,.95))' }}>

          {uploadState === 'uploading' && (
            <div className="w-full max-w-sm bg-white/5 backdrop-blur border border-white/10 rounded-3xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                  <Upload size={18} className="text-blue-400 animate-bounce" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{uploadPct < 90 ? 'Загрузка записи…' : 'Отправляем в Cloudflare…'}</p>
                  <p className="text-xs text-white/40 mt-0.5">Не закрывайте страницу</p>
                </div>
                <span className="font-mono text-sm text-blue-300 shrink-0">{uploadPct}%</span>
              </div>
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${uploadPct}%` }} />
              </div>
            </div>
          )}

          {uploadState === 'done' && (
            <div className="flex items-center gap-3 bg-emerald-900/50 border border-emerald-600/30 rounded-2xl px-5 py-3 text-sm text-emerald-200">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              Запись сохранена — появится в разделе «Эфиры»
            </div>
          )}

          {uploadState === 'error' && (
            <div className="w-full max-w-sm bg-rose-900/50 border border-rose-700/40 rounded-2xl px-5 py-4 text-sm text-rose-200">
              <div className="flex items-center gap-2 mb-3"><AlertCircle size={16} className="shrink-0" /> Ошибка загрузки записи</div>
              <button onClick={() => { setUploadState(null); uploadRec() }} className="text-xs underline text-rose-300 hover:text-rose-100">
                Повторить
              </button>
            </div>
          )}

          {uploadState !== 'uploading' && (
            <>
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 size={40} className="text-emerald-400" />
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">Эфир завершён</p>
                {redirectIn && <p className="text-white/50 text-sm mt-1">Переход через <span className="text-rose-400 font-bold">{redirectIn}</span> с…</p>}
              </div>
              <button onClick={() => nav('/admin/education/streams')}
                className="px-8 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm transition active:scale-95">
                К списку эфиров
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── small helper component ─────────────────────────────────────────────────
function CtrlBtn({ on, onClick, onIcon, offIcon, label }) {
  return (
    <button onClick={onClick} title={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 hover:opacity-80 transition ${on ? 'bg-white/12 border border-white/20' : 'bg-rose-600 shadow-lg shadow-rose-900/40'}`}>
      {on ? onIcon : offIcon}
    </button>
  )
}
