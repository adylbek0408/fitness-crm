import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, Radio, Users, Shield, AlertTriangle, Archive,
  CheckCircle2, Clock, X, Maximize2, Minimize2,
  PhoneCall, PhoneOff, Mic, MicOff, Video, VideoOff,
} from 'lucide-react'
import api from '../../../api/axios'
import CloudflareStreamPlayer from '../../../components/education/CloudflareStreamPlayer'
import Watermark from '../../../components/education/Watermark'
import useContentProtection from '../../../components/education/useContentProtection'
import StreamChat from '../../../components/education/StreamChat'
import { startGuestP2P } from '../../../components/education/streamGuestRTC'

const CF_SUBDOMAIN_FALLBACK = 'customer-cyusd1ztro8pgq40.cloudflarestream.com'

export default function StreamLive() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const streamId = searchParams.get('id')

  const [stream,       setStream]       = useState(null)
  const [streamEnded,  setStreamEnded]  = useState(false)
  const [viewers,      setViewers]      = useState([])
  const [joined,       setJoined]       = useState(null)
  const [warning,      setWarning]      = useState('')
  const [error,        setError]        = useState('')
  const [accessDenied, setAccessDenied] = useState('')
  const [showViewers,  setShowViewers]  = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Guest stage state
  const [guestInvite,    setGuestInvite]    = useState(null)
  const [onStage,        setOnStage]        = useState(false)
  const [stageState,     setStageState]     = useState('')   // 'requesting-media' | 'connecting' | 'live' | 'failed'
  const [stageMicOn,     setStageMicOn]     = useState(true)
  const [stageCamOn,     setStageCamOn]     = useState(true)
  const stageLocalRef       = useRef(null)
  const stagePcRef          = useRef(null)
  const stageRemoteRef      = useRef(null)        // <video> element for trainer's incoming stream
  const stageRemoteStreamRef = useRef(null)       // latest MediaStream from P2P (so we can re-bind on remount)
  const stagePreviewRef     = useRef(null)        // <video> for our own camera preview
  const guestPollRef        = useRef(null)

  const videoRef       = useRef(null)
  const playerRef      = useRef(null)   // CloudflareStreamPlayer imperative handle
  const playerShellRef = useRef(null)

  useContentProtection({
    videoRef,
    rootRef: playerShellRef,
    onSuspect: kind => {
      setWarning(kind === 'devtools' ? 'Закройте инструменты разработчика.' : 'Запись заблокирована.')
      setTimeout(() => setWarning(''), 4000)
    },
  })

  const streamRef        = useRef(null)
  const streamEndedRef   = useRef(false)
  const joinedRef        = useRef(false)
  streamRef.current      = stream
  streamEndedRef.current = streamEnded

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) nav('/cabinet')
  }, [nav])

  // ── Stream polling ────────────────────────────────────────────────────────
  useEffect(() => {
    const pollUrl = streamId
      ? `/cabinet/education/streams/active/?id=${streamId}`
      : '/cabinet/education/streams/active/'

    let inflight = false
    const tick = async () => {
      if (streamEndedRef.current) return
      if (inflight) return       // skip if previous tick still running (slow network)
      inflight = true
      try {
        const r = await api.get(pollUrl)
        const s = r.data?.stream || null
        const reason = r.data?.reason || ''

        if (!s || s.status === 'ended' || s.status === 'archived') {
          if (streamRef.current?.status === 'live' || s?.status === 'ended' || s?.status === 'archived') {
            setStreamEnded(true)
          }
          setStream(null)
          if (!s && streamId && (reason === 'forbidden' || reason === 'not_found')) {
            setAccessDenied(reason)
          }
          return
        }

        setStream(s)
        setAccessDenied('')
        if (s.status !== 'live') return

        if (!joinedRef.current) {
          joinedRef.current = true
          api.post(`/cabinet/education/streams/${s.id}/join/`)
            .then(r2 => setJoined(r2.data))
            .catch(() => { joinedRef.current = false })
        }

        api.post(`/cabinet/education/streams/${s.id}/heartbeat/`).catch(() => {})
        api.get(`/cabinet/education/streams/${s.id}/viewers/`)
          .then(r2 => setViewers(r2.data || []))
          .catch(() => {})
      } catch {}
      finally { inflight = false }
    }

    tick()
    const id = setInterval(tick, 8000)
    return () => { clearInterval(id); joinedRef.current = false }
  }, [streamId])

  // ── Guest invite polling ──────────────────────────────────────────────────
  useEffect(() => {
    const sid = stream?.id
    if (!sid || stream?.status !== 'live') {
      clearInterval(guestPollRef.current)
      return
    }
    const poll = async () => {
      try {
        const r = await api.get(`/cabinet/education/streams/${sid}/guest/`)
        const invite = r.data?.invite
        // Trainer ended the call from their side
        if (!invite && onStage) {
          leaveStage(false)
        }
        // Update local state
        if (invite?.status === 'invited') setGuestInvite(invite)
        else if (!invite) setGuestInvite(null)
      } catch {}
    }
    poll()
    guestPollRef.current = setInterval(poll, 4000)
    return () => clearInterval(guestPollRef.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream?.id, stream?.status, onStage])

  // ── Stage actions ─────────────────────────────────────────────────────────

  const acceptInvite = async () => {
    if (!stream?.id || !guestInvite) return
    setStageState('requesting-media')
    let localStream
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch(e) {
      setWarning('Нужен доступ к камере и микрофону. Разрешите в настройках браузера.')
      setTimeout(() => setWarning(''), 5000)
      setStageState('')
      return
    }
    stageLocalRef.current = localStream
    if (stagePreviewRef.current) stagePreviewRef.current.srcObject = localStream

    try {
      // Tell backend we accept
      await api.post(`/cabinet/education/streams/${stream.id}/guest/`)
    } catch(e) {
      setWarning('Не удалось принять приглашение.')
      setTimeout(() => setWarning(''), 4000)
      setStageState('')
      try { localStream.getTracks().forEach(t => t.stop()) } catch {}
      return
    }

    setOnStage(true)
    setStageState('connecting')
    setGuestInvite(null)

    const baseUrl = `/cabinet/education/streams/${stream.id}/guest/webrtc/`
    let connected = false
    let timedOut = false

    // Fetch TURN credentials before setting up P2P — needed for NAT
    // traversal when the guest is on cellular and the trainer is on Wi-Fi.
    let turnIceServers
    try {
      const tr = await api.post(`/cabinet/education/streams/${stream.id}/turn-credentials/`)
      turnIceServers = tr.data?.iceServers
    } catch { /* falls back to default STUN */ }

    // 30s timeout: if trainer never sends offer / connection never establishes,
    // cleanly tear down and tell user instead of spinning forever.
    const timeoutId = setTimeout(() => {
      if (!connected) {
        timedOut = true
        setStageState('failed')
        setWarning('Не удалось установить связь с тренером. Попробуйте ещё раз.')
        setTimeout(() => setWarning(''), 5000)
        leaveStage(true)
      }
    }, 30000)

    try {
      const session = await startGuestP2P({
        localStream,
        iceServers: turnIceServers,
        poll:        async () => (await api.get(baseUrl)).data,
        postAnswer:  async (sdp) => { await api.post(baseUrl, { answer_sdp: sdp }) },
        postIce:     async (cand) => { await api.post(baseUrl, { ice: cand }).catch(() => {}) },
        onRemoteStream: (rs) => {
          stageRemoteStreamRef.current = rs
          // Bind immediately if the <video> is already in the DOM. The
          // ref-callback below also re-binds the next time it mounts, so
          // an early arrival here doesn't get lost.
          if (stageRemoteRef.current && stageRemoteRef.current.srcObject !== rs) {
            stageRemoteRef.current.srcObject = rs
            stageRemoteRef.current.play().catch(() => {})
          }
        },
        onConnected: () => {
          connected = true
          clearTimeout(timeoutId)
          if (!timedOut) setStageState('live')
        },
        onFailed: () => {
          clearTimeout(timeoutId)
          setStageState('failed')
        },
      })
      stagePcRef.current = session
    } catch(e) {
      clearTimeout(timeoutId)
      console.warn('[guest] P2P failed:', e)
      setStageState('failed')
      // Cleanup on hard failure
      try { localStream.getTracks().forEach(t => t.stop()) } catch {}
      stageLocalRef.current = null
      setOnStage(false)
    }
  }

  const declineInvite = async () => {
    if (!stream?.id) return
    try { await api.delete(`/cabinet/education/streams/${stream.id}/guest/`) } catch {}
    setGuestInvite(null)
  }

  const leaveStage = async (notifyServer = true) => {
    if (notifyServer && stream?.id) {
      try { await api.delete(`/cabinet/education/streams/${stream.id}/guest/`) } catch {}
    }
    try { stagePcRef.current?.close() } catch {}
    stagePcRef.current = null
    try { stageLocalRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    stageLocalRef.current = null
    if (stagePreviewRef.current) stagePreviewRef.current.srcObject = null
    if (stageRemoteRef.current) stageRemoteRef.current.srcObject = null
    stageRemoteStreamRef.current = null
    setOnStage(false)
    setStageState('')
    setStageMicOn(true)
    setStageCamOn(true)
  }

  const toggleStageMic = () => {
    const t = stageLocalRef.current?.getAudioTracks()?.[0]
    if (t) { t.enabled = !t.enabled; setStageMicOn(t.enabled) }
  }
  const toggleStageCam = () => {
    const t = stageLocalRef.current?.getVideoTracks()?.[0]
    if (t) { t.enabled = !t.enabled; setStageCamOn(t.enabled) }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { stagePcRef.current?.close() } catch {}
      try { stageLocalRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    }
  }, [])

  // Bind local stream → preview <video> after on-stage element mounts.
  // ref-callback alone isn't enough on iOS — also ensure explicit play().
  useEffect(() => {
    if (!onStage) return
    const v = stagePreviewRef.current
    const s = stageLocalRef.current
    if (!v || !s) return
    if (v.srcObject !== s) v.srcObject = s
    const tryPlay = () => v.play().catch(e => console.warn('[guest preview] play failed:', e))
    tryPlay()
    // Some iOS Safari versions need a second nudge after metadata loads
    v.addEventListener('loadedmetadata', tryPlay, { once: true })
    return () => v.removeEventListener('loadedmetadata', tryPlay)
  }, [onStage])

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(
      Boolean(document.fullscreenElement || document.webkitFullscreenElement)
    )
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) await document.exitFullscreen()
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
        return
      }
      // На iOS Safari fullscreen работает только на <video> через
      // webkitEnterFullscreen — playerRef проксирует этот вызов.
      const p = playerRef.current
      if (p?.requestFullscreen) { await p.requestFullscreen(); return }
      // Десктоп fallback: fullscreen на shell-обёртке (плеер + watermark + чат)
      const node = playerShellRef.current
      if (node?.requestFullscreen) await node.requestFullscreen()
    } catch {}
  }

  const watermarkText = joined?.watermark?.text || ''
  const isLive = stream && stream.status === 'live'

  // ── Live: YouTube-style layout ───────────────────────────────────────────
  if (isLive) {
    return (
      <div className="bg-[#06080f] text-white flex flex-col md:flex-row fixed inset-0 overflow-hidden">

        {/* ── Left/Main column ──────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 min-h-0 min-w-0">

          {/* Video — 16:9 on mobile, fills height on desktop.
              When the student is on stage, we hide the CF playback (which
              already contains the student's own face composited by the
              trainer mixer — that's what the other viewers see) and show
              the trainer's P2P stream directly. This kills the
              "I see myself twice" effect, and gives realtime audio with
              no CF buffering delay. */}
          <div ref={playerShellRef} data-protected-root
               className="relative w-full bg-black shrink-0 overflow-hidden aspect-video md:flex-1 md:min-h-0 md:aspect-auto">
            {!onStage && (
              <>
                <CloudflareStreamPlayer
                  ref={playerRef}
                  uid={stream.cf_playback_id}
                  subdomain={stream.cf_subdomain || CF_SUBDOMAIN_FALLBACK}
                  live
                />
                <Watermark text={watermarkText} />
              </>
            )}
            {onStage && (
              <video
                ref={el => {
                  stageRemoteRef.current = el
                  // Re-bind whenever the element mounts, in case the
                  // remote stream arrived before we were on stage.
                  const rs = stageRemoteStreamRef.current
                  if (el && rs && el.srcObject !== rs) {
                    el.srcObject = rs
                    el.play().catch(() => {})
                  }
                }}
                autoPlay playsInline
                className="absolute inset-0 w-full h-full object-cover bg-black"
              />
            )}

            {/* Top bar */}
            <div className="absolute top-0 inset-x-0 z-20 flex items-center gap-2 px-3 py-2.5
                            bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
              <Link to="/cabinet/profile" aria-label="Назад"
                className="pointer-events-auto p-2 rounded-xl bg-black/40 border border-white/10 backdrop-blur active:bg-black/60">
                <ChevronLeft size={18} />
              </Link>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600 shadow">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.18em]">LIVE</span>
              </div>
              <div className="flex-1" />
              <button type="button" onClick={() => setShowViewers(true)}
                aria-label={`Зрителей: ${viewers.length}`}
                className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 backdrop-blur text-[12px] font-medium active:bg-black/60">
                <Users size={14} /> {viewers.length}
              </button>
              {/* Fullscreen — desktop only; on iOS Safari нативные video-контролы дают свой fullscreen */}
              <button type="button" onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Свернуть' : 'Во весь экран'}
                className="hidden md:inline-flex pointer-events-auto p-2 rounded-xl bg-black/40 border border-white/10 backdrop-blur active:bg-black/60">
                {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
              </button>
            </div>

            {/* PIP self-preview while on stage */}
            {onStage && (
              <div className="absolute bottom-3 right-3 w-24 h-32 sm:w-28 sm:h-40 rounded-2xl overflow-hidden border-2 border-emerald-400/80 shadow-2xl bg-black z-30">
                <video ref={stagePreviewRef} autoPlay muted playsInline
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }} />
                <div className="absolute top-1 left-1 right-1 flex justify-between items-center">
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-600 text-[9px] text-white font-bold">ВЫ</span>
                  {stageState === 'connecting' && (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Title strip — compact */}
          <div className="px-3 py-2 border-b border-white/10 bg-black/60 shrink-0 flex items-center gap-2">
            <h2 className="text-[13px] font-semibold leading-tight truncate flex-1 min-w-0">{stream.title}</h2>
            <span className="flex items-center gap-1 text-[10px] text-white/50 shrink-0">
              <Shield size={10} /> Защищено
            </span>
          </div>

          {/* On-stage controls — inline, between title and chat (mobile + desktop) */}
          {onStage && (
            <div className="shrink-0 px-3 py-2 border-b border-white/10 bg-black/70 flex items-center justify-center gap-2">
              <button onClick={toggleStageMic}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 ${stageMicOn ? 'bg-white/15 text-white' : 'bg-rose-600 text-white'}`}>
                {stageMicOn ? <Mic size={15} /> : <MicOff size={15} />}
              </button>
              <button onClick={toggleStageCam}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition active:scale-90 ${stageCamOn ? 'bg-white/15 text-white' : 'bg-rose-600 text-white'}`}>
                {stageCamOn ? <Video size={15} /> : <VideoOff size={15} />}
              </button>
              <div className="px-2 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${stageState === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-pulse'}`} />
                <span className="text-[11px] text-white/85 font-medium">
                  {stageState === 'live' ? 'На сцене' : stageState === 'connecting' ? 'Соединение…' : 'Подождите'}
                </span>
              </div>
              <button onClick={() => leaveStage(true)}
                className="flex items-center gap-1 ml-auto px-3 h-9 rounded-full bg-rose-600 text-white text-xs font-semibold active:scale-95">
                <PhoneOff size={12} /> Покинуть
              </button>
            </div>
          )}

          {/* Mobile chat — always visible, fills remaining space, hides on desktop */}
          <div className="flex-1 min-h-0 flex flex-col md:hidden">
            <StreamChat streamId={stream.id} isTrainer={false} />
          </div>
        </div>

        {/* ── Desktop sidebar chat — hidden on mobile ───────────────────── */}
        <aside className="hidden md:flex w-80 shrink-0 flex-col border-l border-white/10 h-full">
          <StreamChat streamId={stream.id} isTrainer={false} />
        </aside>

        {/* P2P trainer video is now rendered above (inside playerShell) when
            onStage — no separate hidden element needed. */}

        {warning && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-[13px]">
            <AlertTriangle size={15} /> {warning}
          </div>
        )}

        {/* Guest invite banner */}
        {guestInvite && guestInvite.status === 'invited' && !onStage && (
          <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-sm">
            <div className="bg-[#1a1d2e] border border-emerald-500/40 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <PhoneCall size={20} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Тренер приглашает вас на сцену!</p>
                  <p className="text-white/50 text-xs">Вас увидят все зрители прямого эфира</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={acceptInvite}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold active:scale-95 transition">
                  Принять ✨
                </button>
                <button onClick={declineInvite}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 text-white/70 text-sm active:scale-95 transition">
                  Отклонить
                </button>
              </div>
            </div>
          </div>
        )}

        {/* On-stage controls moved inline above the chat — see above */}

        {/* Viewers drawer */}
        {showViewers && (
          <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={() => setShowViewers(false)}>
            <div className="bg-white w-full rounded-t-3xl max-h-[70dvh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100">
                <div className="flex items-center gap-2">
                  <Users size={18} className="text-rose-500" />
                  <h3 className="font-semibold text-[15px] text-gray-900">На эфире ({viewers.length})</h3>
                </div>
                <button type="button" onClick={() => setShowViewers(false)} aria-label="Закрыть" className="p-2 rounded-xl text-gray-400 hover:bg-gray-50">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
                {viewers.length === 0 && <p className="text-center text-sm text-gray-400 py-8">Пока никого нет.</p>}
                {viewers.map(v => (
                  <div key={v.id} className="flex items-center gap-3 px-2 py-2 rounded-xl">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-300 to-pink-400 flex items-center justify-center text-white font-semibold text-[13px]">
                      {(v.client_name || '?').charAt(0)}
                    </div>
                    <div className="text-[13.5px] flex-1 min-w-0 text-gray-900">
                      <div className="font-medium truncate">{v.client_name || 'Гость'}</div>
                      <div className="text-[11px] text-emerald-600">в эфире</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Non-live states ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-20">
        <div className="max-w-md sm:max-w-2xl mx-auto px-4 py-3.5 flex items-center gap-2">
          <Link to="/cabinet/profile" className="p-2 rounded-xl hover:bg-rose-50 active:bg-rose-100" aria-label="Назад">
            <ChevronLeft size={20} />
          </Link>
          <Radio size={18} className="text-rose-500" aria-hidden />
          <h1 className="text-[16px] font-semibold flex-1">Прямой эфир</h1>
          <span className="flex items-center gap-1 text-[11px] text-rose-500">
            <Shield size={12} /> Защищено
          </span>
        </div>
      </header>

      <main className="max-w-md sm:max-w-2xl mx-auto px-4 py-6">
        {warning && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm">
            <AlertTriangle size={15} /> {warning}
          </div>
        )}
        {error && <div className="p-4 rounded-2xl bg-rose-50 text-rose-700 mb-4 text-sm">{error}</div>}

        {streamEnded && (
          <EmptyState icon={CheckCircle2} iconBg="#d1fae5" iconColor="#10b981"
            title="Эфир завершён" text="Тренер закончил трансляцию. Запись появится в архиве." />
        )}
        {stream && stream.status === 'scheduled' && (
          <EmptyState icon={Clock} iconBg="#fef3c7" iconColor="#f59e0b"
            title={stream.title} text="Тренер ещё не начал трансляцию. Страница обновится автоматически."
            footer={<span className="inline-flex items-center gap-1.5 text-[12px] text-amber-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> Ожидание начала</span>} />
        )}
        {!stream && !streamEnded && !error && accessDenied && (
          <EmptyState icon={AlertTriangle} iconBg="#fef3c7" iconColor="#f59e0b"
            title={accessDenied === 'not_found' ? 'Эфир не найден' : 'Нет доступа к эфиру'}
            text={accessDenied === 'not_found'
              ? 'Ссылка устарела или была удалена. Попросите тренера прислать новую.'
              : 'Этот эфир открыт другой группе. Свяжитесь с тренером для уточнения.'} />
        )}
        {!stream && !streamEnded && !error && !accessDenied && (
          <EmptyState icon={Radio} iconBg="#fce7f3" iconColor="#ec4899"
            title="Сейчас эфиров нет" text="Когда тренер начнёт трансляцию — она появится здесь." />
        )}
      </main>
    </div>
  )
}

function EmptyState({ icon: Icon, iconBg, iconColor, title, text, footer }) {
  return (
    <div className="text-center py-14 px-4">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: iconBg }}>
        <Icon size={36} style={{ color: iconColor }} />
      </div>
      <p className="text-[18px] font-semibold text-gray-700 px-2">{title}</p>
      <p className="text-[13px] mt-2 text-gray-500 max-w-xs mx-auto">{text}</p>
      {footer && <div className="mt-4">{footer}</div>}
      <Link to="/cabinet/archive"
        className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-[13px] font-medium border border-rose-200 active:bg-rose-50"
        style={{ background: 'linear-gradient(135deg,#fdf2f8,#fce7f3)', color: '#be185d' }}>
        <Archive size={14} /> Смотреть записи эфиров
      </Link>
    </div>
  )
}
