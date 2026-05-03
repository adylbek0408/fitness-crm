import { useEffect, useState } from 'react'

/**
 * Anti-piracy watermark overlay.
 *
 * Two layers of deterrent:
 *   1. A large floating watermark with the user's name that jumps to a new
 *      random position every ~5s. Hard to crop out of a screen recording.
 *   2. A faint, semi-transparent diagonal grid covering the whole player.
 *      Survives most "blur the watermark" attempts because it's everywhere.
 *
 * Pointer-events:none so the watermarks never block player controls.
 * If a recording leaks, the watermark identifies who leaked it.
 */
export default function Watermark({ text }) {
  const [pos, setPos] = useState({ top: '12%', left: '8%' })

  useEffect(() => {
    if (!text) return
    const move = () => {
      setPos({
        top: `${Math.floor(Math.random() * 70) + 5}%`,
        left: `${Math.floor(Math.random() * 60) + 5}%`,
      })
    }
    move()
    const id = setInterval(move, 5000)
    return () => clearInterval(id)
  }, [text])

  if (!text) return null

  // Diagonal grid pattern — repeats the user's name across the player.
  const gridCells = Array.from({ length: 16 })

  return (
    <>
      {/* Layer 1: floating large watermark — visible deterrent */}
      <div
        className="absolute select-none pointer-events-none transition-all duration-700 ease-in-out"
        style={{
          ...pos,
          color: 'rgba(255,255,255,0.45)',
          fontSize: 16,
          fontWeight: 700,
          textShadow: '0 1px 3px rgba(0,0,0,0.7)',
          zIndex: 30,
          whiteSpace: 'nowrap',
          letterSpacing: '0.5px',
        }}
      >
        {text}
      </div>

      {/* Layer 2: faint diagonal grid — survives crops */}
      <div
        className="absolute inset-0 select-none pointer-events-none overflow-hidden"
        style={{ zIndex: 25 }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(4, 1fr)',
            transform: 'rotate(-25deg) scale(1.4)',
            transformOrigin: 'center',
          }}
        >
          {gridCells.map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{
                color: 'rgba(255,255,255,0.08)',
                fontSize: 12,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.3)',
              }}
            >
              {text}
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
