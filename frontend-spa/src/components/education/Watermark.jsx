import { useEffect, useState } from 'react'

/**
 * Anti-piracy watermark overlay.
 *
 * Three layers:
 *   1. A large floating watermark (name) that moves every 5s — hard to crop out.
 *   2. A faint diagonal grid covering the full player — survives crops.
 *   3. A second floating badge in the OPPOSITE corner — covers both halves.
 *
 * Pointer-events:none so the watermarks never block player controls.
 * CSS mix-blend-mode:overlay makes the text "burn" into the video signal —
 * it looks faint but shows up clearly in any screenshot or screen recording.
 */
export default function Watermark({ text }) {
  const [pos, setPos] = useState({ top: '12%', left: '8%' })
  const [pos2, setPos2] = useState({ top: '65%', left: '55%' })

  useEffect(() => {
    if (!text) return
    const move = () => {
      setPos({
        top:  `${Math.floor(Math.random() * 55) + 5}%`,
        left: `${Math.floor(Math.random() * 45) + 4}%`,
      })
      setPos2({
        top:  `${Math.floor(Math.random() * 55) + 35}%`,
        left: `${Math.floor(Math.random() * 45) + 45}%`,
      })
    }
    move()
    const id = setInterval(move, 5000)
    return () => clearInterval(id)
  }, [text])

  if (!text) return null

  // 24-cell grid: 4 columns × 6 rows, rotated −25° and scaled up so edges are covered.
  const gridCells = Array.from({ length: 24 })

  return (
    <>
      {/* Layer 1a: primary floating watermark */}
      <div
        className="absolute select-none pointer-events-none transition-all duration-700 ease-in-out"
        style={{
          ...pos,
          color: 'rgba(255,255,255,0.55)',
          fontSize: 15,
          fontWeight: 700,
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          zIndex: 32,
          whiteSpace: 'nowrap',
          letterSpacing: '0.4px',
          mixBlendMode: 'overlay',
        }}
      >
        {text}
      </div>

      {/* Layer 1b: second floating watermark in opposite region */}
      <div
        className="absolute select-none pointer-events-none transition-all duration-700 ease-in-out"
        style={{
          ...pos2,
          color: 'rgba(255,255,255,0.45)',
          fontSize: 12,
          fontWeight: 600,
          textShadow: '0 1px 3px rgba(0,0,0,0.75)',
          zIndex: 32,
          whiteSpace: 'nowrap',
          letterSpacing: '0.3px',
          mixBlendMode: 'overlay',
        }}
      >
        {text}
      </div>

      {/* Layer 2: faint diagonal grid — survives crops and zooming in */}
      <div
        className="absolute inset-0 select-none pointer-events-none overflow-hidden"
        style={{ zIndex: 28 }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows:    'repeat(6, 1fr)',
            transform:           'rotate(-25deg) scale(1.55)',
            transformOrigin:     'center',
          }}
        >
          {gridCells.map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{
                color:     'rgba(255,255,255,0.12)',
                fontSize:  11,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                mixBlendMode: 'overlay',
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
