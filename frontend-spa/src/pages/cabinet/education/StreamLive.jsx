import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Radio, Users, Shield, AlertTriangle, Archive, CheckCircle2, Clock } from 'lucide-react'
import api from '../../../api/axios'
import HlsPlayer from '../../../components/education/HlsPlayer'
import Watermark from '../../../components/education/Watermark'
import useContentProtection from '../../../components/education/useContentProtection'

export default function StreamLive() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const streamId = searchParams.get('id') // specific stream from student link

  const [stream, setStream] = useState(null)
  const [streamEnded, setStreamEnded] = useState(false)
  const [viewers, setViewers] = useState([])
  const [joined, setJoined] = useState(null)
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const videoRef = useRef(null)

  useContentProtection({
    videoRef,
    onSuspect: kind => {
      setWarning(kind === 'devtools'
        ? 'Закройте инструменты разработчика.'
        : 'Запись заблокирована.')
      setTimeout(() => setWarning(''), 4000)
    },
  })

  // Build API URL — use specific id from link when provided
  const activeUrl = streamId
    ? `/cabinet/education/streams/active/?id=${streamId}`
    : '/cabinet/education/streams/active/'

  // Find stream on mount — works for both specific ?id= links and auto-detect
  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) {
      nav('/cabinet'); return
    }
    api.get(activeUrl)
      .then(r => setStream(r.data?.stream || null))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка'))
  }, [nav, activeUrl])

  // Join + heartbeat — only when stream is actually LIVE (not scheduled)
  useEffect(() => {
    if (!stream?.id || stream.status !== 'live') return
    let cancelled = false
    api.post(`/cabinet/education/streams/${stream.id}/join/`)
      .then(r => { if (!cancelled) setJoined(r.data) })
      .catch(() => {}) // non-fatal: heartbeat keeps viewer alive

    const beat = setInterval(() => {
      api.post(`/cabinet/education/streams/${stream.id}/heartbeat/`).catch(() => {})
    }, 15000)
    return () => { cancelled = true; clearInterval(beat) }
  }, [stream?.id, stream?.status])

  // Viewers polling — only when live
  useEffect(() => {
    if (!stream?.id || stream.status !== 'live') return
    const pull = () => {
      api.get(`/cabinet/education/streams/${stream.id}/viewers/`)
        .then(r => setViewers(r.data || []))
        .catch(() => {})
    }
    pull()
    const id = setInterval(pull, 5000)
    return () => clearInterval(id)
  }, [stream?.id, stream?.status])

  const playback = joined?.playback_url || stream?.playback_url || ''
  const watermarkText = joined?.watermark?.text || ''

  // Poll every 5 s — detect when stream goes live (scheduled→live) or ends
  // Also handles: stream not yet started (shows waiting screen)
  useEffect(() => {
    // Poll even before join — to detect scheduled→live transition
    const targetId = stream?.id || streamId
    if (!targetId) return
    const pollUrl = streamId
      ? `/cabinet/education/streams/active/?id=${streamId}`
      : '/cabinet/education/streams/active/'
    const id = setInterval(() => {
      api.get(pollUrl)
        .then(r => {
          const s = r.data?.stream
          if (!s || s.status === 'ended' || s.status === 'archived') {
            // Stream ended — show "Эфир завершён" only if we were watching
            if (stream?.status === 'live') {
              setStreamEnded(true)
            } else if (s?.status === 'ended' || s?.status === 'archived') {
              setStreamEnded(true)
            }
            setStream(null)
          } else {
            setStream(s) // update status: scheduled → live triggers join effect
          }
        })
        .catch(() => {})
    }, 5000)
    return () => clearInterval(id)
  }, [stream?.id, stream?.status, streamId])

  return (
    <div className="min-h-screen" style={{ background: '#fdf8fa' }}>
      <header className="bg-white border-b border-rose-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to="/cabinet/profile" className="p-2 rounded-lg hover:bg-rose-50">
            <ChevronLeft size={22} />
          </Link>
          <Radio size={20} className="text-rose-500" />
          <h1 className="text-lg font-semibold flex-1">Прямой эфир</h1>
          <div className="flex items-center gap-1 text-xs text-rose-500">
            <Shield size={14} /> Защищено
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {warning && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-rose-600 text-white px-5 py-2 rounded-xl shadow-lg flex items-center gap-2 text-sm">
            <AlertTriangle size={16} /> {warning}
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 text-rose-700 mb-4">{error}</div>
        )}

        {streamEnded && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 size={36} className="text-emerald-400" />
            </div>
            <p className="text-xl font-semibold text-gray-700">Эфир завершён</p>
            <p className="text-sm mt-2 text-gray-400">Тренер закончил трансляцию. Запись появится в архиве.</p>
            <Link
              to="/cabinet/archive"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm font-medium transition"
              style={{ background: 'linear-gradient(135deg,#fdf2f8,#fce7f3)', color: '#be185d', border: '1px solid #f9a8d4' }}
            >
              <Archive size={15} /> Смотреть записи эфиров
            </Link>
          </div>
        )}

        {/* Stream scheduled but not yet started */}
        {stream && stream.status === 'scheduled' && (
          <div className="text-center py-20">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
              <Clock size={36} className="text-amber-400" />
            </div>
            <p className="text-xl font-semibold text-gray-700">{stream.title}</p>
            <p className="text-sm mt-2 text-gray-400">Тренер ещё не начал трансляцию.</p>
            <p className="text-xs mt-1 text-gray-400">Страница обновится автоматически когда эфир начнётся.</p>
            <div className="flex items-center justify-center gap-2 mt-4 text-amber-500 text-sm">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Ожидание начала…
            </div>
          </div>
        )}

        {!stream && !streamEnded && !error && (
          <div className="text-center py-20 text-gray-500">
            <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-5">
              <Radio size={36} className="text-rose-300" />
            </div>
            <p className="text-xl font-semibold text-gray-700">Сейчас эфиров нет</p>
            <p className="text-sm mt-2 text-gray-400">Когда тренер начнёт трансляцию — она появится здесь.</p>
            <Link
              to="/cabinet/archive"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm font-medium transition"
              style={{ background: 'linear-gradient(135deg,#fdf2f8,#fce7f3)', color: '#be185d', border: '1px solid #f9a8d4' }}
            >
              <Archive size={15} /> Смотреть записи эфиров
            </Link>
          </div>
        )}

        {stream && stream.status === 'live' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black shadow-lg">
                {playback ? (
                  <HlsPlayer
                    src={playback}
                    autoPlay
                    live
                    onReady={v => { videoRef.current = v }}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 text-sm gap-3">
                    <div className="w-8 h-8 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
                    <div className="text-center px-4">
                      <p>{joined ? 'Ожидаем видеосигнал…' : 'Подключаемся к эфиру…'}</p>
                      {joined && (
                        <p className="text-xs text-white/40 mt-1">
                          Тренер ещё не начал трансляцию. Страница обновится автоматически.
                        </p>
                      )}
                    </div>
                  </div>
                )}
                <Watermark text={watermarkText} />
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse" /> LIVE
                </div>
              </div>
              <div className="mt-4 bg-white rounded-2xl border border-rose-100 p-5">
                <h2 className="text-xl font-bold">{stream.title}</h2>
                {stream.description && (
                  <p className="text-gray-600 text-sm mt-1">{stream.description}</p>
                )}
              </div>
            </div>

            <aside className="bg-white rounded-2xl border border-rose-100 p-5 h-fit">
              <div className="flex items-center gap-2 mb-3">
                <Users size={18} className="text-rose-500" />
                <h3 className="font-semibold">На эфире ({viewers.length})</h3>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {viewers.length === 0 && (
                  <p className="text-sm text-gray-400">Пока никого нет.</p>
                )}
                {viewers.map(v => (
                  <div key={v.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-rose-50">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-rose-300 to-pink-400 flex items-center justify-center text-white font-semibold">
                      {(v.client_name || '?').charAt(0)}
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">{v.client_name || 'Гость'}</div>
                      <div className="text-xs text-emerald-600">в эфире</div>
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
