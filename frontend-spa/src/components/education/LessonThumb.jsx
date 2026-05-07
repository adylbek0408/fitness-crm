/**
 * LessonThumb — robust lesson cover image with gradient fallback.
 *
 * Behaviour:
 *   - If `src` is a non-empty URL → render <img>.  On load error, swap to
 *     a deterministic gradient + lesson initial letter so the card still
 *     looks intentional.
 *   - If `src` is empty / missing → render gradient placeholder directly.
 *
 * Used in: LessonsList (cabinet), LessonsAdmin, StreamArchive.
 */
import { useState, useEffect } from 'react'
import { Headphones, Play } from 'lucide-react'

const GRADIENTS = [
  ['#fda4af', '#be185d'],   // rose
  ['#c4b5fd', '#7c3aed'],   // violet
  ['#86efac', '#15803d'],   // emerald
  ['#7dd3fc', '#1d4ed8'],   // sky
  ['#fcd34d', '#b45309'],   // amber
  ['#f9a8d4', '#9d174d'],   // pink
]

function pickGradient(seed = '') {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return GRADIENTS[Math.abs(h) % GRADIENTS.length]
}

export default function LessonThumb({
  src = '',
  title = '',
  lessonType = 'video',
  className = '',
}) {
  const [failed, setFailed] = useState(false)

  // Reset failure state if the src changes (e.g. after re-upload).
  useEffect(() => { setFailed(false) }, [src])

  const showImage = src && !failed
  const [c1, c2] = pickGradient(title || 'lesson')
  const initial = (title || 'У').trim().charAt(0).toUpperCase()
  const Icon = lessonType === 'audio' ? Headphones : Play

  if (showImage) {
    return (
      <img
        src={src}
        alt={title}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={`absolute inset-0 w-full h-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      className={`absolute inset-0 w-full h-full flex items-center justify-center ${className}`}
      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
      aria-label={title}
    >
      {/* faint icon in corner */}
      <Icon
        size={28}
        className="absolute top-2 right-2 text-white/35"
        aria-hidden
      />
      {/* big initial in centre */}
      <span
        className="text-white font-black drop-shadow"
        style={{ fontSize: '2.5em', lineHeight: 1, opacity: 0.9 }}
      >
        {initial}
      </span>
    </div>
  )
}
