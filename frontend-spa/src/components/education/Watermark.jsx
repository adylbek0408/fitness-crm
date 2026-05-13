import { useEffect, useState } from 'react'

/**
 * Anti-piracy watermark.
 *
 * Single floating element that re-positions every 5s.
 *
 * Notes:
 *  - No `mix-blend-mode`: that mode rendered as invisible on bright
 *    backgrounds (e.g. a white gym ceiling) — defeating the whole point.
 *    Plain white text with a strong drop shadow stays visible on any video.
 *  - pointer-events:none so it never blocks player controls.
 *
 * If a recording leaks, the watermark identifies who leaked it.
 */
export default function Watermark({ text }) {
  const [pos, setPos] = useState({ top: '14%', left: '8%' })

  useEffect(() => {
    if (!text) return
    const move = () => {
      setPos({
        top:  `${Math.floor(Math.random() * 70) + 5}%`,
        left: `${Math.floor(Math.random() * 55) + 5}%`,
      })
    }
    move()
    // 12s между прыжками: достаточно, чтобы зрителю было неудобно затирать
    // знак в записи, и достаточно редко, чтобы не дёргать GPU посреди эфира.
    const id = setInterval(move, 12000)
    return () => clearInterval(id)
  }, [text])

  if (!text) return null

  return (
    <div
      className="absolute select-none pointer-events-none"
      style={{
        ...pos,
        color: 'rgba(255,255,255,0.75)',
        fontSize: 14,
        fontWeight: 700,
        // Heavy multi-layer shadow: stays readable on both bright and dark
        // backgrounds. Light shadow on top, dark shadow underneath.
        textShadow: '0 0 4px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.7), 0 0 1px rgba(0,0,0,0.9)',
        zIndex: 32,
        whiteSpace: 'nowrap',
        letterSpacing: '0.3px',
      }}
    >
      {text}
    </div>
  )
}
