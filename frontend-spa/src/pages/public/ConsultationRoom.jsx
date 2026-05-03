import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Video, AlertTriangle, PhoneOff } from 'lucide-react'
import api from '../../api/axios'

/**
 * Public consultation room — no auth required.
 * Loads Jitsi external_api.js and embeds the call in an iframe within this page.
 * Polls /api/consultation/{uuid}/status/ every 10 s so if the trainer stops
 * the session, this page closes Jitsi and shows a "session ended" screen.
 */
export default function ConsultationRoom() {
  const { uuid } = useParams()
  const [params] = useSearchParams()
  const [name, setName] = useState(params.get('name') || '')
  const [info, setInfo] = useState(null)       // set after successful join
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [ended, setEnded] = useState(false)    // trainer stopped the session

  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const pollRef = useRef(null)

  const handleJoin = async () => {
    setLoading(true); setError('')
    try {
      const r = await api.get(`/consultation/${uuid}/`, {
        params: name ? { name } : {},
      })
      if (!r.data?.valid) {
        const reasons = {
          not_found: 'Ссылка не найдена.',
          expired:   'Срок действия ссылки истёк.',
          used:      'Консультация уже завершена.',
          cancelled: 'Консультация отменена.',
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

  // ── Jitsi initialisation ────────────────────────────────────────────────
  useEffect(() => {
    if (!info?.jitsi_domain || !info?.room_name) return
    const domain = info.jitsi_domain
    const scriptId = 'jitsi-external-api'

    const init = () => {
      if (!window.JitsiMeetExternalAPI || !containerRef.current) return
      if (apiRef.current) return

      apiRef.current = new window.JitsiMeetExternalAPI(domain, {
        roomName: info.room_name,
        parentNode: containerRef.current,
        width: '100%',
        height: '100%',
        userInfo: { displayName: info.display_name || 'Гость' },
        ...(info.jitsi_token ? { jwt: info.jitsi_token } : {}),
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
          prejoinPageEnabled: false,
          prejoinConfig: { enabled: false },
          disableDeepLinking: true,
          enableWelcomePage: false,
          enableClosePage: false,
          requireDisplayName: false,
          disableInviteFunctions: true,
          toolbarButtons: [
            'microphone', 'camera', 'desktop', 'fullscreen',
            'hangup', 'chat', 'tileview', 'videoquality', 'settings',
          ],
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          SHOW_JITSI_WATERMARK: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
        },
      })

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
      s.onerror = () => setError('Не удалось загрузить видеозвонок. Проверьте соединение.')
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

  // ── Status polling — auto-close when trainer stops ──────────────────────
  useEffect(() => {
    if (!info) return

    const poll = async () => {
      try {
        const r = await api.get(`/consultation/${uuid}/status/`)
        // 'used' = link quota reached but session is still live.
        // Only 'cancelled' / 'expired' / 'not_found' mean the trainer ended the call.
        const truly_ended = !r.data?.active && !['used', 'active'].includes(r.data?.status)
        if (truly_ended) {
          if (apiRef.current) {
            try { apiRef.current.dispose() } catch {}
            apiRef.current = null
          }
          setEnded(true)
          clearInterval(pollRef.current)
        }
      } catch {
        // Network blip — keep polling
      }
    }

    pollRef.current = setInterval(poll, 10_000)
    return () => clearInterval(pollRef.current)
  }, [info, uuid])

  // ── "Session ended" screen ──────────────────────────────────────────────
  if (ended) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center mx-auto mb-4">
            <PhoneOff size={28} className="text-rose-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Консультация завершена</h2>
          <p className="text-sm text-gray-500">
            Тренер завершил сеанс. Спасибо за участие!
          </p>
        </div>
      </div>
    )
  }

  // ── Active room ─────────────────────────────────────────────────────────
  if (info) {
    return (
      <div style={{ height: '100dvh', background: '#000' }} className="flex flex-col relative">
        <div ref={containerRef} style={{ flex: 1, width: '100%', minHeight: 0 }} />
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white p-6 sm:p-8 text-center gap-4">
            <AlertTriangle size={48} className="text-rose-400" aria-hidden="true" />
            <p className="text-base sm:text-lg font-semibold">{error}</p>
          </div>
        )}
      </div>
    )
  }

  // ── Join form ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-purple-100 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-5 sm:mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center shrink-0">
            <Video size={24} className="text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold">Онлайн консультация</h1>
            <p className="text-xs sm:text-sm text-gray-500">1-на-1 видеозвонок с тренером</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-700 text-sm mb-4 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
          </div>
        )}

        <label htmlFor="consult-name" className="block text-sm font-medium text-gray-700 mb-1">
          Как вас зовут?
        </label>
        <input
          id="consult-name"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleJoin()}
          placeholder="Введите ваше имя"
          autoComplete="name"
          className="w-full px-4 py-2.5 rounded-xl border border-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-300"
        />

        <button
          onClick={handleJoin}
          disabled={loading}
          className="mt-5 w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 to-purple-500 text-white font-semibold shadow-md hover:shadow-lg transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-violet-300 flex items-center justify-center gap-2"
        >
          {loading && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true" />}
          {loading ? 'Подключение…' : 'Войти в комнату'}
        </button>

        <p className="mt-4 text-xs text-gray-400 text-center">
          Видеозвонок откроется прямо в этом браузере — ничего устанавливать не нужно.
        </p>
      </div>
    </div>
  )
}
