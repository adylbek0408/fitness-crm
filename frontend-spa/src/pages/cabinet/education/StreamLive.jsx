import { useEffect, useRef, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ChevronLeft, Radio, Users, Shield, AlertTriangle } from 'lucide-react'
import api from '../../../api/axios'
import HlsPlayer from '../../../components/education/HlsPlayer'
import Watermark from '../../../components/education/Watermark'
import useContentProtection from '../../../components/education/useContentProtection'

export default function StreamLive() {
  const nav = useNavigate()
  const [stream, setStream] = useState(null)
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

  // Find active stream
  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) {
      nav('/cabinet'); return
    }
    api.get('/cabinet/education/streams/active/')
      .then(r => setStream(r.data?.stream || null))
      .catch(e => setError(e.response?.data?.detail || 'Ошибка'))
  }, [nav])

  // Join + heartbeat
  useEffect(() => {
    if (!stream?.id) return
    let cancelled = false
    api.post(`/cabinet/education/streams/${stream.id}/join/`)
      .then(r => { if (!cancelled) setJoined(r.data) })
      .catch(e => setError(e.response?.data?.detail || 'Не удалось подключиться'))

    const beat = setInterval(() => {
      api.post(`/cabinet/education/streams/${stream.id}/heartbeat/`).catch(() => {})
    }, 15000)
    return () => { cancelled = true; clearInterval(beat) }
  }, [stream?.id])

  // Viewers polling
  useEffect(() => {
    if (!stream?.id) return
    const pull = () => {
      api.get(`/cabinet/education/streams/${stream.id}/viewers/`)
        .then(r => setViewers(r.data || []))
        .catch(() => {})
    }
    pull()
    const id = setInterval(pull, 5000)
    return () => clearInterval(id)
  }, [stream?.id])

  const playback = joined?.playback_url || stream?.playback_url
  const watermarkText = joined?.watermark?.text || ''

  return (
    <div className="min-h-screen bg-gray-50">
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

        {!stream && !error && (
          <div className="text-center py-20 text-gray-500">
            <Radio size={56} className="mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Сейчас эфиров нет</p>
            <p className="text-sm mt-1">Когда тренер начнёт трансляцию — она появится здесь.</p>
          </div>
        )}

        {stream && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-black shadow-lg">
                {playback ? (
                  <HlsPlayer
                    src={playback}
                    autoPlay
                    onReady={v => { videoRef.current = v }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">
                    Подключаемся к эфиру…
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
