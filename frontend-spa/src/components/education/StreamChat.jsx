/**
 * StreamChat — Telegram-style real-time chat for live streams.
 *
 * Props:
 *   streamId   string   — live stream UUID
 *   isTrainer  bool     — true = admin/trainer side (uses staff API)
 *   senderName string   — display name for trainer side
 *   onClose    fn       — called when user taps ×
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Send, MessageCircle, Wifi, WifiOff } from 'lucide-react'
import api from '../../api/axios'

const POLL_MS = 3000

function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

/* Colour deterministically from sender name — keeps each participant's
   avatar colour stable across sessions. */
const AVATAR_COLORS = [
  ['#7c3aed', '#5b21b6'], ['#db2777', '#be185d'], ['#0369a1', '#0284c7'],
  ['#059669', '#047857'], ['#d97706', '#b45309'], ['#dc2626', '#b91c1c'],
]
function avatarGradient(name) {
  const i = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length
  const [from, to] = AVATAR_COLORS[i]
  return `linear-gradient(135deg, ${from}, ${to})`
}

/* Group messages by sender + closeness in time so we don't repeat avatars */
function groupMessages(messages) {
  const groups = []
  messages.forEach((m, i) => {
    const prev = messages[i - 1]
    const sameAuthor = prev && prev.is_trainer === m.is_trainer && prev.sender_name === m.sender_name
    const closeInTime = prev && (new Date(m.created_at) - new Date(prev.created_at)) < 60_000
    if (sameAuthor && closeInTime) {
      groups[groups.length - 1].msgs.push(m)
    } else {
      groups.push({ key: m.id, isTrainer: m.is_trainer, name: m.sender_name, msgs: [m] })
    }
  })
  return groups
}

