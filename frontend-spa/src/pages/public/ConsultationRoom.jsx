import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Video, AlertTriangle, Clock } from 'lucide-react'
import api from '../../api/axios'

/**
 * Public consultation room — no auth.
 * Loads Jitsi external_api.js script on demand and embeds the room.
 *
 * Backend endpoint: GET /api/consultation/{room_uuid}/?name=<display>
 */
export default function ConsultationRoom() {
  const { uuid } = useParams()
  const [params] = useSearchParams()
  const [name, setName] = useState(params.get('name') || '')
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const containerRef = useRef(null)
  const apiRef = useRef(null)

  const handleJoin = async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/consultation/${uuid}/`, {
        params: name ? { name } : {},
      })
      if (!r.data?.valid) {
        const reasons = {
          not_found: 'Ссылка не найдена.',
          expired: 'Срок действия ссылки истёк.',
          used: 'Ссылка уже использована.',
          cancelled: 'Ссылка отменена.',
        }
        setError(reasons[r.data?.reason] || 'Ссылка недействительна.')
        return
      }
      setInfo(r.data)
    } catch (e) {
      setError(e.response?.data?.detail || 'Ошибка соединения.')
    } finally {
      setLoading(false)
    }
  }

  // Load Jitsi external API once info is available
  useEffect(() => {
    if (!info?.jitsi_domain || !info?.room_name) return
    const domain = info.jitsi_domain
    const scriptId = 'jitsi-external-api'

    const init = () => {
      if (!window.JitsiMeetExternalAPI || !containerRef.current) return
      if (apiRef.current) return
      const options = {
        roomName: info.room_name,
        parentNode: containerRef.current,
        userInfo: { displayName: info.display_name || 'Гость' },
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          disableDeepLinking: true,
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
        },
      }
      if (info.jitsi_token) options.jwt = info.jitsi_token
      apiRef.current = new window.JitsiMeetExternalAPI(domain, options)
      apiRef.current.addEventListener('readyToClose', () => {
        try { apiRef.current.dispose() } catch {}
        apiRef.current = null
      })
    }

    if (!document.getElementById(scriptId)) {
      const s = document.createElement('script')
      s.id = scriptId
      s.src = `https://${domain}/external_api.js`
      s.async = true
      s.onload = init
      s.onerror = () => setError('Не удалось загрузить Jitsi.')
      document.body.appendChild(s)
    } else {
      init()
    }

    return () => {
      if (apiRef.current) {
        try { apiRef.current.dispose() } catch {}
        apiRef.current = null
      }
    }
  }, [info])

  if (info) {
    return (
      <div className="min-h-screen bg-black flex flex-col relative">
        <div ref={containerRef} className="flex-1 w-full" />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white p-8 text-center gap-4">
            <AlertTriangle size={48} className="text-rose-400" />
            <p className="text-lg font-semibold">{error}</p>
            <p className="text-sm text-gray-400">
              Комната: <span className="font-mono text-white">{info.room_name?.slice(0,8)}…</span>
            </p>
            <a
              href={`https://${info.jitsi_domain}/${info.room_name}`}
              target="_blank"
              rel="noreferrer"
              className="mt-2 px-6 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-sm font-semibold transition"
            >
              Открыть в браузере Jitsi →
            </a>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-pink-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center">
            <Video size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Онлайн консультация</h1>
            <p className="text-sm text-gray-500">1-на-1 видеозвонок с тренером</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm mb-4 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Как вас зовут?
        </label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Имя"
          className="w-full px-4 py-2.5 rounded-xl border border-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-300"
        />

        <button
          onClick={handleJoin}
          disabled={loading}
          className="mt-5 w-full py-3 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 text-white font-semibold shadow-md hover:shadow-lg transition disabled:opacity-50"
        >
          {loading ? 'Подключение…' : 'Войти в комнату'}
        </button>

        <p className="mt-4 text-xs text-gray-400 flex items-center gap-1">
          <Clock size={12} /> Ссылка одноразовая и действительна ограниченное время.
        </p>
      </div>
    </div>
  )
}
