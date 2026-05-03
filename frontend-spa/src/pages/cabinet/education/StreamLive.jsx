import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Radio, Users, Shield, AlertTriangle, Archive, CheckCircle2, Clock } from 'lucide-react'
import api from '../../../api/axios'
import CloudflareStreamPlayer from '../../../components/education/CloudflareStreamPlayer'
import Watermark from '../../../components/education/Watermark'
import useContentProtection from '../../../components/education/useContentProtection'

const CF_SUBDOMAIN = 'customer-cyusd1ztro8pgq40.cloudflarestream.com'

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
  // Backend returns {stream:null, reason:'forbidden'|'not_found'} when access
  // denied or stream missing. Surface that to the user instead of the generic
  // "Сейчас эфиров нет" — which made them think the link was broken.
  const [accessDenied, setAccessDenied] = useState('') // '' | 'forbidden' | 'not_found'
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

  // Refs to access latest state inside intervals without re-creating them
  const streamRef = useRef(null)
  const streamEndedRef = useRef(false)
  const joinedRef = useRef(false)
  streamRef.current = stream
  streamEndedRef.current = streamEnded

  // Auth check on mount
  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) nav('/cabinet')
  }, [nav])

  // Single interval drives everything: active poll + join + heartbeat + viewers
  useEffect(() => {
    const pollUrl = streamId
      ? `/cabinet/education/streams/active/?id=${streamId}`
      : '/cabinet/education/streams/active/'

    const tick = async () => {
      if (streamEndedRef.current) return

      // 1. Active stream check
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

        // 2. Join once
        if (!joinedRef.current) {
          joinedRef.current = true
          api.post(`/cabinet/education/streams/${s.id}/join/`)
            .then(r2 => setJoined(r2.data))
            .catch(() => { joinedRef.current = false })
        }

        // 3. Heartbeat (every other tick = ~10s)
        api.post(`/cabinet/education/streams/${s.id}/heartbeat/`).catch(() => {})

        // 4. Viewers
        api.get(`/cabinet/education/streams/${s.id}/viewers/`)
          .then(r2 => setViewers(r2.data || []))
          .catch(() => {})
      } catch {
        // network error — skip tick
      }
    }

    tick() // immediate first call
    const id = setInterval(tick, 8000)
    return () => {
      clearInterval(id)
      joinedRef.current = false
    }
  }, [streamId]) // stable — never restarts while on the page

  const watermarkText = joined?.watermark?.text || ''

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

        {/* Access denied / not found — distinct from "no stream right now"
            so the student understands WHY a link they were given doesn't open. */}
        {!stream && !streamEnded && !error && accessDenied && (
          <div className="text-center py-20 text-gray-500">
            <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-5">
              <AlertTriangle size={36} className="text-amber-400" />
            </div>
            <p className="text-xl font-semibold text-gray-700">
              {accessDenied === 'not_found' ? 'Эфир не найден' : 'Нет доступа к эфиру'}
            </p>
            <p className="text-sm mt-2 text-gray-400 max-w-md mx-auto">
              {accessDenied === 'not_found'
                ? 'Ссылка устарела или была удалена. Попросите тренера прислать новую.'
                : 'Этот эфир открыт другой группе. Свяжитесь с тренером для уточнения.'}
            </p>
            <Link
              to="/cabinet/archive"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 rounded-xl text-sm font-medium transition"
              style={{ background: 'linear-gradient(135deg,#fdf2f8,#fce7f3)', color: '#be185d', border: '1px solid #f9a8d4' }}
            >
              <Archive size={15} /> Смотреть записи эфиров
            </Link>
          </div>
        )}

        {!stream && !streamEnded && !error && !accessDenied && (
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
                <CloudflareStreamPlayer
                  uid={stream.cf_playback_id}
                  subdomain={CF_SUBDOMAIN}
                />
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