export default function StreamChat({ streamId, isTrainer = false, senderName = 'Тренер', onClose }) {
  const [messages,   setMessages]   = useState([])
  const [text,       setText]       = useState('')
  const [sending,    setSending]    = useState(false)
  const [online,     setOnline]     = useState(true)
  const lastTsRef    = useRef(null)
  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const failCountRef = useRef(0)
  const inflightRef  = useRef(false)

  const chatUrl = isTrainer
    ? `/education/streams/${streamId}/chat/`
    : `/cabinet/education/streams/${streamId}/chat/`

  /* ── Polling ──────────────────────────────────────────────────────────── */
  const poll = useCallback(async () => {
    if (inflightRef.current) return
    inflightRef.current = true
    try {
      const params = lastTsRef.current ? { after: lastTsRef.current } : { limit: 100 }
      const r = await api.get(chatUrl, { params })
      const msgs = r.data || []
      if (msgs.length) {
        lastTsRef.current = msgs[msgs.length - 1].created_at
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id))
          return [...prev, ...msgs.filter(m => !ids.has(m.id))]
        })
      }
      failCountRef.current = 0
      setOnline(true)
    } catch {
      failCountRef.current = Math.min(failCountRef.current + 1, 10)
      if (failCountRef.current >= 3) setOnline(false)
    } finally { inflightRef.current = false }
  }, [chatUrl])

  useEffect(() => {
    if (!streamId) return
    poll()
    const t = setInterval(() => { if (!document.hidden) poll() }, POLL_MS)
    const onVis = () => { if (!document.hidden) { clearInterval(t); poll() } }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, poll])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* ── Send ─────────────────────────────────────────────────────────────── */
  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true); setText('')
    try {
      const r = await api.post(chatUrl, { text: t })
      const msg = r.data
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg])
      lastTsRef.current = msg.created_at
    } catch { setText(t) }
    finally { setSending(false); inputRef.current?.focus() }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const groups = groupMessages(messages)
  const remaining = 500 - text.length

  /* ── Render ───────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col h-full" style={{ background: '#111827' }}>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 shrink-0"
           style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
               style={{ background: 'linear-gradient(135deg, #be185d, #7c3aed)' }}>
            <MessageCircle size={14} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight">Чат эфира</p>
            <div className="flex items-center gap-1 mt-0.5">
              {online
                ? <><Wifi size={9} className="text-emerald-400" /><span className="text-[10px] text-emerald-400">онлайн</span></>
                : <><WifiOff size={9} className="text-rose-400" /><span className="text-[10px] text-rose-400">нет связи</span></>
              }
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Закрыть чат"
            className="w-8 h-8 rounded-full flex items-center justify-center transition"
            style={{ color: 'rgba(255,255,255,0.4)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 min-h-0"
           style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 pb-8">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                 style={{ background: 'rgba(255,255,255,0.05)' }}>
              <MessageCircle size={28} style={{ color: 'rgba(255,255,255,0.2)' }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>Сообщений пока нет</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.15)' }}>Напишите первое сообщение</p>
            </div>
          </div>
        )}

        {groups.map((group) => {
          const isSelf = isTrainer ? group.isTrainer : !group.isTrainer
          return (
            <div key={group.key}
                 className={`flex gap-2.5 ${isSelf ? 'flex-row-reverse' : 'flex-row'} items-end`}>

              {/* Avatar — shown only for "other" side and once per group */}
              {!isSelf ? (
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-0.5"
                     style={{ background: avatarGradient(group.name) }}>
                  {initials(group.name)}
                </div>
              ) : <div className="w-7 shrink-0" />}

              {/* Bubble stack */}
              <div className={`flex flex-col gap-0.5 max-w-[75%] ${isSelf ? 'items-end' : 'items-start'}`}>
                {!isSelf && (
                  <p className="text-[10px] font-semibold px-1 mb-0.5"
                     style={{ color: avatarGradient(group.name).includes('#be185d') ? '#f472b6' : '#a78bfa' }}>
                    {group.isTrainer ? '🎓 ' + group.name : group.name}
                  </p>
                )}
                {group.msgs.map((m, mi) => {
                  const isLast = mi === group.msgs.length - 1
                  return (
                    <div key={m.id} className="flex flex-col">
                      <div className="px-3 py-2 text-sm leading-snug break-words"
                           style={{
                             background: isSelf
                               ? 'linear-gradient(135deg, #be185d, #9333ea)'
                               : 'rgba(255,255,255,0.09)',
                             color: '#fff',
                             borderRadius: isSelf
                               ? (isLast ? '16px 16px 4px 16px' : '16px 16px 4px 16px')
                               : (isLast ? '16px 16px 16px 4px' : '4px 16px 16px 4px'),
                             maxWidth: '100%',
                           }}>
                        {m.text}
                      </div>
                      {isLast && (
                        <p className={`text-[9px] mt-1 px-1 ${isSelf ? 'text-right' : 'text-left'}`}
                           style={{ color: 'rgba(255,255,255,0.2)' }}>
                          {fmtTime(m.created_at)}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 pb-3 pt-2 shrink-0"
           style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="flex items-end gap-2 px-3 py-2 rounded-2xl"
             style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Сообщение…"
            rows={1}
            maxLength={500}
            className="flex-1 bg-transparent text-sm resize-none outline-none leading-snug overflow-y-hidden"
            style={{
              color: '#fff',
              minHeight: 22,
              maxHeight: 88,
              '::placeholder': { color: 'rgba(255,255,255,0.3)' },
            }}
            onInput={e => {
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 88) + 'px'
            }}
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            aria-label="Отправить"
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 self-end transition-all active:scale-90"
            style={{
              background: text.trim() && !sending
                ? 'linear-gradient(135deg, #be185d, #9333ea)'
                : 'rgba(255,255,255,0.1)',
              opacity: !text.trim() || sending ? 0.4 : 1,
            }}>
            <Send size={13} />
          </button>
        </div>
        {text.length > 400 && (
          <p className="text-[10px] text-right mt-1 px-1"
             style={{ color: remaining < 50 ? '#f43f5e' : 'rgba(255,255,255,0.25)' }}>
            {remaining} символов
          </p>
        )}
      </div>
    </div>
  )
}
