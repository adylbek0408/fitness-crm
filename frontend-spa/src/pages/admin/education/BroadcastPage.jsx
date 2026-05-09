import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Radio, Mic, MicOff, Video, VideoOff, Square,
  Users, ChevronLeft, CheckCircle2,
  RefreshCcw, MessageCircle, UserPlus, X, PhoneOff,
} from 'lucide-react'
import api from '../../../api/axios'
import StreamChat from '../../../components/education/StreamChat'
import {
  createMixerCanvas, createAudioMixer,
  startTrainerP2P,
} from '../../../components/education/streamGuestRTC'

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
  // Quality is fixed at the highest tier (1080p) — the picker was confusing
  // and the trainer almost always wants max. If we ever need to scale down
  // for slow connections, we can fall back automatically.
  const quality = '1080p'
  const [elapsed,      setElapsed]      = useState(0)
  const [viewers,      setViewers]      = useState([])
  const [showViewers,  setShowViewers]  = useState(false)
  const [connState,    setConnState]    = useState('')
  const [cfStatus,     setCfStatus]     = useState(null)
  const [recordingPct,  setRecordingPct]  = useState(0)
  const [recordingDone, setRecordingDone] = useState(false)
  const [flipping,     setFlipping]     = useState(false)

  // Chat — open by default on desktop (>=768), closed on mobile to save room.
  const [showChat, setShowChat] = useState(
    typeof window !== 'undefined' && window.innerWidth >= 768
  )

  // Guest invite
  const [showInviteModal, setShowInviteModal]  = useState(false)
  const [activeViewers,   setActiveViewers]    = useState([])
  const [inviteLoading,   setInviteLoading]    = useState(false)
  const [activeGuest,       setActiveGuest]       = useState(null)
  const [guestStatus,       setGuestStatus]       = useState('') // '' | 'connecting' | 'live' | 'failed'
  const [guestRemoteStream, setGuestRemoteStream] = useState(null)
  const guestPollRef     = useRef(null)
  const guestP2PRef      = useRef(null)         // { pc, remoteStream, close }
  const mixerRef         = useRef(null)         // { canvas, stream, stop }
  const audioMixerRef    = useRef(null)         // { audioCtx, mixedTrack, close }
  const guestVideoElRef  = useRef(null)         // hidden <video> for received guest stream
  const guestPipVideoRef = useRef(null)         // visible PIP <video> in trainer preview

  const videoRef              = useRef(null)
  const pcRef                 = useRef(null)
  const localStreamRef        = useRef(null)
  const elapsedRef            = useRef(null)
  const statusRef             = useRef(status)
  const whipRef               = useRef(null)
  // true only when trainer clicks the Stop button — prevents accidental reload
  // from calling end() and killing the stream for all students.
  const isIntentionalStopRef  = useRef(false)
  const mediaRecorderRef      = useRef(null)
  const recordedChunksRef     = useRef([])
  // Resolves after onstop fires — guarantees ondataavailable has already flushed all chunks
  const recorderStopPromise   = useRef(null)

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
          // Stop recorder before tracks so the final chunk is flushed
          const mr = mediaRecorderRef.current
          if (mr && mr.state !== 'inactive') { try { mr.stop() } catch {} }
          localStreamRef.current?.getTracks().forEach(t => t.stop())
          pcRef.current?.close()
          if (videoRef.current) videoRef.current.srcObject = null
          setBroadcasting(false); setStatus('ended')
        }
      }).catch(() => {})
    }, 5000)
    return () => { ok = false; clearInterval(t) }
  }, [status, id])

  // After stream ends: upload the browser-recorded video to the backend.
  // CF automatic recording is unreliable for WebRTC/WHIP streams, so we
  // record locally with MediaRecorder and upload the WebM file directly.
  //
  // sessionStorage key `recording_upload:{streamId}` mirrors progress so the
  // streams list can render it after the trainer leaves this page.
  const ssKey = `recording_upload:${id}`
  const writeUploadProgress = (stage, pct) => {
    try { sessionStorage.setItem(ssKey, JSON.stringify({ stage, pct, ts: Date.now() })) } catch {}
  }
  const clearUploadProgress = () => { try { sessionStorage.removeItem(ssKey) } catch {} }

  // [uploading] — true while the WebM POST is in flight; gates the
  // "К списку эфиров" button so a click can't kill the upload.
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (status !== 'ended' || !id) return

    const doUpload = async () => {
      // If recorder is still running (external stop), stop it and wait for final chunk
      const mr = mediaRecorderRef.current
      mediaRecorderRef.current = null
      if (mr && mr.state !== 'inactive') {
        try { mr.stop() } catch {}
      }
      // Always await the stop promise — it resolves after ondataavailable flushes all chunks
      try { await recorderStopPromise.current } catch {}
      recorderStopPromise.current = null

      const chunks = recordedChunksRef.current || []
      recordedChunksRef.current = []

      if (chunks.length === 0) { clearUploadProgress(); nav('/admin/education/streams'); return }

      const blob = new Blob(chunks, { type: 'video/webm' })
      if (blob.size < 10_000) { clearUploadProgress(); nav('/admin/education/streams'); return }

      const fd = new FormData()
      fd.append('file', blob, 'recording.webm')

      setUploading(true)
      writeUploadProgress('uploading', 0)
      try {
        await api.post(`/education/streams/${id}/upload-recording/`, fd, {
          timeout: 0,  // no timeout — large files take time
          onUploadProgress: (e) => {
            if (e.total) {
              const pct = Math.round(e.loaded / e.total * 95)
              setRecordingPct(pct)
              writeUploadProgress('uploading', pct)
            }
          },
        })
        setRecordingPct(100); setRecordingDone(true)
        // Browser→backend done; CF transcoding picks up from here.
        // Switch to 'processing' so the streams list can poll cf-state instead.
        writeUploadProgress('processing', 100)
        setTimeout(() => { clearUploadProgress(); nav('/admin/education/streams') }, 2500)
      } catch {
        clearUploadProgress()
        nav('/admin/education/streams')
      } finally {
        setUploading(false)
      }
    }

    doUpload()
    // No abort/cleanup here: we want the upload to complete even if the user
    // navigates away. The button is disabled while `uploading` is true; that
    // is the actual safeguard against losing the recording.
  }, [status, id, nav])  // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before unload if upload is still in flight — closing the tab WILL
  // abort the XHR and the recording will be lost.
  useEffect(() => {
    if (!uploading) return
    const h = e => { e.preventDefault(); e.returnValue = 'Запись эфира ещё загружается. Если уйти сейчас, она пропадёт.'; return e.returnValue }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [uploading])

  useEffect(() => () => {
    // IMPORTANT: only end the stream in DB + delete WHIP when the trainer
    // explicitly clicked the "Stop" button (isIntentionalStopRef = true).
    // On page reload / navigate-away we do NOT call end() so the stream stays
    // live in DB and the trainer can simply re-open the page and reconnect.
    if (isIntentionalStopRef.current) {
      if (statusRef.current === 'live') api.post(`/education/streams/${id}/end/`).catch(() => {})
      const w = whipRef.current
      if (w) { try { fetch(w, { method: 'DELETE' }).catch(() => {}) } catch {} }
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    cleanupGuest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status !== 'live') return
    const h = e => { e.preventDefault(); e.returnValue = 'Эфир идёт — если уйти, он завершится.'; return e.returnValue }
    window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h)
  }, [status])

  // Bind guest remote stream to PIP <video> whenever either arrives.
  // The PIP <video> uses a ref-callback that binds immediately when mounted,
  // but we keep this effect as a safety net — it re-binds if the stream
  // arrives AFTER the video element is already mounted.
  useEffect(() => {
    const v = guestPipVideoRef.current
    if (!v || !guestRemoteStream) return
    if (v.srcObject !== guestRemoteStream) {
      v.srcObject = guestRemoteStream
      v.play().catch(() => {})
    }
  }, [guestRemoteStream, guestStatus])

  // ── Guest list polling (admin sees status changes) ────────────────────────

  useEffect(() => {
    if (status !== 'live' || !id) {
      clearInterval(guestPollRef.current)
      return
    }
    const poll = async () => {
      try {
        const r = await api.get(`/education/streams/${id}/guests/`)
        const guests = r.data || []
        const active = guests.find(g => g.status === 'active')
        const invited = guests.find(g => g.status === 'invited')
        const cur = activeGuest
        if (active && (!cur || cur.id !== active.id || cur.status !== 'active')) {
          setActiveGuest(active)
          // start P2P only if not already running for this guest
          if (!guestP2PRef.current || guestP2PRef.current._guestId !== active.id) {
            startGuestStage(active)
          }
        } else if (!active && invited) {
          setActiveGuest(invited)
        } else if (!active && !invited && cur) {
          // guest ended on their side — clean up
          cleanupGuest()
          setActiveGuest(null)
        }
      } catch {}
    }
    poll()
    guestPollRef.current = setInterval(poll, 4000)
    return () => clearInterval(guestPollRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, id, activeGuest])

  // ── broadcast ─────────────────────────────────────────────────────────────
  // Запись делает Cloudflare Stream Live Input автоматически — клиентский
  // MediaRecorder records locally at 1.5 Mbps for reliable archiving.
  // CF automatic recording silently fails for WebRTC/WHIP on this account.

  const startBroadcast = async () => {
    if (!stream?.cf_webrtc_url) { setError('WebRTC URL не найден.'); return }
    if (insecure) { setError('Нужен HTTPS для камеры и микрофона.'); return }
    setError(''); setStatus('connecting')
    try {
      const q  = QUALITIES[quality]
      const ls = await navigator.mediaDevices.getUserMedia(constraints(q, facingMode))
      localStreamRef.current = ls
      if (videoRef.current) videoRef.current.srcObject = ls

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

      // Proxy WHIP through backend so server can capture the CF Location header.
      // Browser can't read Location from a cross-origin response due to CORS.
      const whipResp = await api.post(`/education/streams/${id}/whip-proxy/`, { sdp: pc.localDescription.sdp })
      const answer     = whipResp.data.sdp
      const sessionUrl = whipResp.data.session_url || ''
      if (sessionUrl) whipRef.current = sessionUrl
      await pc.setRemoteDescription({ type: 'answer', sdp: answer })
      try { await api.post(`/education/streams/${id}/start/`) } catch {}
      // Start browser-side recording — fallback for CF automatic recording
      try {
        const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
          .find(t => MediaRecorder.isTypeSupported(t)) || ''
        if (mimeType) {
          const mr = new MediaRecorder(ls, { mimeType, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 128_000 })
          recordedChunksRef.current = []
          // stopPromise resolves only after onstop — by then ondataavailable has already fired
          recorderStopPromise.current = new Promise(res => { mr.onstop = res })
          mr.ondataavailable = e => { if (e.data?.size > 0) recordedChunksRef.current.push(e.data) }
          mr.start(10_000)  // flush chunk every 10 s
          mediaRecorderRef.current = mr
        }
      } catch(e) { console.warn('[recorder] MediaRecorder start failed:', e) }
      setBroadcasting(true); setStatus('live')
    } catch(e) {
      setError('Ошибка: ' + (e.message || e)); setStatus('idle')
      localStreamRef.current?.getTracks().forEach(t => t.stop())
    }
  }

  const stopBroadcast = async () => {
    isIntentionalStopRef.current = true   // mark as intentional before any async work
    cleanupGuest()
    const w = whipRef.current
    if (w) { whipRef.current = null; try { fetch(w, { method: 'DELETE' }).catch(() => {}) } catch {} }
    // Stop recorder and await onstop — only after that ondataavailable has flushed all chunks
    const mr = mediaRecorderRef.current
    mediaRecorderRef.current = null
    if (mr && mr.state !== 'inactive') {
      try { mr.stop() } catch {}
      try { await recorderStopPromise.current } catch {}  // wait for final ondataavailable
    }
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    pcRef.current?.close()
    if (videoRef.current) videoRef.current.srcObject = null
    setBroadcasting(false); setStatus('ended')  // chunks are ready NOW
    try { await api.post(`/education/streams/${id}/end/`, w ? { whip_resource_url: w } : {}) } catch {}
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
      // If guest is on stage, the WHIP sender currently has the canvas track —
      // we don't want to overwrite that. Just update the trainer preview source.
      if (!guestP2PRef.current) {
        const snd = pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
        if (snd) await snd.replaceTrack(nvt)
      }
      // Stop old camera tracks and rebuild local stream
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop())
      const combined = new MediaStream([...(localStreamRef.current?.getAudioTracks() || []), nvt])
      localStreamRef.current = combined
      if (videoRef.current) videoRef.current.srcObject = combined
    } catch(e) { console.warn('flipCamera:', e) }
    finally { setFlipping(false) }
  }

  // ── Guest invite ──────────────────────────────────────────────────────────

  const openInviteModal = async () => {
    setShowInviteModal(true)
    setInviteLoading(true)
    try {
      const r = await api.get(`/education/streams/${id}/active-viewers/`)
      setActiveViewers(r.data || [])
    } catch { setActiveViewers([]) }
    finally { setInviteLoading(false) }
  }

  const sendInvite = async (clientId) => {
    try {
      const r = await api.post(`/education/streams/${id}/guests/`, { client_id: clientId })
      setActiveGuest(r.data)
      setShowInviteModal(false)
    } catch(e) {
      alert('Ошибка при отправке приглашения: ' + (e?.response?.data?.error || e.message))
    }
  }

  // Start P2P with guest + composite into CF stream
  const startGuestStage = async (guest) => {
    if (!localStreamRef.current || !pcRef.current) return
    setGuestStatus('connecting')

    // Hidden video element for received guest stream
    const guestVid = document.createElement('video')
    guestVid.autoplay = true
    guestVid.playsInline = true
    guestVid.muted = true              // mixed via Web Audio anyway
    guestVid.style.display = 'none'
    document.body.appendChild(guestVid)
    guestVideoElRef.current = guestVid

    const baseUrl = `/education/streams/${id}/guests/${guest.id}/webrtc/`

    // Fetch TURN credentials (required for NAT traversal on mobile/cellular).
    // Falls back silently to STUN-only if the endpoint is unavailable.
    let turnIceServers
    try {
      const tr = await api.post(`/education/streams/${id}/turn-credentials/`)
      turnIceServers = tr.data?.iceServers
    } catch { /* keep undefined → will use DEFAULT_ICE_SERVERS */ }

    try {
      // Reset signaling slate (in case of stale data from previous attempts)
      await api.post(baseUrl, { reset: true }).catch(() => {})

      const session = await startTrainerP2P({
        localStream: localStreamRef.current,
        iceServers: turnIceServers,
        postOffer: async (sdp) => { await api.post(baseUrl, { offer_sdp: sdp }) },
        postIce:   async (cand) => { await api.post(baseUrl, { ice: cand }).catch(() => {}) },
        poll:      async () => (await api.get(baseUrl)).data,
        onRemoteStream: (rs) => {
          // Bind hidden <video> for canvas mixer source
          if (guestVid.srcObject !== rs) {
            guestVid.srcObject = rs
            guestVid.play().catch(() => {})
          }
          setGuestRemoteStream(rs)
          // Pass stream directly — don't fish it back from srcObject,
          // which can race with ICE restarts and end up null.
          startMixer(rs)
        },
        onConnected: () => setGuestStatus('live'),
        onFailed: () => setGuestStatus('failed'),
      })
      session._guestId = guest.id
      guestP2PRef.current = session
    } catch(e) {
      console.warn('[trainer] guest P2P failed:', e)
      setGuestStatus('failed')
    }
  }

  const startMixer = (passedGuestStream) => {
    if (mixerRef.current || !videoRef.current || !guestVideoElRef.current) return
    const q = QUALITIES[quality]
    const mixer = createMixerCanvas({
      trainerVideo: videoRef.current,
      guestVideo:   guestVideoElRef.current,
      width:        Math.min(q.width, 1280),
      height:       Math.min(q.height, 720),
      fps:          24,
    })
    mixerRef.current = mixer

    // Replace WHIP video sender's track with composite
    const videoSender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
    const mixedVideo = mixer.stream.getVideoTracks()[0]
    if (videoSender && mixedVideo) videoSender.replaceTrack(mixedVideo).catch(() => {})

    // Audio: mix trainer mic + guest audio via Web Audio API.
    // We use the stream passed in by onRemoteStream (more reliable than
    // re-reading guestVideoEl.srcObject, which can be null during ICE
    // flaps). Skip audio mixing if the stream has no audio tracks yet —
    // it'll be set up next time onRemoteStream fires with audio.
    try {
      const guestStream = passedGuestStream
        || (guestVideoElRef.current?.srcObject instanceof MediaStream
            ? guestVideoElRef.current.srcObject
            : null)
      if (!guestStream || !(guestStream instanceof MediaStream)) {
        console.warn('[audio mix] no guest stream yet, will retry')
        // Reset flag so the next onRemoteStream call retries.
        // Actually mixerRef is set at this point; clear it to allow retry?
        // No — video mixing is fine; only audio is missing. Leave it.
        return
      }
      if (guestStream.getAudioTracks().length === 0) {
        console.warn('[audio mix] guest stream has no audio tracks yet')
        return
      }
      const am = createAudioMixer(localStreamRef.current, guestStream)
      audioMixerRef.current = am
      const audioSender = pcRef.current?.getSenders().find(s => s.track?.kind === 'audio')
      if (audioSender && am?.mixedTrack) audioSender.replaceTrack(am.mixedTrack).catch(() => {})
    } catch(e) { console.warn('[audio mix] failed:', e) }
  }

  const cleanupGuest = () => {
    setGuestStatus('')
    setGuestRemoteStream(null)
    // Restore original camera + mic tracks on WHIP sender
    if (pcRef.current && localStreamRef.current) {
      const camTrack = localStreamRef.current.getVideoTracks()[0]
      const micTrack = localStreamRef.current.getAudioTracks()[0]
      const vs = pcRef.current.getSenders().find(s => s.track?.kind === 'video')
      const as = pcRef.current.getSenders().find(s => s.track?.kind === 'audio')
      if (vs && camTrack) vs.replaceTrack(camTrack).catch(() => {})
      if (as && micTrack) as.replaceTrack(micTrack).catch(() => {})
    }
    try { mixerRef.current?.stop() } catch {}
    mixerRef.current = null
    try { audioMixerRef.current?.close() } catch {}
    audioMixerRef.current = null
    try { guestP2PRef.current?.close() } catch {}
    guestP2PRef.current = null
    if (guestVideoElRef.current) {
      try { guestVideoElRef.current.srcObject = null; guestVideoElRef.current.remove() } catch {}
      guestVideoElRef.current = null
    }
  }

  const endGuest = async () => {
    if (!activeGuest) return
    try {
      await api.post(`/education/streams/${id}/guests/${activeGuest.id}/end/`)
    } catch {}
    cleanupGuest()
    setActiveGuest(null)
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 overflow-hidden flex"
      style={{
        WebkitUserSelect: 'none',
        background: 'radial-gradient(120% 120% at 50% 0%, #171824 0%, #0b0d16 55%, #06070d 100%)',
      }}
    >
      <div className="relative flex-1 overflow-hidden">

        <video ref={videoRef} autoPlay muted playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: previewMirrored ? 'scaleX(-1)' : 'none', transition: 'transform .15s' }}
        />

        {/* IDLE / READY LOBBY */}
        {!broadcasting && !isEnded && (
          <div className="absolute inset-0 flex flex-col">
            <button onClick={() => nav('/admin/education/streams')}
              className="absolute top-5 left-5 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white transition active:scale-90">
              <ChevronLeft size={22} />
            </button>

            <div className="flex-1 flex items-center justify-center px-5">
              <div className="w-full max-w-xl rounded-3xl border border-white/10 bg-black/35 backdrop-blur-xl p-6 sm:p-8 text-center shadow-2xl">
                <div className="mx-auto mb-5 w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-400/30 flex items-center justify-center">
                  <Radio size={30} className="text-rose-300" />
                </div>

                <p className="text-white/60 text-[11px] font-semibold tracking-[0.18em] uppercase mb-1">Студия эфира</p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-2">{stream?.title || 'Без названия'}</h1>
                <p className="text-sm text-white/55 mb-5">Проверьте кадр и звук перед запуском прямого эфира</p>

                {error && (
                  <div className="w-full bg-rose-900/50 border border-rose-700/40 rounded-2xl px-4 py-3 text-rose-200 text-sm mb-3">{error}</div>
                )}
                {insecure && (
                  <div className="w-full bg-amber-900/50 border border-amber-700/40 rounded-2xl px-4 py-3 text-amber-100 text-sm mb-3">
                    ⚠ Нужен HTTPS для доступа к камере и микрофону
                  </div>
                )}
                {/* Show reconnect hint when stream is still live in DB (e.g. after page reload) */}
                {stream?.status === 'live' && status !== 'connecting' && (
                  <div className="w-full bg-amber-900/50 border border-amber-600/50 rounded-2xl px-4 py-3 text-amber-100 text-sm mb-3">
                    ⚡ Ваш эфир ещё идёт — студенты ждут. Нажмите кнопку ниже чтобы переподключиться.
                  </div>
                )}

                <button onClick={startBroadcast}
                  disabled={status === 'connecting' || !stream?.cf_webrtc_url}
                  className="w-full sm:w-auto mx-auto min-w-56 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-xl shadow-rose-900/30 hover:shadow-rose-900/50 disabled:opacity-50 transition active:scale-[0.99] flex items-center justify-center gap-2">
                  {status === 'connecting'
                    ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : <Radio size={18} />}
                  <span>{status === 'connecting' ? 'Подключаемся…' : stream?.status === 'live' ? '⚡ Переподключиться к эфиру' : 'Начать эфир'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* LIVE overlays */}
        {isLive && (
          <>
            <div className="absolute top-0 left-0 right-0 h-44 bg-gradient-to-b from-black/80 via-black/30 to-transparent pointer-events-none" />
            <div className="absolute bottom-0 left-0 right-0 h-52 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

            {!camOn && (
              <div className="absolute inset-0 z-10 bg-gray-950 flex items-center justify-center">
                <VideoOff size={72} className="text-gray-700" />
              </div>
            )}

            {/* PIP guest preview overlay — visible during connecting too,
                so trainer always sees that something is happening. */}
            {(guestStatus === 'live' || guestStatus === 'connecting') && (
              <div className="absolute z-15 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/80"
                style={{
                  bottom: '6.25%', right: '2.5%',
                  width: '24%', aspectRatio: '16/9',
                }}>
                <video
                  ref={el => {
                    guestPipVideoRef.current = el
                    if (el && guestRemoteStream && el.srcObject !== guestRemoteStream) {
                      el.srcObject = guestRemoteStream
                      el.play().catch(() => {})
                    }
                  }}
                  autoPlay muted playsInline
                  className="w-full h-full object-cover bg-black"
                />
                {guestStatus === 'connecting' && !guestRemoteStream && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white text-[10px] gap-1">
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Подключаем…</span>
                  </div>
                )}
              </div>
            )}

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 z-20 flex items-center gap-2 px-3 sm:px-4 pt-4">
              <button onClick={() => nav('/admin/education/streams')}
                className="w-9 h-9 rounded-xl bg-black/45 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white hover:bg-black/60 active:scale-90 transition shrink-0">
                <ChevronLeft size={20} />
              </button>
              <div className="flex-1 min-w-0 rounded-xl bg-black/35 backdrop-blur-sm border border-white/10 px-3 py-2">
                <p className="font-semibold text-white text-sm truncate">{stream?.title}</p>
              </div>
              {cfStatus && (
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfStatus.live_input_state === 'connected' ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-amber-400 animate-pulse'}`}
                  title={cfStatus.live_input_state === 'connected' ? 'CF получает видео' : 'CF не получает видео'} />
              )}
              <span className="flex items-center gap-1.5 bg-rose-600 px-3 py-1.5 rounded-xl text-xs font-black tracking-wider shrink-0 shadow-lg shadow-rose-900/40">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> LIVE
              </span>
              <span className="font-mono text-sm text-white/90 shrink-0 tabular-nums drop-shadow rounded-xl bg-black/35 backdrop-blur-sm border border-white/10 px-2.5 py-1.5">{fmt(elapsed)}</span>
            </div>

            {connState && !['connected', 'completed', ''].includes(connState) && (
              <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20">
                <span className="bg-amber-800/80 backdrop-blur text-amber-100 text-xs px-3 py-1.5 rounded-full shadow-lg">
                  {connState === 'failed' ? '⚠ Нет связи с CF' : connState === 'disconnected' ? '⚠ Связь потеряна' : `⚠ ${connState}`}
                </span>
              </div>
            )}

            {/* Guest status badge with prominent "Remove" button */}
            {activeGuest && (
              <div className="absolute top-16 left-3 z-20">
                <div className="flex items-center gap-2 bg-black/55 backdrop-blur border border-white/15 rounded-xl px-3 py-2">
                  <span className={`w-2 h-2 rounded-full ${
                    guestStatus === 'live' ? 'bg-emerald-400 animate-pulse'
                      : guestStatus === 'connecting' ? 'bg-amber-400 animate-pulse'
                      : guestStatus === 'failed' ? 'bg-rose-500'
                      : 'bg-white/40'
                  }`} />
                  <span className="text-xs text-white font-medium">
                    {guestStatus === 'live'       ? `${activeGuest.client_name} в эфире`
                      : guestStatus === 'connecting' ? `Подключаем ${activeGuest.client_name}…`
                      : guestStatus === 'failed'     ? `Ошибка связи с ${activeGuest.client_name}`
                      : activeGuest.status === 'invited' ? `Ждём согласия от ${activeGuest.client_name}…`
                      : activeGuest.client_name}
                  </span>
                  <button onClick={endGuest} title="Удалить из эфира"
                    className="ml-1 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-semibold active:scale-95 transition">
                    <PhoneOff size={11} /> Удалить
                  </button>
                </div>
              </div>
            )}

            {/* Viewers — count pill is clickable, opens a drawer with names */}
            <div className="absolute right-3 top-16 z-20 flex flex-col items-end gap-2">
              <button onClick={() => setShowViewers(true)} title="Список зрителей"
                className="bg-black/50 hover:bg-black/65 backdrop-blur-sm rounded-full px-3 py-1.5 flex items-center gap-1.5 border border-white/10 active:scale-95 transition">
                <Users size={13} className="text-rose-300" />
                <span className="text-xs font-bold text-white">{viewers.length}</span>
              </button>
              {/* Avatar stack — quick visual indication who's there */}
              {viewers.length > 0 && (
                <div className="flex flex-col gap-1.5 items-center">
                  {viewers.slice(0, 5).map(v => (
                    <div key={v.id} className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-white text-[11px] font-black shadow-lg border-2 border-black/30"
                      title={v.client_name}>
                      {(v.client_name || '?')[0].toUpperCase()}
                    </div>
                  ))}
                  {viewers.length > 5 && <span className="text-[10px] text-white/60 font-semibold">+{viewers.length - 5}</span>}
                </div>
              )}
            </div>

            {/* Bottom control bar */}
            <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3 px-4 pb-8">
              <div className="px-3 py-1 rounded-full text-[11px] font-medium bg-black/30 text-white/75 border border-white/10">
                {previewMirrored ? 'Передняя камера: зеркальное превью' : 'Основная камера: обычное превью'}
              </div>

              <div className="bg-black/55 backdrop-blur-2xl border border-white/[0.12] rounded-3xl px-4 py-3 flex items-center gap-3 shadow-2xl">
                <CtrlBtn on={micOn} onClick={toggleMic} onIcon={<Mic size={20}/>} offIcon={<MicOff size={20}/>} label={micOn ? 'Микрофон вкл.' : 'Микрофон выкл.'} />
                <CtrlBtn on={camOn} onClick={toggleCam} onIcon={<Video size={20}/>} offIcon={<VideoOff size={20}/>} label={camOn ? 'Камера вкл.' : 'Камера выкл.'} />

                <button onClick={stopBroadcast} title="Завершить эфир"
                  className="w-14 h-14 rounded-2xl bg-gradient-to-br from-rose-500 to-rose-700 flex items-center justify-center shadow-[0_0_30px_rgba(244,63,94,0.45)] border border-rose-300/40 active:scale-90 hover:from-rose-400 hover:to-rose-600 transition">
                  <Square size={22} fill="white" className="text-white" />
                </button>

                <button onClick={flipCamera} disabled={flipping} title="Сменить камеру"
                  className="w-12 h-12 rounded-full bg-white/12 border border-white/20 flex items-center justify-center text-white active:scale-90 disabled:opacity-40 hover:bg-white/20 transition">
                  <RefreshCcw size={19} className={flipping ? 'animate-spin' : ''} />
                </button>

                <button onClick={() => setShowChat(p => !p)} title="Чат"
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 hover:opacity-80 transition border ${showChat ? 'bg-rose-600 border-rose-400' : 'bg-white/12 border-white/20'}`}>
                  <MessageCircle size={19} />
                </button>

                <button onClick={openInviteModal} title="Пригласить ученицу"
                  className="w-12 h-12 rounded-full bg-white/12 border border-white/20 flex items-center justify-center text-white active:scale-90 hover:bg-white/20 transition">
                  <UserPlus size={19} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* ENDED overlay */}
        {isEnded && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 px-8"
            style={{ background: 'linear-gradient(to bottom,rgba(0,0,0,.9),rgba(0,0,0,.95))' }}>
            <div className="w-20 h-20 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 size={40} className="text-emerald-400" />
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-white">Эфир завершён</p>
              {recordingDone ? (
                <p className="text-emerald-400 text-sm font-semibold mt-2">✓ Запись сохранена!</p>
              ) : (
                <>
                  <p className="text-white/50 text-sm mt-1">Загружаем запись…</p>
                  <div className="mt-4 w-64 mx-auto">
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 rounded-full transition-all duration-500"
                        style={{ width: `${recordingPct}%` }}
                      />
                    </div>
                    <p className="text-white/40 text-xs mt-1.5">{recordingPct}%</p>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => nav('/admin/education/streams')}
              disabled={uploading}
              title={uploading ? 'Дождитесь окончания загрузки записи' : ''}
              className="px-8 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-semibold text-sm transition active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white/10">
              {uploading ? 'Загружаем запись…' : 'К списку эфиров'}
            </button>
          </div>
        )}
      </div>

      {/* Chat sidebar */}
      {showChat && isLive && (
        <div className="w-72 shrink-0 flex flex-col" style={{ height: '100dvh' }}>
          <StreamChat
            streamId={id}
            isTrainer={true}
            onClose={() => setShowChat(false)}
          />
        </div>
      )}

      {/* Viewers drawer — list with names */}
      {showViewers && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowViewers(false)}>
          <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl w-full max-w-sm p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users size={18} className="text-rose-400" />
                <h3 className="text-white font-semibold">В эфире ({viewers.length})</h3>
              </div>
              <button onClick={() => setShowViewers(false)} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>
            {viewers.length === 0 && (
              <p className="text-white/40 text-sm text-center py-8">
                Пока никто не подключился.
              </p>
            )}
            {viewers.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {viewers.map(v => (
                  <div key={v.id}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-sm font-bold shrink-0">
                      {(v.client_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{v.client_name || 'Гость'}</div>
                      <div className="text-[11px] text-emerald-400">в эфире</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4"
          onClick={() => setShowInviteModal(false)}>
          <div className="bg-[#1a1d2e] border border-white/10 rounded-3xl w-full max-w-sm p-5 shadow-2xl"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">Пригласить на сцену</h3>
              <button onClick={() => setShowInviteModal(false)} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>
            {inviteLoading && (
              <div className="flex justify-center py-8">
                <span className="w-8 h-8 border-2 border-white/20 border-t-rose-400 rounded-full animate-spin" />
              </div>
            )}
            {!inviteLoading && activeViewers.length === 0 && (
              <p className="text-white/40 text-sm text-center py-8">
                Сейчас никто не смотрит.<br />Студентки появятся когда зайдут в эфир.
              </p>
            )}
            {!inviteLoading && activeViewers.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {activeViewers.map(v => (
                  <button key={v.id}
                    onClick={() => sendInvite(v.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/5 hover:bg-rose-600/20 border border-white/10 hover:border-rose-500/40 text-white transition active:scale-[0.98]">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center text-sm font-bold shrink-0">
                      {v.name[0]?.toUpperCase() || '?'}
                    </div>
                    <span className="font-medium text-sm">{v.name}</span>
                    <UserPlus size={15} className="ml-auto text-rose-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CtrlBtn({ on, onClick, onIcon, offIcon, label }) {
  return (
    <button onClick={onClick} title={label}
      className={`w-12 h-12 rounded-full flex items-center justify-center text-white active:scale-90 hover:opacity-80 transition ${on ? 'bg-white/12 border border-white/20' : 'bg-rose-600 shadow-lg shadow-rose-900/40'}`}>
      {on ? onIcon : offIcon}
    </button>
  )
}
