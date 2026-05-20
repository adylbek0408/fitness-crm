import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Radio } from 'lucide-react'
import api from '../api/axios'

const POLL_MS = 30_000

/**
 * Polls for an active live stream every 30 s.
 * When one is live, shows a sticky banner at the top of the page.
 * Clicking it navigates to the stream watch page.
 */
export default function LiveStreamBanner() {
  const [liveStream, setLiveStream] = useState(null)
  const nav = useNavigate()

  useEffect(() => {
    if (!localStorage.getItem('cabinet_access_token')) return

    let cancelled = false
    const check = async () => {
      try {
        const r = await api.get('/cabinet/education/streams/active/')
        if (cancelled) return
        const s = r.data?.stream
        setLiveStream(s?.status === 'live' ? s : null)
      } catch {
        if (!cancelled) setLiveStream(null)
      }
    }

    check()
    const t = setInterval(() => { if (!document.hidden) check() }, POLL_MS)
    const onVis = () => { if (!document.hidden) check() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  if (!liveStream) return null

  return (
    <button
      onClick={() => nav(`/cabinet/stream?id=${liveStream.id}`)}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white text-sm font-semibold transition active:opacity-80"
      style={{
        background: 'linear-gradient(90deg, #be185d 0%, #9333ea 100%)',
        animation: 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
      }}
    >
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
        <Radio size={14} />
        <span>Эфир идёт — {liveStream.title || 'Прямой эфир'}</span>
      </span>
      <span className="ml-2 px-2.5 py-0.5 rounded-full bg-white/20 text-xs font-bold tracking-wide">
        СМОТРЕТЬ →
      </span>
    </button>
  )
}
