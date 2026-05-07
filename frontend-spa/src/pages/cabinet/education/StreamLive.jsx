import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, Radio, Users, Shield, AlertTriangle, Archive,
  CheckCircle2, Clock, X, Maximize2, Minimize2, MessageCircle,
  PhoneCall, PhoneOff,
} from 'lucide-react'
import api from '../../../api/axios'
import CloudflareStreamPlayer from '../../../components/education/CloudflareStreamPlayer'
import Watermark from '../../../components/education/Watermark'
import useContentProtection from '../../../components/education/useContentProtection'
import StreamChat from '../../../components/education/StreamChat'

const CF_SUBDOMAIN = 'customer-cyusd1ztro8pgq40.cloudflarestream.com'

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
  const [showChat,     setShowChat]     = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Guest invite ──────────────────────────────────────────────────────────
  const [guestInvite,     setGuestInvite]     = useState(null)   // { id, status, jitsi_room, jitsi_token }
  const [showGuestJitsi,  setShowGuestJitsi]  = useState(false)
  const [guestJitsiData,  setGuestJitsiData]  = useState(null)   // { jitsi_room, jitsi_token, jitsi_domain }
  const guestPollRef = useRef(null)

  const videoRef       = useRef(null)
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

    const tick = async () => {
      if (streamEndedRef.current) return
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
        setGuestInvite(invite || null)
      } catch {}
    }

    poll()
    guestPollRef.current = setInterval(poll, 4000)
    return () => clearInterval(guestPollRef.current)
  }, [stream?.id, stream?.status])

  // ── Accept guest invite ───────────────────────────────────────────────────
  const acceptInvite = async () => {
    if (!guestInvite || !stream?.id) return
    try {
      const r = await api.post(`/cabinet/education/streams/${stream.id}/guest/`)
      setGuestJitsiData(r.data)
      setShowGuestJitsi(true)
    } catch(e) {
      setWarning('Не удалось принять приглашение. Попробуйте ещё раз.')
      setTimeout(() => setWarning(''), 4000)
    }
  }

  const declineInvite = () => setGuestInvite(null)

  const leaveGuest = () => {
    setShowGuestJitsi(false)
    setGuestJitsiData(null)
    setGuestInvite(null)
  }

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === playerShellRef.current)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = async () => {
    const node = playerShellRef.current
    if (!node) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (node.requestFullscreen) await node.requestFullscreen()
    } catch {}
  }

  const watermarkText = joined?.watermark?.text || ''
  const isLive = stream && stream.status === 'live'
  const jitsiDomain = guestJitsiData?.jitsi_domain || 'jitsi.crm.aiym-syry.kg'

  // ── Live full-screen layout ───────────────────────────────────────────────
  if (isLive) {
    return (
      <div className="min-h-screen bg-[#06080f] flex" style={{ minHeight: '100dvh' }}>

        {/* Main stream area */}
        <div className={`flex-1 flex flex-col relative transition-all duration-300 ${showChat ? 'mr-0' : ''}`}>

          {/* Top bar */}
          <header className="px-3 py-2.5 flex items-center gap-2 text-white bg-gradient-to-b from-black/70 to-transparent absolute inset-x-0 top-0 z-20">
            <Link to="/cabinet/profile" aria-label="Назад"
              className="p-2 rounded-xl bg-black/35 border border-white/10 backdrop-blur active:bg-black/60">
              <ChevronLeft size={20} />
            </Link>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-600 shadow">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              <span className="text-[10px] font-bold tracking-[0.18em]">LIVE</span>
            </div>
            <div className="flex-1" />
            <button type="button" onClick={() => setShowViewers(true)}
              aria-label={`Зрителей: ${viewers.length}`}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/35 border border-white/10 backdrop-blur text-[12px] font-medium active:bg-black/60">
              <Users size={14} /> {viewers.length}
            </button>
            {/* Chat toggle */}
            <button type="button" onClick={() => setShowChat(p => !p)}
              aria-label="Чат"
              className={`p-2 rounded-xl border backdrop-blur active:bg-black/60 ${showChat ? 'bg-rose-600 border-rose-400' : 'bg-black/35 border-white/10'}`}>
              <MessageCircle size={18} />
            </button>
            <button type="button" onClick={toggleFullscreen}
              aria-label={isFullscreen ? 'Выйти из полноэкранного режима' : 'Открыть на весь экран'}
              className="p-2 rounded-xl bg-black/35 border border-white/10 backdrop-blur active:bg-black/60">
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </header>

          {/* Player */}
          <div ref={playerShellRef} data-protected-root className="flex-1 relative flex items-center justify-center">
            <div className="w-full h-full">
              <CloudflareStreamPlayer uid={stream.cf_playback_id} subdomain={CF_SUBDOMAIN} />
            </div>
            <Watermark text={watermarkText} />
          </div>

          {/* Title strip */}
          <div className="px-4 pt-3 pb-4 bg-gradient-to-t from-black to-black/70 text-white border-t border-white/10">
            <h2 className="text-[15px] font-semibold leading-tight">{stream.title}</h2>
            {stream.description && (
              <p className="text-[12px] text-white/70 mt-1 line-clamp-2">{stream.description}</p>
            )}
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-white/50">
              <Shield size={11} /> Запись защищена
            </p>
          </div>

          {/* Warning toast */}
          {warning && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-4 py-2 rounded-xl shadow-lg flex items-center gap-2 text-[13px]">
              <AlertTriangle size={15} /> {warning}
            </div>
          )}

          {/* ── Guest invite banner ── */}
          {guestInvite && guestInvite.status === 'invited' && !showGuestJitsi && (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-[90vw] max-w-sm">
              <div className="bg-[#1a1d2e] border border-emerald-500/40 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <PhoneCall size={20} className="text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Тренер приглашает вас на сцену!</p>
                    <p className="text-white/50 text-xs">Вы сможете говорить с тренером в прямом эфире</p>
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

          {/* ── Active guest call badge ── */}
          {showGuestJitsi && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
              <button onClick={() => setShowGuestJitsi(true)}
                className="flex items-center gap-2 bg-emerald-700 border border-emerald-500/40 rounded-full px-4 py-2 text-white text-sm font-medium shadow-xl">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                Вы на сцене
                <button onClick={leaveGuest} className="ml-2 text-emerald-200 hover:text-white">
                  <PhoneOff size={14} />
                </button>
              </button>
            </div>
          )}

          {/* Viewers drawer */}
          {showViewers && (
            <div className="fixed inset-0 z-40 bg-black/60 flex items-end" onClick={() => setShowViewers(false)}>
              <div className="bg-white w-full rounded-t-3xl max-h-[70dvh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-rose-100">
                  <div className="flex items-center gap-2">
                    <Users size={18} className="text-rose-500" />
                    <h3 className="font-semibold text-[15px]">На эфире ({viewers.length})</h3>
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
                      <div className="text-[13.5px] flex-1 min-w-0">
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

        {/* ── Chat panel ── */}
        {showChat && (
          <div className="w-72 shrink-0 flex flex-col" style={{ height: '100dvh' }}>
            <StreamChat
              streamId={stream.id}
              isTrainer={false}
              onClose={() => setShowChat(false)}
            />
          </div>
        )}

        {/* ── Guest Jitsi fullscreen modal ── */}
        {showGuestJitsi && guestJitsiData && (
          <div className="fixed inset-0 z-50 bg-black flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 bg-black border-b border-white/10">
              <span className="text-white text-sm font-semibold flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Вы на сцене
              </span>
              <button onClick={leaveGuest}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold active:scale-95">
                <PhoneOff size={13} /> Покинуть сцену
              </button>
            </div>
            <div className="flex-1">
              <iframe
                title="Guest call"
                src={`https://${jitsiDomain}/${guestJitsiData.jitsi_room}?jwt=${guestJitsiData.jitsi_token}`}
                allow="camera; microphone; fullscreen; display-capture"
                className="w-full h-full border-0"
              />
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
