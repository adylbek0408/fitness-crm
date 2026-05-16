import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import api from '../../../api/axios'

const COLLAPSE_CHARS = 350

export default function FeedPostText({ lesson }) {
  const text   = lesson.content || ''
  const isLong = text.length > COLLAPSE_CHARS
  const [expanded, setExpanded] = useState(!isLong)
  const btnRef   = useRef(null)
  const markedRef = useRef(false)

  const markComplete = () => {
    if (markedRef.current) return
    markedRef.current = true
    api.post(`/cabinet/education/lessons/${lesson.id}/progress/`, { position: 0, percent: 100 }).catch(() => {})
  }

  useEffect(() => { if (!isLong) markComplete() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    setExpanded(prev => {
      const next = !prev
      if (next) {
        markComplete()
        setTimeout(() => btnRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50)
      }
      return next
    })
  }

  if (!text) return null

  return (
    <div className="px-3 pb-1">
      <p
        className="text-[13.5px] text-gray-800 leading-relaxed whitespace-pre-wrap"
        style={{ wordBreak: 'break-word' }}
      >
        {expanded ? text : text.slice(0, COLLAPSE_CHARS) + '…'}
      </p>
      {isLong && (
        <button
          ref={btnRef}
          onClick={toggle}
          className="mt-1.5 flex items-center gap-0.5 text-[12px] font-semibold py-1 transition"
          style={{ color: '#e11d48' }}
        >
          {expanded
            ? <><ChevronUp size={13} /> Свернуть</>
            : <><ChevronDown size={13} /> Читать полностью</>}
        </button>
      )}
    </div>
  )
}
