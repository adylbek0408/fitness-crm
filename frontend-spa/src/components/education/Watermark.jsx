import { useEffect, useRef, useState } from 'react'

/**
 * Floating watermark with the viewer's name, repositioned every ~6s.
 * Pointer-events:none so it never blocks the player. Used as the deterrent
 * against screen-recording leaks — if a recording surfaces, we know who.
 */
export default function Watermark({ text }) {
  const [pos, setPos] = useState({ top: '12%', left: '8%' })
  const ref = useRef(null)

  useEffect(() => {
    if (!text) return
    const move = () => {
      const top = `${Math.floor(Math.random() * 70) + 5}%`
      const left = `${Math.floor(Math.random() * 60) + 5}%`
      setPos({ top, left })
    }
    move()
    const id = setInterval(move, 6000)
    return () => clearInterval(id)
  }, [text])

  if (!text) return null
  return (
    <div
      ref={ref}
      className="absolute select-none pointer-events-none transition-all duration-700 ease-in-out"
      style={{
        ...pos,
        color: 'rgba(255,255,255,0.55)',
        fontSize: 14,
        fontWeight: 600,
        textShadow: '0 1px 2px rgba(0,0,0,0.65)',
        zIndex: 30,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  )
}
