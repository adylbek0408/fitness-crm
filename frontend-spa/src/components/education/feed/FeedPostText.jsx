import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

const COLLAPSE_CHARS = 400

export default function FeedPostText({ lesson }) {
  const text = lesson.content || ''
  const isLong = text.length > COLLAPSE_CHARS
  const [expanded, setExpanded] = useState(!isLong)
  const expandedRef = useRef(null)

  const toggle = () => {
    setExpanded(e => {
      const next = !e
      // Scroll expanded content into view so user sees new text appear
      if (next && expandedRef.current) {
        setTimeout(() => {
          expandedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }, 50)
      }
      return next
    })
  }

  return (
    <div className="px-4 pb-4">
      <div
        className="text-[14px] text-gray-800 leading-relaxed whitespace-pre-wrap"
        style={{ wordBreak: 'break-word' }}
      >
        {expanded ? text : text.slice(0, COLLAPSE_CHARS) + (isLong ? '…' : '')}
      </div>
      {isLong && (
        <button
          ref={expandedRef}
          onClick={toggle}
          className="mt-2 flex items-center gap-1 text-[13px] font-medium text-rose-500 hover:text-rose-700 transition py-1"
        >
          {expanded
            ? <><ChevronUp size={15} /> Свернуть</>
            : <><ChevronDown size={15} /> Читать полностью</>}
        </button>
      )}
    </div>
  )
}
