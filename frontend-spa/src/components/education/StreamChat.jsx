/**
 * StreamChat — real-time chat panel for live streams.
 *
 * Props:
 *   streamId   string   — live stream UUID
 *   isTrainer  bool     — true = admin/trainer side (uses staff API)
 *   senderName string   — display name for trainer side (not used for cabinet)
 *   onClose    fn       — called when user taps ×
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Send, MessageCircle } from 'lucide-react'
import api from '../../api/axios'

const POLL_MS = 3000

export default function StreamChat({ streamId, isTrainer = false, senderName = 'Тренер', onClose }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const lastTsRef  = useRef(null)
  const bottomRef  = useRef(null)
  const inputRef   = useRef(null)

  const chatUrl = isTrainer
    ? `/education/streams/${streamId}/chat/`
    : `/cabinet/education/streams/${streamId}/chat/`

  // ── Poll for new messages ─────────────────────────────────────────────────
  const poll = useCallback(async () => {
    try {
      const params = lastTsRef.current ? { after: lastTsRef.current } : {}
      const r = await api.get(chatUrl, { params })
      const msgs = r.data || []
      if (msgs.length) {
        lastTsRef.current = msgs[msgs.length - 1].created_at
        setMessages(prev => {
          // merge avoiding duplicates by id
          const ids = new Set(prev.map(m => m.id))
          return [...prev, ...msgs.filter(m => !ids.has(m.id))]
        })
      }
    } catch {}
  }, [chatUrl])

  useEffect(() => {
    if (!streamId) return
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [streamId, poll])

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Send ──────────────────────────────────────────────────────────────────
  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    setText('')
    try {
      const r = await api.post(chatUrl, { text: t })
      const msg = r.data
      setMessages(prev => {
        if (prev.find(m => m.id === msg.id)) return prev
        lastTsRef.current = msg.created_at
        return [...prev, msg]
      })
    } catch {
      setText(t) // restore on error
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKey = e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const autoResize = (e) => {
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 80)}px`
  }

  const fmtTime = iso => {
    try {
      return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (
    <div className="flex flex-col h-full bg-black/80 backdrop-blur-xl border-l border-white/10">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 text-white">
          <MessageCircle size={16} className="text-rose-400" />
          <span className="text-sm font-semibold">Чат</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/50 hover:text-white transition p-1">
            <X size={18} />
          </button>
        )}
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-center text-white/30 text-xs mt-8">
            Сообщений пока нет.<br />Будьте первым!
          </p>
        )}
        {messages.map(m => (
          <div key={m.id} className={`flex flex-col ${m.is_trainer ? 'items-end' : 'items-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
              m.is_trainer
                ? 'bg-rose-600 text-white rounded-br-sm'
                : 'bg-white/12 text-white rounded-bl-sm'
            }`}>
              {!m.is_trainer && (
                <p className="text-[10px] font-semibold text-rose-300 mb-0.5">{m.sender_name}</p>
              )}
              <p className="leading-snug break-words">{m.text}</p>
            </div>
            <p className="text-[9px] text-white/25 mt-0.5 px-1">{fmtTime(m.created_at)}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* input */}
      <div className="px-3 pb-4 pt-2 shrink-0 border-t border-white/10">
        <div className="flex items-end gap-2 bg-white/8 rounded-2xl px-3 py-2 border border-white/15">
          <textarea
            ref={inputRef}
            value={text}
            onChange={e => { setText(e.target.value); autoResize(e) }}
            onKeyDown={handleKey}
            placeholder="Напишите сообщение…"
            rows={1}
            maxLength={500}
            className="flex-1 bg-transparent text-sm text-white placeholder-white/35 resize-none outline-none min-h-[24px] max-h-[80px] leading-snug overflow-y-hidden"
          />
          <button
            onClick={send}
            disabled={!text.trim() || sending}
            className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center text-white disabled:opacity-40 transition active:scale-90 shrink-0 self-end"
          >
            <Send size={14} />
          </button>
        </div>
        <p className="text-[9px] text-white/20 mt-1 text-right">{text.length}/500</p>
      </div>
    </div>
  )
}
